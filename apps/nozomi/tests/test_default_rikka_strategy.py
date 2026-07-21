import json
from typing import Any

import numpy as np
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

    process_sensor_data_calls: list[tuple[pd.DataFrame, pd.DataFrame]] = []

    def fake_process_sensor_data(
        df_acc: pd.DataFrame, df_gyro: pd.DataFrame
    ) -> tuple[pd.DataFrame, pd.DataFrame]:
        process_sensor_data_calls.append((df_acc, df_gyro))
        return df_acc, df_gyro

    monkeypatch.setattr("src.analysis.default_rikka_strategy.urlopen", fake_urlopen)
    monkeypatch.setattr(
        "src.analysis.default_rikka_strategy.pdr.process_sensor_data",
        fake_process_sensor_data,
    )
    monkeypatch.setattr(
        "src.analysis.default_rikka_strategy.pdr.detect_steps",
        lambda _df_acc: np.array([0]),
    )
    monkeypatch.setattr(
        "src.analysis.default_rikka_strategy.pdr.estimate_trajectory",
        lambda *_args, **_kwargs: ([[0.0, 0.0], [1.5, 2.5]], [], [10.0]),
    )

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
            "trajectories/dddddddd-dddd-dddd-dddd-dddddddddddd/analyzed/result.csv"
        ),
    }
    assert list(process_sensor_data_calls[0][0].columns) == ["t", "x", "y", "z"]
    assert list(process_sensor_data_calls[0][1].columns) == ["t", "x", "y", "z"]


def test_default_rikka_strategy_falls_back_to_rikka_floor_scale(
    monkeypatch: Any,
) -> None:
    request = valid_analyze_request()
    request.floor_scale = None
    monkeypatch.setattr(
        "src.analysis.default_rikka_strategy.pdr.process_sensor_data",
        lambda df_acc, df_gyro: (df_acc, df_gyro),
    )
    monkeypatch.setattr(
        "src.analysis.default_rikka_strategy.pdr.detect_steps",
        lambda _df_acc: np.array([0]),
    )
    monkeypatch.setattr(
        "src.analysis.default_rikka_strategy.pdr.estimate_trajectory",
        lambda *_args, **_kwargs: ([[0.0, 0.0], [1.0, 1.0]], [], [10.0]),
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
