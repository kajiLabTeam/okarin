import pytest
from pydantic import ValidationError

from src.schemas.analysis import AnalyzeRequest


def valid_analyze_request() -> dict[str, object]:
    return {
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
            {
                "seq": 2,
                "point_type": "goal",
                "x": 30.5,
                "y": 72.4,
                "direction": 30.0,
            },
        ],
        "raw_data_urls": {
            "acce": "https://object-storage.example.com/acce.csv",
            "gyro": "https://object-storage.example.com/gyro.csv",
            "pressure": "https://object-storage.example.com/pressure.csv",
        },
        "result_upload_url": "https://object-storage.example.com/result.csv",
        "callback_url": "https://mediator.example.com/api/trajectories/callback",
        "callback_token": "signed-callback-token",
    }


def test_analyze_request_accepts_valid_payload() -> None:
    request = AnalyzeRequest.model_validate(valid_analyze_request())

    assert str(request.trajectory_id) == "dddddddd-dddd-dddd-dddd-dddddddddddd"
    assert len(request.constraints) == 3
    assert request.constraints[0].point_type == "start"
    assert request.raw_data_urls.pressure is not None
    assert request.raw_data_urls.wifi is None


def test_analyze_request_accepts_payload_without_optional_raw_data_urls() -> None:
    payload = valid_analyze_request()
    payload["raw_data_urls"] = {
        "acce": "https://object-storage.example.com/acce.csv",
        "gyro": "https://object-storage.example.com/gyro.csv",
    }

    request = AnalyzeRequest.model_validate(payload)

    assert request.raw_data_urls.pressure is None
    assert request.raw_data_urls.wifi is None


def test_analyze_request_rejects_payload_without_start_constraint() -> None:
    payload = valid_analyze_request()
    payload["constraints"] = [
        {
            "seq": 1,
            "point_type": "waypoint",
            "x": 18.2,
            "y": 60.1,
            "relative_timestamp": 12000,
        }
    ]

    with pytest.raises(ValidationError, match="exactly one start point"):
        AnalyzeRequest.model_validate(payload)


def test_analyze_request_rejects_payload_with_multiple_goal_constraints() -> None:
    payload = valid_analyze_request()
    payload["constraints"] = [
        {
            "seq": 0,
            "point_type": "start",
            "x": 12.34,
            "y": 56.78,
        },
        {
            "seq": 1,
            "point_type": "goal",
            "x": 30.5,
            "y": 72.4,
        },
        {
            "seq": 2,
            "point_type": "goal",
            "x": 31.5,
            "y": 73.4,
        },
    ]

    with pytest.raises(ValidationError, match="at most one goal point"):
        AnalyzeRequest.model_validate(payload)


def test_analyze_request_rejects_duplicate_constraint_seq() -> None:
    payload = valid_analyze_request()
    payload["constraints"] = [
        {
            "seq": 0,
            "point_type": "start",
            "x": 12.34,
            "y": 56.78,
        },
        {
            "seq": 0,
            "point_type": "waypoint",
            "x": 18.2,
            "y": 60.1,
            "relative_timestamp": 12000,
        },
    ]

    with pytest.raises(ValidationError, match="seq must be unique"):
        AnalyzeRequest.model_validate(payload)


def test_analyze_request_rejects_waypoint_without_relative_timestamp() -> None:
    payload = valid_analyze_request()
    payload["constraints"] = [
        {
            "seq": 0,
            "point_type": "start",
            "x": 12.34,
            "y": 56.78,
        },
        {
            "seq": 1,
            "point_type": "waypoint",
            "x": 18.2,
            "y": 60.1,
        },
    ]

    with pytest.raises(ValidationError, match="relative_timestamp"):
        AnalyzeRequest.model_validate(payload)


def test_analyze_request_rejects_payload_without_required_raw_data_urls() -> None:
    payload = valid_analyze_request()
    payload["raw_data_urls"] = {
        "acce": "https://object-storage.example.com/acce.csv",
    }

    with pytest.raises(ValidationError, match="gyro"):
        AnalyzeRequest.model_validate(payload)
