import importlib
import json
import math
from io import BytesIO
from typing import Any, Protocol, cast
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

import pandas as pd

from src.schemas.analysis import StayHeatmapAnalyzeRequest, StayHeatmapTrajectory

HTTP_TIMEOUT_SECONDS = 120
ERROR_MESSAGES = {
    "TRAJECTORY_DOWNLOAD_FAILED": "trajectory download failed",
    "INVALID_TRAJECTORY_CSV": "input validation failed",
    "ANALYSIS_PROCESSING_FAILED": "analysis processing failed",
    "ARTIFACT_UPLOAD_FAILED": "artifact upload failed",
}


class InvalidTrajectoryCsvError(ValueError):
    pass


class StayHeatmapAnalyzer(Protocol):
    def enrich_and_aggregate(
        self,
        dataframe: pd.DataFrame,
        request: StayHeatmapAnalyzeRequest,
        trajectory: StayHeatmapTrajectory,
    ) -> tuple[pd.DataFrame, list[dict[str, int]]]: ...


class RikkaStayHeatmapAnalyzer:
    """Rikkaの滞在分析公開APIをNozomiから隔離するadapter。"""

    def enrich_and_aggregate(
        self,
        dataframe: pd.DataFrame,
        request: StayHeatmapAnalyzeRequest,
        trajectory: StayHeatmapTrajectory,
    ) -> tuple[pd.DataFrame, list[dict[str, int]]]:
        try:
            module = importlib.import_module("rikka.stay_analysis")
        except ImportError as error:
            raise RuntimeError("rikka stay analysis API is not installed") from error

        enriched = module.enrich_trajectory(
            dataframe,
            speed_threshold_mps=request.parameters.speed_threshold_mps,
        )
        cells = module.aggregate_trajectory_grid(
            enriched,
            map_width_px=request.floor.map_width_px,
            map_height_px=request.floor.map_height_px,
            floor_scale=request.floor.scale_m_per_px,
            grid_size_m=request.parameters.grid_size_m,
            start_x_px=trajectory.start.x_px,
            start_y_px=trajectory.start.y_px,
        )
        return enriched, cells


def get_stay_heatmap_analyzer() -> StayHeatmapAnalyzer:
    return RikkaStayHeatmapAnalyzer()


class StayHeatmapRunner:
    def __init__(self, analyzer: StayHeatmapAnalyzer) -> None:
        self.analyzer = analyzer

    def run(self, request: StayHeatmapAnalyzeRequest) -> None:
        try:
            trajectories: list[dict[str, Any]] = []
            for trajectory in request.trajectories:
                dataframe = self._download_csv(trajectory)
                enriched, cells = self._analyze(dataframe, request, trajectory)
                self._upload(
                    trajectory.output.upload_url,
                    self._serialize_csv(enriched),
                    "text/csv; charset=utf-8",
                )
                trajectories.append(
                    {"trajectory_id": str(trajectory.trajectory_id), "cells": cells}
                )

            self._upload(
                request.heatmap_output.upload_url,
                self._serialize_heatmap(request, trajectories),
                "application/json",
            )
            self._callback(request, {"status": "completed"})
        except Exception as error:
            code = self._error_code(error)
            self._callback(
                request,
                {
                    "status": "failed",
                    "error_code": code,
                    "error_message": ERROR_MESSAGES[code],
                },
            )

    def _download_csv(self, trajectory: StayHeatmapTrajectory) -> pd.DataFrame:
        try:
            with urlopen(
                str(trajectory.source.download_url), timeout=HTTP_TIMEOUT_SECONDS
            ) as response:
                if response.status >= 400:
                    raise RuntimeError(f"download failed with status {response.status}")
                return pd.read_csv(BytesIO(response.read()))
        except (ValueError, pd.errors.ParserError) as error:
            raise InvalidTrajectoryCsvError("input CSV is invalid") from error
        except Exception as error:
            raise ConnectionError("trajectory download failed") from error

    def _analyze(
        self,
        dataframe: pd.DataFrame,
        request: StayHeatmapAnalyzeRequest,
        trajectory: StayHeatmapTrajectory,
    ) -> tuple[pd.DataFrame, list[dict[str, int]]]:
        try:
            return self.analyzer.enrich_and_aggregate(dataframe, request, trajectory)
        except ValueError as error:
            raise InvalidTrajectoryCsvError("input CSV validation failed") from error

    def _serialize_csv(self, dataframe: pd.DataFrame) -> bytes:
        output = dataframe.copy()
        output["speed_mps"] = output["speed_mps"].map(
            lambda value: "" if pd.isna(value) else f"{float(value):.6f}"
        )
        output["is_stay"] = output["is_stay"].map(
            lambda value: "true" if bool(value) else "false"
        )
        csv_text = cast(str, output.to_csv(index=False, lineterminator="\n"))
        return csv_text.encode("utf-8")

    def _serialize_heatmap(
        self,
        request: StayHeatmapAnalyzeRequest,
        trajectories: list[dict[str, Any]],
    ) -> bytes:
        floor = request.floor
        grid_size = request.parameters.grid_size_m
        artifact = {
            "schema_version": "1.0",
            "definition_version": request.definition_version,
            "parameters": request.parameters.model_dump(),
            "floor_map": {
                "width_px": floor.map_width_px,
                "height_px": floor.map_height_px,
                "scale_m_per_px": floor.scale_m_per_px,
            },
            "grid": {
                "size_m": grid_size,
                "column_count": math.ceil(
                    floor.map_width_px * floor.scale_m_per_px / grid_size
                ),
                "row_count": math.ceil(
                    floor.map_height_px * floor.scale_m_per_px / grid_size
                ),
            },
            "input_trajectory_count": len(trajectories),
            "trajectories": trajectories,
        }
        return json.dumps(artifact, ensure_ascii=False, separators=(",", ":")).encode()

    def _upload(self, url: object, body: bytes, content_type: str) -> None:
        try:
            upload = UrlRequest(
                str(url),
                data=body,
                headers={"content-type": content_type},
                method="PUT",
            )
            with urlopen(upload, timeout=HTTP_TIMEOUT_SECONDS) as response:
                if response.status >= 400:
                    raise RuntimeError(f"upload failed with status {response.status}")
        except Exception as error:
            raise OSError("artifact upload failed") from error

    def _callback(
        self, request: StayHeatmapAnalyzeRequest, result: dict[str, object]
    ) -> None:
        payload = {
            "analysis_run_id": str(request.analysis_run_id),
            **result,
            "callback_token": request.callback.token,
        }
        callback = UrlRequest(
            str(request.callback.url),
            data=json.dumps(payload).encode(),
            headers={"content-type": "application/json"},
            method="POST",
        )
        with urlopen(callback, timeout=HTTP_TIMEOUT_SECONDS) as response:
            if response.status >= 400:
                raise RuntimeError(f"callback failed with status {response.status}")

    def _error_code(self, error: Exception) -> str:
        if isinstance(error, ConnectionError):
            return "TRAJECTORY_DOWNLOAD_FAILED"
        if isinstance(error, InvalidTrajectoryCsvError):
            return "INVALID_TRAJECTORY_CSV"
        if isinstance(error, OSError):
            return "ARTIFACT_UPLOAD_FAILED"
        return "ANALYSIS_PROCESSING_FAILED"


def get_stay_heatmap_runner() -> StayHeatmapRunner:
    return StayHeatmapRunner(get_stay_heatmap_analyzer())
