import json
from io import BytesIO
from typing import Any, Literal
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

import pandas as pd
from rikka.analyze import pdr
from rikka.config import INITIAL_DIRECTION

from src.schemas.analysis import AnalyzeRequest

SensorKind = Literal["acce", "gyro"]
DEFAULT_HTTP_TIMEOUT_SECONDS = 120


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
        rename_map = pdr.ACC_COLUMNS if sensor_kind == "acce" else pdr.GYRO_COLUMNS
        df = df.rename(columns=rename_map)

        required_columns = {"x", "y", "z"}
        missing_columns = required_columns - set(df.columns)
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            msg = f"{sensor_kind} csv missing required columns: {missing}"
            raise ValueError(msg)

        return df

    def _analyze_to_csv(
        self,
        request: AnalyzeRequest,
        df_acc: pd.DataFrame,
        df_gyro: pd.DataFrame,
    ) -> bytes:
        df_acc, df_gyro = pdr.process_sensor_data(df_acc, df_gyro)
        peaks = pdr.detect_steps(df_acc)
        trajectory, _, _ = pdr.estimate_trajectory(
            peaks,
            df_gyro,
            df_acc,
            initial_direction=self._initial_direction(request),
        )
        df_trajectory = pd.DataFrame(trajectory, columns=["x", "y"])
        start = self._start_constraint(request)
        if start is not None:
            df_trajectory["x"] = df_trajectory["x"] + float(start.x)
            df_trajectory["y"] = df_trajectory["y"] + float(start.y)

        csv_text = str(df_trajectory.to_csv(index=False))
        return csv_text.encode("utf-8")

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

    def _result_object_key(self, request: AnalyzeRequest) -> str:
        return f"trajectories/{request.trajectory_id}/analyzed/result.csv"
