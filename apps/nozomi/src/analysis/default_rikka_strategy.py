import json
from io import BytesIO
from typing import Any, Literal
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

import pandas as pd
from rikka.analyze import pdr
from rikka.config import FLOORMAP_SCALE, INITIAL_DIRECTION

from src.schemas.analysis import AnalyzeRequest

SensorKind = Literal["acce", "gyro"]
DEFAULT_HTTP_TIMEOUT_SECONDS = 120

SENSOR_COLUMN_ALIASES: dict[SensorKind, dict[str, tuple[str, ...]]] = {
    "acce": {
        "t": ("t", "Time (s)", "time_s", "time_seconds"),
        "x": ("x", "Acceleration x (m/s^2)", "X (m/s^2)", "x(m/s^2)"),
        "y": ("y", "Acceleration y (m/s^2)", "Y (m/s^2)", "y(m/s^2)"),
        "z": ("z", "Acceleration z (m/s^2)", "Z (m/s^2)", "z(m/s^2)"),
    },
    "gyro": {
        "t": ("t", "Time (s)", "time_s", "time_seconds"),
        "x": ("x", "Gyroscope x (rad/s)", "X (rad/s)", "x(rad/s)"),
        "y": ("y", "Gyroscope y (rad/s)", "Y (rad/s)", "y(rad/s)"),
        "z": ("z", "Gyroscope z (rad/s)", "Z (rad/s)", "z(rad/s)"),
    },
}


class DefaultRikkaStrategy:
    name = "default_rikka"

    def run(self, request: AnalyzeRequest) -> None:
        try:
            df_acc = self._download_sensor_csv(request.raw_data_urls.acce, "acce")
            df_gyro = self._download_sensor_csv(request.raw_data_urls.gyro, "gyro")
            result_csv = self._analyze_to_csv(request, df_acc, df_gyro)
            self._upload_result(request.result_upload_url, result_csv)
            self._send_callback(
                request,
                {
                    "trajectory_id": str(request.trajectory_id),
                    "status": "completed",
                    "callback_token": request.callback_token,
                    "result_object_key": self._result_object_key(request),
                },
            )
        except Exception as error:
            self._send_callback(
                request,
                {
                    "trajectory_id": str(request.trajectory_id),
                    "status": "failed",
                    "callback_token": request.callback_token,
                    "error_code": "RIKKA_ANALYSIS_FAILED",
                    "error_message": str(error) or error.__class__.__name__,
                },
            )

    def _download_sensor_csv(
        self,
        url: object,
        sensor_kind: SensorKind,
    ) -> pd.DataFrame:
        with urlopen(str(url), timeout=DEFAULT_HTTP_TIMEOUT_SECONDS) as response:
            if response.status >= 400:
                msg = f"{sensor_kind} download failed with status {response.status}"
                raise RuntimeError(msg)
            csv_bytes = response.read()

        df = pd.read_csv(BytesIO(csv_bytes))
        df = self._normalize_sensor_csv(df, sensor_kind)

        required_columns = {"x", "y", "z"}
        missing_columns = required_columns - set(df.columns)
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            available = ", ".join(str(column) for column in df.columns)
            msg = (
                f"{sensor_kind} csv missing required columns: {missing}; "
                f"available columns: {available}"
            )
            raise ValueError(msg)

        return df

    def _normalize_sensor_csv(
        self,
        df: pd.DataFrame,
        sensor_kind: SensorKind,
    ) -> pd.DataFrame:
        df = df.rename(columns=lambda column: str(column).strip())
        normalized = pd.DataFrame()

        time_column = self._find_column(df, SENSOR_COLUMN_ALIASES[sensor_kind]["t"])
        if time_column is not None:
            normalized["t"] = pd.to_numeric(df[time_column], errors="coerce")
        elif "timestamp_ns" in df.columns:
            timestamp_ns = pd.to_numeric(df["timestamp_ns"], errors="coerce")
            normalized["t"] = (timestamp_ns - timestamp_ns.iloc[0]) / 1_000_000_000
        elif "wall_time_ms" in df.columns:
            wall_time_ms = pd.to_numeric(df["wall_time_ms"], errors="coerce")
            normalized["t"] = (wall_time_ms - wall_time_ms.iloc[0]) / 1_000

        for column_name in ("x", "y", "z"):
            source_column = self._find_column(
                df,
                SENSOR_COLUMN_ALIASES[sensor_kind][column_name],
            )
            if source_column is not None:
                normalized[column_name] = pd.to_numeric(
                    df[source_column],
                    errors="coerce",
                )

        return normalized

    def _find_column(
        self,
        df: pd.DataFrame,
        candidates: tuple[str, ...],
    ) -> str | None:
        for candidate in candidates:
            if candidate in df.columns:
                return candidate
        return None

    def _analyze_to_csv(
        self,
        request: AnalyzeRequest,
        df_acc: pd.DataFrame,
        df_gyro: pd.DataFrame,
    ) -> bytes:
        df_acc, df_gyro = pdr.process_sensor_data(df_acc, df_gyro)
        peaks = pdr.detect_steps(df_acc)
        trajectory, _, t_at_steps = pdr.estimate_trajectory(
            peaks,
            df_gyro,
            df_acc,
            initial_direction=self._initial_direction(request),
        )
        df_trajectory = self._build_result_dataframe(trajectory, t_at_steps)
        start = self._start_constraint(request)
        if start is not None:
            floor_scale = self._floor_scale(request)
            df_trajectory["x"] = float(start.x) + df_trajectory["rikka_x"] / floor_scale
            df_trajectory["y"] = float(start.y) + df_trajectory["rikka_y"] / floor_scale

        csv_text = str(df_trajectory.to_csv(index=False))
        return csv_text.encode("utf-8")

    def _build_result_dataframe(
        self,
        trajectory: list[list[float]],
        t_at_steps: list[float],
    ) -> pd.DataFrame:
        df_trajectory = pd.DataFrame(trajectory, columns=["rikka_x", "rikka_y"])
        df_trajectory.insert(0, "step_index", range(len(df_trajectory)))
        df_trajectory.insert(
            1,
            "rikka_timestamp_s",
            self._result_timestamps(len(df_trajectory), t_at_steps),
        )
        df_trajectory["x"] = df_trajectory["rikka_x"]
        df_trajectory["y"] = df_trajectory["rikka_y"]
        return df_trajectory

    def _result_timestamps(
        self,
        point_count: int,
        t_at_steps: list[float],
    ) -> list[float | None]:
        if point_count != len(t_at_steps) + 1:
            return [None] * point_count
        if not t_at_steps:
            return [None] * point_count

        first_step_time = t_at_steps[0]
        moved_timestamps = [float(t - first_step_time) for t in t_at_steps]
        return [None, *moved_timestamps]

    def _upload_result(self, url: object, result_csv: bytes) -> None:
        upload_request = UrlRequest(
            str(url),
            data=result_csv,
            headers={"content-type": "text/csv"},
            method="PUT",
        )

        with urlopen(
            upload_request,
            timeout=DEFAULT_HTTP_TIMEOUT_SECONDS,
        ) as response:
            if response.status >= 400:
                msg = f"result upload failed with status {response.status}"
                raise RuntimeError(msg)

    def _send_callback(
        self,
        request: AnalyzeRequest,
        payload: dict[str, object],
    ) -> None:
        callback_request = UrlRequest(
            str(request.callback_url),
            data=json.dumps(payload).encode("utf-8"),
            headers={"content-type": "application/json"},
            method="POST",
        )

        with urlopen(
            callback_request,
            timeout=DEFAULT_HTTP_TIMEOUT_SECONDS,
        ) as response:
            if response.status >= 400:
                msg = f"callback failed with status {response.status}"
                raise RuntimeError(msg)

    def _start_constraint(self, request: AnalyzeRequest) -> Any | None:
        for constraint in request.constraints:
            if constraint.point_type == "start":
                return constraint
        return None

    def _initial_direction(self, request: AnalyzeRequest) -> float:
        start = self._start_constraint(request)
        if start is None or start.direction is None:
            return float(INITIAL_DIRECTION)
        return float(start.direction)

    def _floor_scale(self, request: AnalyzeRequest) -> float:
        if request.floor_scale is None:
            return float(FLOORMAP_SCALE)
        return float(request.floor_scale)

    def _result_object_key(self, request: AnalyzeRequest) -> str:
        return f"trajectories/{request.trajectory_id}/analyzed/result.csv"
