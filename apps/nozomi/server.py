import uvicorn


def dev() -> None:
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)


def start() -> None:
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
