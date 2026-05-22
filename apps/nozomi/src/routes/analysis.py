from fastapi import APIRouter, BackgroundTasks, status

from src.schemas.analysis import AnalyzeAcceptedResponse, AnalyzeRequest
from src.usecases.submit_analysis import submit_analysis

analysis_router = APIRouter()


@analysis_router.post(
    "/analyze",
    response_model=AnalyzeAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="解析依頼を受け付ける",
    description=(
        "仲介サーバーから raw データ取得用 URL、解析結果保存用 URL、"
        "callback 情報、制約点情報を受け取り、解析ジョブを受理する。"
    ),
    tags=["analysis"],
)
def analyze(
    payload: AnalyzeRequest, background_tasks: BackgroundTasks
) -> AnalyzeAcceptedResponse:
    return submit_analysis(payload, background_tasks)
