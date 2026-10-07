from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import Field, field_validator

from src.network_policy import (
    UrlPurpose,
    configured_callback_url,
    validate_outbound_url,
)
from src.schemas.pipeline import Contract, SlotBinding, StrictModel


class InputManifest(StrictModel):
    slot_id: str = Field(pattern=r"^[a-z][a-z0-9_-]*$")
    contract: Contract
    uri: str = Field(min_length=1)
    digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    available: bool = True

    @field_validator("uri")
    @classmethod
    def check_uri(cls, value: str) -> str:
        return validate_outbound_url(value, UrlPurpose.STORAGE)


class CallbackInfo(StrictModel):
    url: str
    # Kaede currently sends this field for callback authentication. Nozomi accepts
    # it for wire compatibility but never persists or reflects it; callbacks use
    # the shared service token configured in Nozomi's environment instead.
    secret: str | None = None

    @field_validator("url")
    @classmethod
    def check_url(cls, value: str) -> str:
        validated = validate_outbound_url(value, UrlPurpose.CALLBACK)
        if validated != configured_callback_url():
            raise ValueError("callback url must match the configured Kaede endpoint")
        return validated


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
        return validate_outbound_url(value, UrlPurpose.STORAGE)


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


class CallbackDeliveryResponse(StrictModel):
    event_id: str
    analysis_run_item_id: str
    status: str
    attempts: int
    last_error: str | None = None
    next_attempt_at: float | None = None
