import os

import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from src.routes.analysis import analysis_router
from src.routes.health import health_router


def _scalar_fallback_html(openapi_url: str) -> HTMLResponse:
    return HTMLResponse(
        f"""<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>nozomi API</title>
  </head>
  <body>
    <script id="api-reference" data-url="{openapi_url}"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>"""
    )


def _host() -> str:
    return os.getenv("HOST", "127.0.0.1")


def _port() -> int:
    try:
        return int(os.getenv("PORT", "8000"))
    except ValueError:
        return 8000


def dev() -> None:
    uvicorn.run("src.server:app", host=_host(), port=_port(), reload=True)


def start() -> None:
    uvicorn.run("src.server:app", host=os.getenv("HOST", "0.0.0.0"), port=_port())


app = FastAPI(
    title="nozomi API",
    description=(
        "nozomi は解析サーバーとして動作する API サーバーであり、"
        "仲介サーバーから受け取った解析依頼を処理する。"
    ),
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url="/specification",
    openapi_tags=[
        {
            "name": "health",
            "description": "運用監視や疎通確認に使う endpoint 群",
        },
        {
            "name": "analysis",
            "description": "仲介サーバーからの解析依頼を受け付ける endpoint 群",
        },
        {
            "name": "debug",
            "description": "rikka 連携の確認用 endpoint 群",
        },
    ],
)


@app.get(
    "/doc",
    include_in_schema=False,
    summary="Scalar API reference",
    description="nozomi API の Scalar ドキュメントを返す。",
)
async def scalar_reference() -> HTMLResponse:
    openapi_url = app.openapi_url or "/specification"

    try:
        from scalar_fastapi import get_scalar_api_reference
    except ImportError:  # pragma: no cover - fallback for environments before uv sync
        return _scalar_fallback_html(openapi_url)

    return get_scalar_api_reference(
        openapi_url=openapi_url,
        title="nozomi API",
        scalar_proxy_url="https://proxy.scalar.com",
    )


app.include_router(health_router)
app.include_router(analysis_router)
