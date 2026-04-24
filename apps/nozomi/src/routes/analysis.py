from fastapi import APIRouter, status

from src.schemas.analysis import AnalyzeAcceptedResponse, AnalyzeRequest, ErrorResponse

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
    responses={
        422: {
            "description": "request body が不正",
            "model": ErrorResponse,
        }
    },
)
def analyze(payload: AnalyzeRequest) -> AnalyzeAcceptedResponse:
    return AnalyzeAcceptedResponse(
        trajectory_id=payload.trajectory_id,
        status="accepted",
        message="analysis request accepted; execution pipeline is not implemented yet",
    )
