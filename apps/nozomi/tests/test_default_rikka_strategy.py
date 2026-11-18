import json
from io import BytesIO
from typing import Any

import pandas as pd

from src.analysis.default_rikka_strategy import DefaultRikkaStrategy
from src.schemas.analysis import AnalyzeRequest


def valid_analyze_request() -> AnalyzeRequest:
    return AnalyzeRequest.model_validate(
        {
            "trajectory_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
            "recording_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
            "floor_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "floor_scale": 0.5,
            "constraints": [
                {
                    "seq": 0,
                    "point_type": "start",
                    "x": 10.0,
                    "y": 20.0,
                    "direction": 45.0,
                }
            ],
            "raw_data_urls": {
                "acce": "https://object-storage.example.com/acce.csv",
                "gyro": "https://object-storage.example.com/gyro.csv",
            },
            "result_upload_url": "https://object-storage.example.com/result.csv",
            "result_object_key": (
                "organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/trajectories/"
                "dddddddd-dddd-dddd-dddd-dddddddddddd/analyzed/result.csv"
            ),
            "callback_url": "https://mediator.example.com/api/trajectories/callback",
            "callback_token": "signed-callback-token",
        }
    )


class StubResponse:
    def __init__(self, body: bytes = b"", status: int = 200) -> None:
        self.body = body
        self.status = status

    def __enter__(self) -> StubResponse:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self) -> bytes:
        return self.body


def test_default_rikka_strategy_runs_pdr_uploads_result_and_marks_completed(
    monkeypatch: Any,
) -> None:
    acce_csv = (
        b"Time (s),Acceleration x (m/s^2),Acceleration y (m/s^2),"
        b"Acceleration z (m/s^2)\n0,1,2,3\n"
    )
    gyro_csv = (
        b"Time (s),Gyroscope x (rad/s),Gyroscope y (rad/s),"
        b"Gyroscope z (rad/s)\n0,0.1,0.2,0.3\n"
    )
    calls: list[tuple[str, str, bytes | None, int]] = []

    def fake_urlopen(request: Any, timeout: int) -> StubResponse:
        url = request.full_url if hasattr(request, "full_url") else str(request)
        method = request.get_method() if hasattr(request, "get_method") else "GET"
        data = getattr(request, "data", None)
        calls.append((url, method, data, timeout))

        if url.endswith("acce.csv"):
            return StubResponse(acce_csv)
        if url.endswith("gyro.csv"):
            return StubResponse(gyro_csv)
        return StubResponse()

    pdr_calls: list[tuple[str, dict[str, bytes], dict[str, Any]]] = []

    def fake_execute_method(
        method_id: str, inputs: dict[str, bytes], parameters: dict[str, Any]
    ) -> dict[str, Any]:
        pdr_calls.append((method_id, inputs, parameters))
        return {
            "trajectory": {
                "points": [
                    {"x": 0.0, "y": 0.0, "timestamp_s": None},
                    {"x": 1.5, "y": 2.5, "timestamp_s": 10.0},
                ]
            }
        }

    monkeypatch.setattr("src.analysis.default_rikka_strategy.urlopen", fake_urlopen)
    monkeypatch.setattr("rikka.analysis_api.execute_method", fake_execute_method)

    DefaultRikkaStrategy().run(valid_analyze_request())

    assert calls[0] == (
        "https://object-storage.example.com/acce.csv",
        "GET",
        None,
        120,
    )
    assert calls[1] == (
        "https://object-storage.example.com/gyro.csv",
        "GET",
        None,
        120,
    )
    assert calls[2][0] == "https://object-storage.example.com/result.csv"
    assert calls[2][1] == "PUT"
    assert calls[2][2] == (
        b"step_index,rikka_timestamp_s,rikka_x,rikka_y,x,y\n"
        b"0,,0.0,0.0,10.0,20.0\n"
        b"1,0.0,1.5,2.5,13.0,25.0\n"
    )
    assert calls[3][0] == "https://mediator.example.com/api/trajectories/callback"
    assert calls[3][1] == "POST"
    assert calls[3][2] is not None
    assert json.loads(calls[3][2].decode("utf-8")) == {
        "trajectory_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "status": "completed",
        "callback_token": "signed-callback-token",
        "result_object_key": (
            "organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/trajectories/"
            "dddddddd-dddd-dddd-dddd-dddddddddddd/analyzed/result.csv"
        ),
    }
    method_id, inputs, parameters = pdr_calls[0]
    assert method_id == "pdr"
    assert parameters == {"initial_direction": 45.0}
    assert list(pd.read_csv(BytesIO(inputs["acce"])).columns) == ["t", "x", "y", "z"]
    assert list(pd.read_csv(BytesIO(inputs["gyro"])).columns) == ["t", "x", "y", "z"]
    assert json.loads(inputs["metadata"]) == {"recording_start_wall_time_ms": 0}


def test_default_rikka_strategy_falls_back_to_rikka_floor_scale(
    monkeypatch: Any,
) -> None:
    request = valid_analyze_request()
    request.floor_scale = None
    monkeypatch.setattr(
        "rikka.analysis_api.execute_method",
        lambda *_args, **_kwargs: {
            "trajectory": {
                "points": [
                    {"x": 0.0, "y": 0.0, "timestamp_s": None},
                    {"x": 1.0, "y": 1.0, "timestamp_s": 10.0},
                ]
            }
        },
    )

    result_csv = DefaultRikkaStrategy()._analyze_to_csv(
        request,
        pd.DataFrame({"t": [0.0], "x": [0.0], "y": [0.0], "z": [0.0]}),
        pd.DataFrame({"t": [0.0], "x": [0.0], "y": [0.0], "z": [0.0]}),
    )

    assert result_csv == (
        b"step_index,rikka_timestamp_s,rikka_x,rikka_y,x,y\n"
        b"0,,0.0,0.0,10.0,20.0\n"
        b"1,0.0,1.0,1.0,110.0,120.0\n"
    )


def test_default_rikka_strategy_normalizes_mobile_sensor_headers() -> None:
    strategy = DefaultRikkaStrategy()
    acce_df = pd.DataFrame(
        {
            "timestamp_ns": [1_000_000_000, 1_020_000_000],
            "wall_time_ms": [10_000, 10_020],
            "x(m/s^2)": [1.0, 1.1],
            "y(m/s^2)": [2.0, 2.1],
            "z(m/s^2)": [3.0, 3.1],
        }
    )
    gyro_df = pd.DataFrame(
        {
            "timestamp_ns": [1_000_000_000, 1_020_000_000],
            "wall_time_ms": [10_000, 10_020],
            "x(rad/s)": [0.1, 0.11],
            "y(rad/s)": [0.2, 0.21],
            "z(rad/s)": [0.3, 0.31],
        }
    )

    normalized_acce = strategy._normalize_sensor_csv(acce_df, "acce")
    normalized_gyro = strategy._normalize_sensor_csv(gyro_df, "gyro")

    assert list(normalized_acce.columns) == ["t", "x", "y", "z"]
    assert list(normalized_gyro.columns) == ["t", "x", "y", "z"]
    assert normalized_acce.to_dict("list") == {
        "t": [0.0, 0.02],
        "x": [1.0, 1.1],
        "y": [2.0, 2.1],
        "z": [3.0, 3.1],
    }
    assert normalized_gyro.to_dict("list") == {
        "t": [0.0, 0.02],
        "x": [0.1, 0.11],
        "y": [0.2, 0.21],
        "z": [0.3, 0.31],
    }


def test_legacy_metadata_offset_and_timestamp_origin(monkeypatch: Any) -> None:
    from rikka import legacy_analysis

    calls = []

    def execute(
        method_id: str, inputs: dict[str, bytes], parameters: dict[str, Any]
    ) -> dict[str, Any]:
        calls.append((method_id, inputs, parameters))
        return {
            "trajectory": {
                "points": [
                    {"x": 0.0, "y": 0.0, "timestamp_s": None},
                    {"x": 1.0, "y": 1.0, "timestamp_s": 5.0},
                    {"x": 2.0, "y": 2.0, "timestamp_s": 6.5},
                ]
            }
        }

    monkeypatch.setattr("rikka.analysis_api.execute_method", execute)
    sensor = (
        b"timestamp_ns,wall_time_ms,x,y,z\n"
        b"1000000000,12000,0,0,0\n1020000000,12020,0,0,0\n"
    )
    result = legacy_analysis.analyze_to_csv(
        {
            "acce": sensor,
            "gyro": sensor,
            "metadata": b'{"recording_start_wall_time_ms":10000}',
        },
        {},
    )
    assert pd.read_csv(BytesIO(calls[0][1]["acce"]))["t"].tolist() == [2.0, 2.02]
    assert calls[0][2] == {"initial_direction": 90.0}
    assert result == (
        b"step_index,rikka_timestamp_s,rikka_x,rikka_y,x,y\n"
        b"0,,0.0,0.0,0.0,0.0\n"
        b"1,0.0,1.0,1.0,1.0,1.0\n"
        b"2,1.5,2.0,2.0,2.0,2.0\n"
    )
