import logging
import time

import pytest

from src.execution_timing import execution_context, timed_stage


def test_stage_timing_correlates_item_and_records_failure(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    ticks = iter([10.0, 12.5, 20.0, 21.0])
    monkeypatch.setattr(time, "perf_counter", lambda: next(ticks))
    with caplog.at_level(logging.INFO, logger="uvicorn.error.nozomi.timing"):
        with execution_context("outer"), execution_context("item-123"):
            with pytest.raises(ValueError, match="failed"):
                with timed_stage("particle_filter", component_id="pf"):
                    raise ValueError("failed")
        with timed_stage("input_download"):
            pass
    finished = [r.getMessage() for r in caplog.records if "stage finished" in r.message]
    assert "item_id=item-123" in finished[0]
    assert "component_id=pf outcome=failed duration_seconds=2.500000" in finished[0]
    assert "item_id=unknown" in finished[1]
    assert "outcome=completed duration_seconds=1.000000" in finished[1]
