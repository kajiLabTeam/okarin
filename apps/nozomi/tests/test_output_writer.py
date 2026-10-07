from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from src.usecases.pipeline_execution import HttpOutputWriter

CONTRACT_PATH = (
    Path(__file__).parents[3]
    / "contracts"
    / "kaede-nozomi"
    / "trajectory-analysis.json"
)


class StubResponse:
    status = 200

    def __enter__(self) -> StubResponse:
        return self

    def __exit__(self, *args: object) -> None:
        return None


def test_http_output_writer_uploads_kaede_compatible_csv(monkeypatch: Any) -> None:
    calls: list[Any] = []

    def fake_open(request: Any, timeout: int) -> StubResponse:
        calls.append(request)
        return StubResponse()

    opener = type("Opener", (), {"open": staticmethod(fake_open)})()
    monkeypatch.setattr(
        "src.usecases.pipeline_execution.build_opener", lambda *_args: opener
    )

    reference = HttpOutputWriter().write(
        "http://seaweedfs:8333/trajectory/analyzed/result.csv",
        {
            "trajectory": {
                "points": [
                    {"step_index": 0, "timestamp_s": None, "x": 10.0, "y": 20.0},
                    {"step_index": 1, "timestamp_s": 0.5, "x": 11.0, "y": 21.5},
                ]
            }
        },
    )

    contract = json.loads(CONTRACT_PATH.read_text())
    artifact = contract["analyzed_result_artifact"]
    assert calls[0].get_header("Content-type") == artifact["content_type"]
    assert "/analyzed/result.csv" in calls[0].full_url
    assert calls[0].data == (
        b"step_index,timestamp_s,x,y\n0,,10.0,20.0\n1,0.5,11.0,21.5\n"
    )
    assert reference["digest"]
