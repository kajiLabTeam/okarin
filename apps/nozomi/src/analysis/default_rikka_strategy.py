import json
from typing import Any, Literal
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

import pandas as pd
from rikka import legacy_analysis

from src.schemas.analysis import AnalyzeRequest

SensorKind = Literal["acce", "gyro"]
DEFAULT_HTTP_TIMEOUT_SECONDS = 120


class DefaultRikkaStrategy:
    name = "default_rikka"

    def run(self, request: AnalyzeRequest) -> None:
        try:
            inputs = {
                "acce": self._download(request.raw_data_urls.acce, "acce"),
                "gyro": self._download(request.raw_data_urls.gyro, "gyro"),
            }
            if request.raw_data_urls.metadata is not None:
                inputs["metadata"] = self._download(
                    request.raw_data_urls.metadata, "metadata"
                )
            result_csv = legacy_analysis.analyze_to_csv(
                inputs, self._parameters(request)
            )
            self._upload_result(request.result_upload_url, result_csv)
            self._send_callback(
                request,
                {
                    "trajectory_id": str(request.trajectory_id),
                    "status": "completed",
                    "callback_token": request.callback_token,
                    "result_object_key": request.result_object_key,
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

    def _download(self, url: object, name: str) -> bytes:
        with urlopen(str(url), timeout=DEFAULT_HTTP_TIMEOUT_SECONDS) as response:
            if response.status >= 400:
                raise RuntimeError(
                    f"{name} download failed with status {response.status}"
                )
            return bytes(response.read())

    def _parameters(self, request: AnalyzeRequest) -> dict[str, Any]:
        start = next((c for c in request.constraints if c.point_type == "start"), None)
        return {
            "initial_direction": None if start is None else start.direction,
            "origin_x": None if start is None else start.x,
            "origin_y": None if start is None else start.y,
            "floor_scale": request.floor_scale,
        }

    def _normalize_sensor_csv(
        self,
        df: pd.DataFrame,
        sensor_kind: SensorKind,
        recording_start_wall_time_ms: float | None = None,
    ) -> pd.DataFrame:
        return legacy_analysis.normalize_sensor_csv(
            df, sensor_kind, recording_start_wall_time_ms
        )

    def _analyze_to_csv(
        self,
        request: AnalyzeRequest,
        df_acc: pd.DataFrame,
        df_gyro: pd.DataFrame,
    ) -> bytes:
        return legacy_analysis.analyze_to_csv(
            {
                "acce": df_acc.to_csv(index=False).encode(),
                "gyro": df_gyro.to_csv(index=False).encode(),
            },
            self._parameters(request),
        )

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
