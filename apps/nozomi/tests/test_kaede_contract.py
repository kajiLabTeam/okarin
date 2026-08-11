import json
from pathlib import Path
from typing import Any, cast

from src.schemas.analysis import AnalyzeRequest

CONTRACT_PATH = (
    Path(__file__).parents[3]
    / "contracts"
    / "kaede-nozomi"
    / "trajectory-analysis.json"
)


def load_contract() -> dict[str, Any]:
    return cast(dict[str, Any], json.loads(CONTRACT_PATH.read_text()))


def test_kaede_analyze_request_matches_nozomi_schema() -> None:
    contract = load_contract()
    payload = contract["analyze_request"]

    request = AnalyzeRequest.model_validate(payload)

    assert request.model_dump(mode="json", exclude_none=True) == payload
    assert set(payload).isdisjoint({"user_id", "membership_id", "session_id"})
    assert request.result_object_key.startswith("organizations/")


def test_nozomi_completed_callback_preserves_kaede_correlation_values() -> None:
    contract = load_contract()
    request = contract["analyze_request"]
    callback = contract["completed_callback"]

    assert callback == {
        "trajectory_id": request["trajectory_id"],
        "status": "completed",
        "callback_token": request["callback_token"],
        "result_object_key": request["result_object_key"],
    }
