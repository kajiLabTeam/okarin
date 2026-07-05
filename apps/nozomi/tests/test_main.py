import pytest
from fastapi.testclient import TestClient

from src.schemas.analysis import AnalyzeRequest
from src.server import app

client = TestClient(app)


class StubStrategy:
    name = "stub"

    def run(self, request: AnalyzeRequest) -> None:
        _ = request


@pytest.fixture
def stub_analysis_strategy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.usecases.submit_analysis.get_analysis_strategy",
        lambda: StubStrategy(),
    )


def test_root() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {
        "service": "nozomi",
        "role": "analysis",
        "status": "ok",
    }


# def test_rikka() -> None:
#     response = client.get("/rikka", params={"q": "test"})
#     assert response.status_code == 200
#     assert isinstance(response.text, str)


def test_analyze_accepts_valid_request(stub_analysis_strategy: None) -> None:
    _ = stub_analysis_strategy

    response = client.post(
        "/analyze",
        json={
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
                },
                {
                    "seq": 1,
                    "point_type": "waypoint",
                    "x": 18.2,
                    "y": 60.1,
                    "relative_timestamp": 12000,
                },
            ],
            "raw_data_urls": {
                "acce": "https://object-storage.example.com/acce.csv",
                "gyro": "https://object-storage.example.com/gyro.csv",
            },
            "result_upload_url": "https://object-storage.example.com/result.csv",
            "callback_url": "https://mediator.example.com/api/trajectories/callback",
            "callback_token": "signed-callback-token",
        },
    )

    assert response.status_code == 202
    assert response.json() == {
        "trajectory_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "status": "accepted",
    }


def test_analyze_accepts_request_without_constraints(
    stub_analysis_strategy: None,
) -> None:
    _ = stub_analysis_strategy

    response = client.post(
        "/analyze",
        json={
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
        },
    )

    assert response.status_code == 202
    assert response.json()["status"] == "accepted"


def test_analyze_rejects_request_without_start_constraint() -> None:
    response = client.post(
        "/analyze",
        json={
            "trajectory_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
            "recording_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
            "floor_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "constraints": [
                {
                    "seq": 1,
                    "point_type": "waypoint",
                    "x": 18.2,
                    "y": 60.1,
                    "relative_timestamp": 12000,
                }
            ],
            "raw_data_urls": {
                "acce": "https://object-storage.example.com/acce.csv",
                "gyro": "https://object-storage.example.com/gyro.csv",
            },
            "result_upload_url": "https://object-storage.example.com/result.csv",
            "callback_url": "https://mediator.example.com/api/trajectories/callback",
            "callback_token": "signed-callback-token",
        },
    )

    assert response.status_code == 422


def test_openapi_exposes_analysis_endpoint_metadata() -> None:
    response = client.get("/specification")
    assert response.status_code == 200

    schema = response.json()
    analyze_operation = schema["paths"]["/analyze"]["post"]

    assert schema["info"]["title"] == "nozomi API"
    assert analyze_operation["summary"] == "解析依頼を受け付ける"
    assert "仲介サーバーから" in analyze_operation["description"]
    assert analyze_operation["tags"] == ["analysis"]

    request_body_schema = analyze_operation["requestBody"]["content"][
        "application/json"
    ]["schema"]
    assert request_body_schema["$ref"] == "#/components/schemas/AnalyzeRequest"

    validation_error_schema = schema["components"]["schemas"]["HTTPValidationError"]
    detail_schema = validation_error_schema["properties"]["detail"]
    assert detail_schema["type"] == "array"


def test_scalar_doc_endpoint_is_available() -> None:
    response = client.get("/doc")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "/specification" in response.text
