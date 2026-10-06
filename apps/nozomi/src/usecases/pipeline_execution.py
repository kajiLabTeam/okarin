from __future__ import annotations

import hashlib
import json
import threading
from dataclasses import dataclass
from typing import Any, Protocol, cast
from urllib.request import HTTPRedirectHandler, Request, build_opener

from src.schemas.execution import (
    ErrorResponse,
    ExecutionEvent,
    ExecutionRequest,
    ExecutionStatus,
    InputManifest,
)
from src.schemas.pipeline import ComponentContract, PipelineSnapshot


class ComponentExecutionError(Exception):
    code = "component_failed"
    temporary = False


class UnsupportedComponent(ComponentExecutionError):  # noqa: N818
    code = "UNSUPPORTED_COMPONENT"


class TemporaryComponentError(ComponentExecutionError):
    code = "temporary"
    temporary = True


class PermanentComponentError(ComponentExecutionError):
    code = "algorithm_failed"


class ComponentExecutor(Protocol):
    def capabilities(self) -> tuple[ComponentContract, ...]: ...
    def execute(
        self,
        component: ComponentContract,
        inputs: dict[str, Any],
        parameters: dict[str, Any],
    ) -> dict[str, Any]: ...


@dataclass
class ExecutionRecord:
    fingerprint: str
    event: ExecutionEvent
    callback_attempts: int = 0
    callback_last_error: str | None = None


@dataclass
class CallbackDeliveryRecord:
    event_id: str
    analysis_run_item_id: str
    status: str = "pending"
    attempts: int = 0
    last_error: str | None = None


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class HttpInputLoader:
    def load(self, manifest: InputManifest) -> bytes:
        try:
            with build_opener(_NoRedirect).open(
                Request(manifest.uri, method="GET"), timeout=30
            ) as response:
                data = cast(bytes, response.read())
        except Exception as exc:
            raise TemporaryComponentError(f"failed to load input: {exc}") from exc
        if hashlib.sha256(data).hexdigest() != manifest.digest:
            raise PermanentComponentError(
                f"input digest mismatch for slot {manifest.slot_id}"
            )
        return data


class HttpOutputWriter:
    def write(self, output_uri: str, outputs: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(outputs, sort_keys=True, separators=(",", ":")).encode()
        digest = hashlib.sha256(body).hexdigest()
        try:
            with build_opener(_NoRedirect).open(
                Request(
                    output_uri,
                    data=body,
                    method="PUT",
                    headers={"content-type": "application/json"},
                ),
                timeout=30,
            ) as response:
                if response.status >= 300:
                    raise PermanentComponentError(
                        f"output upload failed with HTTP {response.status}"
                    )
        except PermanentComponentError:
            raise
        except Exception as exc:
            raise PermanentComponentError(f"output upload failed: {exc}") from exc
        return {"uri": output_uri, "digest": digest}


class ExecutionRepository:
    def __init__(self) -> None:
        self._records: dict[str, ExecutionRecord] = {}
        self._deliveries: dict[str, CallbackDeliveryRecord] = {}
        self._lock = threading.RLock()

    def get(self, item_id: str) -> ExecutionRecord | None:
        with self._lock:
            return self._records.get(item_id)

    def put(self, item_id: str, record: ExecutionRecord) -> None:
        with self._lock:
            self._records[item_id] = record

    def delivery(self, event: ExecutionEvent) -> CallbackDeliveryRecord:
        with self._lock:
            return self._deliveries.setdefault(
                event.event_id,
                CallbackDeliveryRecord(event.event_id, event.analysis_run_item_id),
            )

    def update_delivery(self, delivery: CallbackDeliveryRecord) -> None:
        with self._lock:
            self._deliveries[delivery.event_id] = delivery

    def deliveries_for(self, item_id: str) -> list[CallbackDeliveryRecord]:
        with self._lock:
            return [
                d
                for d in self._deliveries.values()
                if d.analysis_run_item_id == item_id
            ]


def request_fingerprint(request: ExecutionRequest) -> str:
    payload = json.dumps(
        request.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def event_id(item_id: str, status: str) -> str:
    return hashlib.sha256(f"{item_id}:{status}".encode()).hexdigest()


def send_callback(event: ExecutionEvent, url: str, secret: str | None) -> None:
    headers = {"content-type": "application/json"}
    if secret:
        headers["x-callback-secret"] = secret
    body = json.dumps(event.model_dump(mode="json")).encode()
    with build_opener(_NoRedirect).open(
        Request(url, data=body, headers=headers, method="POST"), timeout=10
    ) as response:
        if response.status >= 300:
            raise RuntimeError(f"callback returned HTTP {response.status}")


def send_callback_with_retry(
    repository: ExecutionRepository,
    event: ExecutionEvent,
    url: str,
    secret: str | None,
    sender: Any = send_callback,
) -> None:
    delivery = repository.delivery(event)
    last_error: Exception | None = None
    for _ in range(3):
        delivery.attempts += 1
        try:
            sender(event, url, secret)
            delivery.status = "delivered"
            repository.update_delivery(delivery)
            return
        except Exception as exc:
            last_error = exc
            delivery.status = "failed"
            delivery.last_error = str(exc)
            repository.update_delivery(delivery)
    if last_error is not None:
        raise last_error


def validate_request(snapshot: PipelineSnapshot, request: ExecutionRequest) -> None:
    schema = snapshot.definition.parameters_schema
    properties = schema.get("properties", {})
    required = set(schema.get("required", []))
    if set(request.parameters) - set(properties) or not required.issubset(
        request.parameters
    ):
        raise PermanentComponentError("parameters do not match schema")
    for key, value in request.parameters.items():
        expected = properties.get(key, {}).get("type")
        if expected == "string" and not isinstance(value, str):
            raise PermanentComponentError(f"parameter {key} must be a string")
        if expected == "number" and (
            not isinstance(value, (int, float)) or isinstance(value, bool)
        ):
            raise PermanentComponentError(f"parameter {key} must be a number")

    if len(
        {(b.target_component_instance, b.target_slot_id) for b in request.bindings}
    ) != len(request.bindings):
        raise PermanentComponentError("duplicate bindings are not allowed")

    if len({item.slot_id for item in request.inputs}) != len(request.inputs):
        raise PermanentComponentError("duplicate input slots are not allowed")

    expected = {
        (b.target_component_instance, b.target_slot_id): b
        for b in snapshot.definition.bindings
    }
    actual = {
        (b.target_component_instance, b.target_slot_id): b for b in request.bindings
    }
    if actual != expected:
        raise PermanentComponentError(
            "bindings do not match resolved pipeline snapshot"
        )

    slots = {slot.slot_id: slot for slot in snapshot.definition.input_slots}
    provided = {item.slot_id: item for item in request.inputs}
    if set(provided) != set(slots):
        raise PermanentComponentError(
            "input manifest does not match pipeline input slots"
        )

    for slot_id, item in provided.items():
        if not item.available:
            raise TemporaryComponentError(f"input {slot_id} is unavailable")
        if item.contract not in slots[slot_id].accepted_contracts:
            raise PermanentComponentError(f"input contract mismatch for {slot_id}")


def execute_pipeline(
    snapshot: PipelineSnapshot,
    request: ExecutionRequest,
    executor: ComponentExecutor,
    input_loader: Any = None,
) -> ExecutionEvent:
    values: dict[tuple[str, str], Any] = {
        (item.slot_id, "input"): (
            input_loader.load(item) if input_loader is not None else item
        )
        for item in request.inputs
    }
    by_target = {
        (b.target_component_instance, b.target_slot_id): b for b in request.bindings
    }
    try:
        for component in snapshot.definition.components:
            component_inputs: dict[str, Any] = {}
            for slot in component.input_slots:
                binding = by_target[(component.instance_id, slot.slot_id)]
                key = (
                    (binding.source_slot_id, "input")
                    if binding.source_component_instance is None
                    else (binding.source_component_instance, binding.source_slot_id)
                )
                if key not in values:
                    raise PermanentComponentError(
                        f"missing input for {component.instance_id}.{slot.slot_id}"
                    )
                component_inputs[slot.slot_id] = values[key]

            outputs = executor.execute(component, component_inputs, request.parameters)
            for slot in component.output_slots:
                if slot.slot_id not in outputs:
                    raise PermanentComponentError(
                        f"missing output for {component.instance_id}.{slot.slot_id}"
                    )
                values[(component.instance_id, slot.slot_id)] = outputs[slot.slot_id]

        result = {
            output.output_slot_id: values[
                (output.source_component_instance, output.source_slot_id)
            ]
            for output in snapshot.definition.outputs
        }
        return ExecutionEvent(
            event_id=event_id(request.analysis_run_item_id, ExecutionStatus.COMPLETED),
            analysis_run_item_id=request.analysis_run_item_id,
            status=ExecutionStatus.COMPLETED,
            outputs=result,
        )
    except ComponentExecutionError as exc:
        return ExecutionEvent(
            event_id=event_id(request.analysis_run_item_id, ExecutionStatus.FAILED),
            analysis_run_item_id=request.analysis_run_item_id,
            status=ExecutionStatus.FAILED,
            error=ErrorResponse(code=exc.code, message=str(exc)),
        )
    except Exception as exc:
        return ExecutionEvent(
            event_id=event_id(request.analysis_run_item_id, ExecutionStatus.FAILED),
            analysis_run_item_id=request.analysis_run_item_id,
            status=ExecutionStatus.FAILED,
            error=ErrorResponse(
                code="execution_failed", message=str(exc) or "execution failed"
            ),
        )


class UnsupportedExecutor:
    def capabilities(self) -> tuple[ComponentContract, ...]:
        return ()

    def execute(
        self,
        component: ComponentContract,
        inputs: dict[str, Any],
        parameters: dict[str, Any],
    ) -> dict[str, Any]:
        raise UnsupportedComponent(
            f"component {component.component_id} is not supported"
        )
