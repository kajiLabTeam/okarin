from importlib.metadata import version
from typing import Any

from fastapi import APIRouter, status
from rikka.ping import ping

debug_router = APIRouter()


@debug_router.get(
    "/rikka/ping",
    status_code=status.HTTP_200_OK,
    summary="rikka ping 接続確認",
    description="rikka package の ping() を呼び出して疎通確認する。",
    tags=["debug"],
)
def read_rikka_ping() -> dict[str, Any]:
    return {
        "ok": True,
        "rikka_version": version("rikka"),
        "ping_module": "rikka.ping",
        "checked_modules": ["rikka.ping"],
        "result": ping(),
    }
