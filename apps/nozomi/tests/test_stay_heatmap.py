import asyncio
import json
from typing import Any

from fastapi import BackgroundTasks
from fastapi.testclient import TestClient

from src.analysis.stay_heatmap import StayHeatmapRunner
from src.schemas.analysis import StayHeatmapAnalyzeRequest
from src.server import app
from src.usecases.submit_stay_heatmap import submit_stay_heatmap


def valid_payload() -> dict[str, object]:
    return {
        "analysis_run_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "analysis_type": "stay_heatmap",
        "definition_version": "original-v1",
        "parameters": {"speed_threshold_mps": 0.5, "grid_size_m": 1.0},
        "floor": {
            "floor_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            "map_width_px": 101,
            "map_height_px": 201,
            "scale_m_per_px": 0.01,
        },
        "trajectories": [
            {
                "trajectory_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                "seq": 0,
                "start": {"x_px": 10.0, "y_px": 20.0},
                "source": {"download_url": "https://storage.invalid/input.csv"},
                "output": {"upload_url": "https://storage.invalid/stay.csv"},
            }
        ],
        "heatmap_output": {"upload_url": "https://storage.invalid/stay-heatmap.json"},
        "callback": {
            "url": "https://kaede.invalid/api/analysis-runs/callback",
            "token": "signed-token",
        },
    }


def test_endpoint_accepts_stay_heatmap_request(monkeypatch: Any) -> None:
    calls: list[StayHeatmapAnalyzeRequest] = []

    class StubRunner:
        def run(self, request: StayHeatmapAnalyzeRequest) -> None:
            calls.append(request)

    monkeypatch.setattr(
        "src.usecases.submit_stay_heatmap.get_stay_heatmap_runner",
        lambda: StubRunner(),
    )
    response = TestClient(app).post("/stay-heatmaps/analyze", json=valid_payload())

    assert response.status_code == 202
    assert response.json() == {
        "analysis_run_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "status": "accepted",
    }
    assert len(calls) == 1


def test_schema_rejects_unknown_field_and_invalid_sequence() -> None:
    unknown = valid_payload()
    unknown["unknown"] = True
    assert (
        TestClient(app).post("/stay-heatmaps/analyze", json=unknown).status_code == 422
    )

    invalid_seq = valid_payload()
    invalid_seq["trajectories"][0]["seq"] = 1  # type: ignore[index]
    assert (
        TestClient(app).post("/stay-heatmaps/analyze", json=invalid_seq).status_code
        == 422
    )


def test_submit_registers_background_runner(monkeypatch: Any) -> None:
    request = StayHeatmapAnalyzeRequest.model_validate(valid_payload())
    background_tasks = BackgroundTasks()
    calls: list[StayHeatmapAnalyzeRequest] = []

    class StubRunner:
        def run(self, payload: StayHeatmapAnalyzeRequest) -> None:
            calls.append(payload)

    monkeypatch.setattr(
        "src.usecases.submit_stay_heatmap.get_stay_heatmap_runner",
        lambda: StubRunner(),
    )
    response = submit_stay_heatmap(request, background_tasks)
    for task in background_tasks.tasks:
        asyncio.run(task())

    assert response.status == "accepted"
    assert calls == [request]


class StubResponse:
    def __init__(self, body: bytes = b"") -> None:
        self.body = body
        self.status = 200

    def __enter__(self) -> StubResponse:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self) -> bytes:
        return self.body


def test_runner_processes_trajectories_and_uploads_artifacts(monkeypatch: Any) -> None:
    requests: list[tuple[str, str, bytes | None, str | None]] = []

    def fake_urlopen(request: Any, timeout: int) -> StubResponse:
        assert timeout == 120
        url = request.full_url if hasattr(request, "full_url") else str(request)
        method = request.get_method() if hasattr(request, "get_method") else "GET"
        body = getattr(request, "data", None)
        content_type = (
            request.get_header("Content-type")
            if hasattr(request, "get_header")
            else None
        )
        requests.append((url, method, body, content_type))
        if url.endswith("input.csv"):
            return StubResponse(
                b"step_index,rikka_timestamp_s,rikka_x,rikka_y,x,y\n"
                b"0,,0,0,10,20\n1,0,0,0,10,20\n2,1,0.1,0,11,20\n"
            )
        return StubResponse()

    class StubAnalyzer:
        def enrich_and_aggregate(self, dataframe, request, trajectory):
            enriched = dataframe.copy()
            enriched["speed_mps"] = [float("nan"), float("nan"), 0.1]
            enriched["is_stay"] = [False, False, True]
            return enriched, [
                {"grid_column": 0, "grid_row": 0, "stay_cell_visit_count": 1}
            ]

    monkeypatch.setattr("src.analysis.stay_heatmap.urlopen", fake_urlopen)
    StayHeatmapRunner(StubAnalyzer()).run(
        StayHeatmapAnalyzeRequest.model_validate(valid_payload())
    )

    assert [request[1] for request in requests] == ["GET", "PUT", "PUT", "POST"]
    csv_body = requests[1][2]
    assert csv_body is not None
    assert csv_body.endswith(b",0.100000,true\n")
    artifact_body = requests[2][2]
    assert artifact_body is not None
    artifact = json.loads(artifact_body)
    assert artifact["grid"] == {"size_m": 1.0, "column_count": 2, "row_count": 3}
    assert artifact["trajectories"][0]["cells"][0]["stay_cell_visit_count"] == 1
    callback = json.loads(requests[3][2])
    assert callback == {
        "analysis_run_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "status": "completed",
        "callback_token": "signed-token",
    }


def test_runner_reports_invalid_csv(monkeypatch: Any) -> None:
    requests: list[Any] = []

    def fake_urlopen(request: Any, timeout: int) -> StubResponse:
        requests.append(request)
        url = request.full_url if hasattr(request, "full_url") else str(request)
        return (
            StubResponse(b"not,a,valid,trajectory\n")
            if url.endswith("input.csv")
            else StubResponse()
        )

    class RejectingAnalyzer:
        def enrich_and_aggregate(self, dataframe, request, trajectory):
            raise ValueError("missing columns")

    monkeypatch.setattr("src.analysis.stay_heatmap.urlopen", fake_urlopen)
    StayHeatmapRunner(RejectingAnalyzer()).run(
        StayHeatmapAnalyzeRequest.model_validate(valid_payload())
    )

    callback = json.loads(requests[-1].data)
    assert callback["status"] == "failed"
    assert callback["error_code"] == "INVALID_TRAJECTORY_CSV"
