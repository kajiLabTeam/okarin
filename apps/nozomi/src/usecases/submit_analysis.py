from fastapi import BackgroundTasks

from src.analysis.factory import get_analysis_strategy
from src.schemas.analysis import AnalyzeAcceptedResponse, AnalyzeRequest


def submit_analysis(
    payload: AnalyzeRequest, background_tasks: BackgroundTasks
) -> AnalyzeAcceptedResponse:
    strategy = get_analysis_strategy()
    background_tasks.add_task(strategy.run, payload)

    return AnalyzeAcceptedResponse(
        trajectory_id=payload.trajectory_id,
        status="accepted",
    )
