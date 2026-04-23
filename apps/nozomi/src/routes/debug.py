from typing import cast

from fastapi import APIRouter, Query, status
from rikka.main import printname

debug_router = APIRouter()


@debug_router.get(
    "/rikka",
    response_model=str,
    status_code=status.HTTP_200_OK,
    summary="rikka 連携確認",
    description="rikka package の疎通確認用 endpoint。",
    tags=["debug"],
)
def read_rikka(
    q: str = Query(default="World", description="rikka に渡す確認用文字列"),
) -> str:
    return cast(str, printname(q))
