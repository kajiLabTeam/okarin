"""Correlate elapsed stage times without logging input data or signed URLs."""

import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

# Use the server logger so INFO timing records reach Docker logs by default.
logger = logging.getLogger("uvicorn.error.nozomi.timing")
_item_id: ContextVar[str] = ContextVar("execution_item_id", default="unknown")


@contextmanager
def execution_context(item_id: str) -> Iterator[None]:
    token = _item_id.set(item_id)
    try:
        yield
    finally:
        _item_id.reset(token)


@contextmanager
def timed_stage(
    stage: str, *, item_id: str | None = None, component_id: str = "-"
) -> Iterator[None]:
    item_id = item_id or _item_id.get()
    started = time.perf_counter()
    outcome = "failed"
    logger.info(
        "Nozomi stage started: item_id=%s stage=%s component_id=%s",
        item_id,
        stage,
        component_id,
    )
    try:
        yield
        outcome = "completed"
    finally:
        logger.info(
            "Nozomi stage finished: item_id=%s stage=%s component_id=%s "
            "outcome=%s duration_seconds=%.6f",
            item_id,
            stage,
            component_id,
            outcome,
            time.perf_counter() - started,
        )
