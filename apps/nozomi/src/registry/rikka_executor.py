from __future__ import annotations

import json
import math
import struct
import tempfile
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd
from rikka.ble.pipeline import run_ble_ranging_input
from rikka.common.lib.models import FloorMap, Landmark, TrajectoryResult
from rikka.common.settings import (
    BleLandmarkSettings,
    HeadingSettings,
    ParticleSettings,
    PdrSettings,
    StepSettings,
)
from rikka.particle.pipeline import run_particle
from rikka.pdr.pipeline import run_pdr

from src.registry.catalog import initial_catalog
from src.schemas.pipeline import ComponentContract
from src.usecases.pipeline_execution import PermanentComponentError

SENSOR_COLUMN_ALIASES: dict[str, dict[str, tuple[str, ...]]] = {
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


def _find_column(dataframe: pd.DataFrame, candidates: tuple[str, ...]) -> str | None:
    return next((candidate for candidate in candidates if candidate in dataframe), None)


def _sensor_dataframe(content: bytes, sensor_kind: str) -> pd.DataFrame:
    try:
        source = pd.read_csv(BytesIO(content)).rename(
            columns=lambda column: str(column).strip()
        )
    except Exception as exc:
        raise PermanentComponentError(
            f"{sensor_kind} input is not a readable CSV"
        ) from exc

    normalized = pd.DataFrame()
    time_column = _find_column(source, SENSOR_COLUMN_ALIASES[sensor_kind]["t"])
    if time_column is not None:
        normalized["t"] = pd.to_numeric(source[time_column], errors="coerce")
    elif "timestamp_ns" in source:
        timestamps = pd.to_numeric(source["timestamp_ns"], errors="coerce")
        normalized["t"] = (timestamps - timestamps.iloc[0]) / 1_000_000_000
    elif "wall_time_ms" in source:
        timestamps = pd.to_numeric(source["wall_time_ms"], errors="coerce")
        normalized["t"] = (timestamps - timestamps.iloc[0]) / 1_000

    for axis in ("x", "y", "z"):
        column = _find_column(source, SENSOR_COLUMN_ALIASES[sensor_kind][axis])
        if column is not None:
            normalized[axis] = pd.to_numeric(source[column], errors="coerce")

    missing = {"x", "y", "z"} - set(normalized)
    if missing:
        raise PermanentComponentError(
            f"{sensor_kind} input is missing columns: {', '.join(sorted(missing))}"
        )
    return normalized


def _png_dimensions(content: bytes) -> tuple[int, int]:
    if len(content) < 24 or content[:8] != b"\x89PNG\r\n\x1a\n":
        raise PermanentComponentError("floor_map input is not a valid PNG")
    width, height = struct.unpack(">II", content[16:24])
    if width == 0 or height == 0:
        raise PermanentComponentError("floor_map dimensions must be positive")
    return width, height


def _landmarks(content: bytes, map_dimensions: tuple[int, int]) -> tuple[Landmark, ...]:
    try:
        document = json.loads(content)
        rows = document["beacons"] if isinstance(document, dict) else document
        if not isinstance(rows, list) or not rows:
            raise ValueError("beacons must be a non-empty array")
        width, height = map_dimensions
        landmarks: list[Landmark] = []
        beacon_ids: set[str] = set()
        for row in rows:
            beacon_id = str(row["beacon_id"])
            pixel_x = float(row["pixel_x"])
            pixel_y = float(row["pixel_y"])
            position_sigma = (
                None
                if row.get("position_sigma_m") is None
                else float(row["position_sigma_m"])
            )
            heading = (
                None if row.get("heading_deg") is None else float(row["heading_deg"])
            )
            if not beacon_id or beacon_id in beacon_ids:
                raise ValueError("beacon_id must be non-empty and unique")
            if not all(math.isfinite(value) for value in (pixel_x, pixel_y)):
                raise ValueError("beacon coordinates must be finite")
            if not (0 <= pixel_x < width and 0 <= pixel_y < height):
                raise ValueError("beacon coordinates must be inside the floor map")
            if position_sigma is not None and (
                not math.isfinite(position_sigma) or position_sigma <= 0
            ):
                raise ValueError("position_sigma_m must be a finite positive number")
            if heading is not None and (
                not math.isfinite(heading) or not 0 <= heading <= 360
            ):
                raise ValueError("heading_deg must be between 0 and 360")
            beacon_ids.add(beacon_id)
            landmarks.append(
                Landmark(
                    beacon_id=beacon_id,
                    pixel_x=pixel_x,
                    pixel_y=pixel_y,
                    position_sigma_m=position_sigma,
                    heading_deg=heading,
                )
            )
        return tuple(landmarks)
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise PermanentComponentError("beacon_layout input is invalid") from exc


def _trajectory_payload(result: TrajectoryResult, component_id: str) -> dict[str, Any]:
    timestamps: list[float | None] = [None, *map(float, result.t_at_steps)]
    if len(timestamps) != len(result.trajectory):
        timestamps = [None] * len(result.trajectory)
    points = [
        {
            "step_index": index,
            "timestamp_s": timestamps[index],
            "x": float(point[0]),
            "y": float(point[1]),
        }
        for index, point in enumerate(result.trajectory)
    ]
    return {
        "schema_version": "1",
        "coordinate_system": "local_meter",
        "component_id": component_id,
        "points": points,
        "step_count": max(0, len(points) - 1),
        "landmark_correction_count": (
            0 if result.landmark is None else len(result.landmark.corrections)
        ),
    }


class RikkaComponentExecutor:
    """Adapter from Nozomi's component contract to Rikka's public pipelines."""

    _SUPPORTED_IDS = {
        "rikka-pdr",
        "rikka-pdr-particle-filter",
        "rikka-pdr-ble",
        "rikka-pdr-particle-filter-ble",
    }

    def capabilities(self) -> tuple[ComponentContract, ...]:
        return tuple(
            definition.components[0]
            for definition in initial_catalog()
            if definition.components[0].component_id in self._SUPPORTED_IDS
        )

    def execute(
        self,
        component: ComponentContract,
        inputs: dict[str, Any],
        parameters: dict[str, Any],
    ) -> dict[str, Any]:
        if component.component_id not in self._SUPPORTED_IDS:
            raise PermanentComponentError(
                f"unsupported Rikka component: {component.component_id}"
            )
        if not all(isinstance(value, bytes) for value in inputs.values()):
            raise PermanentComponentError("Rikka inputs must be downloaded bytes")

        acce = _sensor_dataframe(inputs["acce"], "acce")
        gyro = _sensor_dataframe(inputs["gyro"], "gyro")
        uses_particle = "particle-filter" in component.component_id
        uses_ble = component.component_id.endswith("-ble")

        with tempfile.TemporaryDirectory(prefix="nozomi-rikka-") as directory:
            temporary = Path(directory)
            floor_map: FloorMap | None = None
            if uses_particle or uses_ble:
                floor_path = temporary / "floor-map.png"
                floor_path.write_bytes(inputs["floor_map"])
                map_dimensions = _png_dimensions(inputs["floor_map"])
                origin = (
                    int(parameters["origin_x"]),
                    int(parameters["origin_y"]),
                )
                if not (
                    0 <= origin[0] < map_dimensions[0]
                    and 0 <= origin[1] < map_dimensions[1]
                ):
                    raise PermanentComponentError(
                        "floor map origin must be inside the image"
                    )
                floor_map = FloorMap(
                    path=str(floor_path),
                    origin_px=origin,
                    scale=float(parameters["floor_scale"]),
                )

            landmark_settings = BleLandmarkSettings(enabled=False)
            ranging = None
            if uses_ble:
                ble_path = temporary / "ble.csv"
                ble_path.write_bytes(inputs["ble"])
                landmark_settings = BleLandmarkSettings(
                    enabled=True,
                    data_path=ble_path,
                    rssi_threshold_dbm=float(
                        parameters.get("rssi_threshold_dbm", -70.0)
                    ),
                    landmarks=_landmarks(inputs["beacon_layout"], map_dimensions),
                )
                ranging = run_ble_ranging_input(landmark_settings)

            pdr_settings = PdrSettings(
                step=StepSettings(
                    height_m=float(parameters.get("user_height_m", 1.68))
                ),
                heading=HeadingSettings(
                    initial_direction=float(parameters.get("initial_direction", 90.0))
                ),
                landmark=(
                    landmark_settings
                    if uses_ble and not uses_particle
                    else BleLandmarkSettings(enabled=False)
                ),
            )
            pdr_result = run_pdr(
                pdr_settings,
                df_acc=acce,
                df_gyro=gyro,
                floormap=(floor_map if uses_ble and not uses_particle else None),
            )

            result = pdr_result
            if uses_particle:
                assert floor_map is not None
                particle_settings = ParticleSettings(
                    floormap_path=floor_map.path,
                    origin_px=floor_map.origin_px,
                    scale=floor_map.scale,
                    seed=(
                        None
                        if parameters.get("particle_seed") is None
                        else int(parameters["particle_seed"])
                    ),
                    count=int(parameters.get("particle_count", 500)),
                )
                result = run_particle(
                    pdr_result.prepared,
                    floor_map,
                    particle_settings,
                    detections=(None if ranging is None else ranging.detections),
                    ranging_observations=(
                        None if ranging is None else ranging.observations
                    ),
                    landmark_settings=(landmark_settings if uses_ble else None),
                )

        return {"trajectory": _trajectory_payload(result, component.component_id)}
