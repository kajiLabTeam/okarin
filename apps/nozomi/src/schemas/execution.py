from __future__ import annotations

from enum import StrEnum
from typing import Any
from urllib.parse import urlparse

from pydantic import Field, field_validator

from src.schemas.pipeline import Contract, SlotBinding, StrictModel


def _validate_url(value: str, label: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"{label} must use http or https and include a host")
    if parsed.username or parsed.password:
        raise ValueError(f"{label} must not contain credentials")
    return value


class InputManifest(StrictModel):
    slot_id: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")
    contract: Contract
    uri: str = Field(min_length=1)
    digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    available: bool = True

    @field_validator("uri")
    @classmethod
    def check_uri(cls, value: str) -> str:
        return _validate_url(value, "uri")


class CallbackInfo(StrictModel):
    url: str
    secret: str | None = None

    @field_validator("url")
    @classmethod
    def check_url(cls, value: str) -> str:
        return _validate_url(value, "callback url")


class ExecutionRequest(StrictModel):
    analysis_run_item_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
    pipeline_id: str = Field(pattern=r"^[a-z][a-z0-9-]*$")
    snapshot_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    inputs: tuple[InputManifest, ...] = ()
    bindings: tuple[SlotBinding, ...] = ()
    output_uri: str
    callback: CallbackInfo
    parameters: dict[str, Any] = {}

    @field_validator("output_uri")
    @classmethod
    def check_output_uri(cls, value: str) -> str:
        return _validate_url(value, "output_uri")


class ExecutionStatus(StrEnum):
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ErrorResponse(StrictModel):
    code: str
    message: str


class ErrorEnvelope(StrictModel):
    detail: ErrorResponse


class ExecutionEvent(StrictModel):
    event_id: str
    analysis_run_item_id: str
    status: ExecutionStatus
    outputs: dict[str, Any] = {}
    error: ErrorResponse | None = None


class ExecutionAccepted(StrictModel):
    analysis_run_item_id: str
    status: ExecutionStatus
