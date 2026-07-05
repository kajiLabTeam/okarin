import json
from typing import Any

from src.analysis.default_rikka_strategy import DefaultRikkaStrategy
from src.schemas.analysis import AnalyzeRequest


def valid_analyze_request() -> AnalyzeRequest:
    return AnalyzeRequest.model_validate(
        {
            "trajectory_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
            "recording_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
            "floor_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
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
    status = 200

    def __enter__(self) -> StubResponse:
        return self

    def __exit__(self, *args: object) -> None:
        return None


def test_default_rikka_strategy_marks_request_failed_until_analysis_is_implemented(
    monkeypatch: Any,
) -> None:
    calls: list[tuple[str, dict[str, object], int]] = []

    def fake_urlopen(request: Any, timeout: int) -> StubResponse:
        body = json.loads(request.data.decode("utf-8"))
        calls.append((request.full_url, body, timeout))
        return StubResponse()

    monkeypatch.setattr("src.analysis.default_rikka_strategy.urlopen", fake_urlopen)

    DefaultRikkaStrategy().run(valid_analyze_request())

    assert calls == [
        (
            "https://mediator.example.com/api/trajectories/callback",
            {
                "trajectory_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
                "status": "failed",
                "callback_token": "signed-callback-token",
                "error_code": "NOZOMI_ANALYSIS_NOT_IMPLEMENTED",
                "error_message": "default rikka analysis is not implemented",
            },
            10,
        )
    ]
