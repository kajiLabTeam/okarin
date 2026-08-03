from fastapi import BackgroundTasks

from src.analysis.stay_heatmap import get_stay_heatmap_runner
from src.schemas.analysis import (
    StayHeatmapAcceptedResponse,
    StayHeatmapAnalyzeRequest,
)


def submit_stay_heatmap(
    payload: StayHeatmapAnalyzeRequest, background_tasks: BackgroundTasks
) -> StayHeatmapAcceptedResponse:
    background_tasks.add_task(get_stay_heatmap_runner().run, payload)
    return StayHeatmapAcceptedResponse(
        analysis_run_id=payload.analysis_run_id,
        status="accepted",
    )
