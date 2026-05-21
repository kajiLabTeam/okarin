import asyncio

import pytest
from fastapi import BackgroundTasks

from src.schemas.analysis import AnalyzeRequest
from src.usecases.submit_analysis import submit_analysis


def valid_analyze_request() -> AnalyzeRequest:
    return AnalyzeRequest.model_validate(
        {
            "trajectory_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
            "recording_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
            "floor_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "constraints": [
                {
                    "seq": 0,
                    "point_type": "start",
                    "x": 12.34,
                    "y": 56.78,
                    "direction": 90.0,
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


def test_submit_analysis_registers_background_runner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = valid_analyze_request()
    background_tasks = BackgroundTasks()
    calls: list[AnalyzeRequest] = []

    class StubStrategy:
        name = "default_rikka"

        def run(self, request: AnalyzeRequest) -> None:
            calls.append(request)

    monkeypatch.setattr(
        "src.usecases.submit_analysis.get_analysis_strategy",
        lambda: StubStrategy(),
    )

    response = submit_analysis(payload, background_tasks)

    assert str(response.trajectory_id) == str(payload.trajectory_id)
    assert response.status == "accepted"
    assert len(background_tasks.tasks) == 1

    for task in background_tasks.tasks:
        asyncio.run(task())

    assert calls == [payload]
