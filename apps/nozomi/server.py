import os

import uvicorn


def _host() -> str:
    return os.getenv("HOST", "127.0.0.1")


def _port() -> int:
    try:
        return int(os.getenv("PORT", "8000"))
    except ValueError:
        return 8000


def dev() -> None:
    uvicorn.run("main:app", host=_host(), port=_port(), reload=True)


def start() -> None:
    uvicorn.run("main:app", host=os.getenv("HOST", "0.0.0.0"), port=_port())
