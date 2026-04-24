from fastapi import APIRouter, status

from src.schemas.common import HealthResponse

health_router = APIRouter()


@health_router.get(
    "/",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="ヘルスチェック",
    description="解析サーバーとしての疎通確認に使う基本 endpoint。",
    tags=["health"],
)
def read_root() -> HealthResponse:
    return HealthResponse(service="nozomi", role="analysis", status="ok")
