from typing import cast

from fastapi import FastAPI
from rikka.main import printname

app = FastAPI()


@app.get("/")
def read_root() -> dict[str, str]:
    return {"Hello": "World"}


@app.get("/rikka")
def read_rikka(q: str = "World") -> str:
    return cast(str, printname(q))
