from __future__ import annotations

import hashlib
import json
import math
import os
import sqlite3
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, cast
from urllib.request import HTTPRedirectHandler, Request, build_opener

from src.network_policy import (
    UrlPurpose,
    configured_callback_url,
    validate_outbound_url,
)
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
    next_attempt_at: float | None = None


@dataclass
class PendingCallback:
    event: ExecutionEvent


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class HttpInputLoader:
    def load(self, manifest: InputManifest) -> bytes:
        validate_outbound_url(manifest.uri, UrlPurpose.STORAGE)
        maximum_bytes = int(os.getenv("NOZOMI_MAX_INPUT_BYTES", str(200 * 1024 * 1024)))
        try:
            with build_opener(_NoRedirect).open(
                Request(manifest.uri, method="GET"), timeout=30
            ) as response:
                length = response.headers.get("content-length")
                if length is not None and int(length) > maximum_bytes:
                    raise PermanentComponentError(
                        f"input exceeds {maximum_bytes} byte limit"
                    )
                data = cast(bytes, response.read(maximum_bytes + 1))
        except Exception as exc:
            if isinstance(exc, PermanentComponentError):
                raise
            raise TemporaryComponentError(f"failed to load input: {exc}") from exc
        if len(data) > maximum_bytes:
            raise PermanentComponentError(f"input exceeds {maximum_bytes} byte limit")
        if hashlib.sha256(data).hexdigest() != manifest.digest:
            raise PermanentComponentError(
                f"input digest mismatch for slot {manifest.slot_id}"
            )
        return data


class HttpOutputWriter:
    def write(self, output_uri: str, outputs: dict[str, Any]) -> dict[str, Any]:
        validate_outbound_url(output_uri, UrlPurpose.STORAGE)
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
        return {"digest": digest}


class ExecutionRepository:
    def __init__(self, database_path: str = ":memory:") -> None:
        self._lock = threading.RLock()
        if database_path != ":memory:":
            Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(database_path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        with self._connection:
            self._connection.execute("PRAGMA journal_mode=WAL")
            self._connection.execute(
                """
                CREATE TABLE IF NOT EXISTS execution_records (
                    item_id TEXT PRIMARY KEY,
                    fingerprint TEXT NOT NULL,
                    event_json TEXT NOT NULL,
                    callback_attempts INTEGER NOT NULL DEFAULT 0,
                    callback_last_error TEXT
                )
                """
            )
            self._connection.execute(
                """
                CREATE TABLE IF NOT EXISTS callback_deliveries (
                    event_id TEXT PRIMARY KEY,
                    item_id TEXT NOT NULL,
                    event_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    last_error TEXT,
                    next_attempt_at REAL
                )
                """
            )

    @staticmethod
    def _record(row: sqlite3.Row) -> ExecutionRecord:
        return ExecutionRecord(
            fingerprint=str(row["fingerprint"]),
            event=ExecutionEvent.model_validate_json(row["event_json"]),
            callback_attempts=int(row["callback_attempts"]),
            callback_last_error=row["callback_last_error"],
        )

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def get(self, item_id: str) -> ExecutionRecord | None:
        with self._lock:
            row = self._connection.execute(
                "SELECT * FROM execution_records WHERE item_id = ?", (item_id,)
            ).fetchone()
            return None if row is None else self._record(row)

    def put(self, item_id: str, record: ExecutionRecord) -> None:
        with self._lock:
            with self._connection:
                self._connection.execute(
                    """
                    INSERT INTO execution_records (
                        item_id, fingerprint, event_json,
                        callback_attempts, callback_last_error
                    ) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(item_id) DO UPDATE SET
                        fingerprint = excluded.fingerprint,
                        event_json = excluded.event_json,
                        callback_attempts = excluded.callback_attempts,
                        callback_last_error = excluded.callback_last_error
                    """,
                    (
                        item_id,
                        record.fingerprint,
                        record.event.model_dump_json(),
                        record.callback_attempts,
                        record.callback_last_error,
                    ),
                )

    def reserve(
        self, item_id: str, fingerprint: str, event: ExecutionEvent
    ) -> tuple[ExecutionRecord, bool]:
        """Atomically reserve an id so concurrent requests start only one task."""
        with self._lock:
            record = ExecutionRecord(fingerprint, event)
            with self._connection:
                inserted = self._connection.execute(
                    """
                    INSERT OR IGNORE INTO execution_records (
                        item_id, fingerprint, event_json
                    ) VALUES (?, ?, ?)
                    """,
                    (item_id, fingerprint, event.model_dump_json()),
                )
            if inserted.rowcount == 1:
                return record, True
            existing = self.get(item_id)
            assert existing is not None
            return existing, False

    def delivery(self, event: ExecutionEvent) -> CallbackDeliveryRecord:
        with self._lock:
            with self._connection:
                if event.status != ExecutionStatus.PROCESSING:
                    self._connection.execute(
                        """
                        UPDATE callback_deliveries SET
                            status = 'superseded', next_attempt_at = NULL
                        WHERE item_id = ? AND status = 'retrying'
                        """,
                        (event.analysis_run_item_id,),
                    )
                self._connection.execute(
                    """
                    INSERT OR IGNORE INTO callback_deliveries (
                        event_id, item_id, event_json, status
                    ) VALUES (?, ?, ?, 'pending')
                    """,
                    (
                        event.event_id,
                        event.analysis_run_item_id,
                        event.model_dump_json(),
                    ),
                )
            row = self._connection.execute(
                "SELECT * FROM callback_deliveries WHERE event_id = ?",
                (event.event_id,),
            ).fetchone()
            assert row is not None
            return CallbackDeliveryRecord(
                event_id=str(row["event_id"]),
                analysis_run_item_id=str(row["item_id"]),
                status=str(row["status"]),
                attempts=int(row["attempts"]),
                last_error=row["last_error"],
                next_attempt_at=row["next_attempt_at"],
            )

    def update_delivery(self, delivery: CallbackDeliveryRecord) -> None:
        with self._lock:
            with self._connection:
                self._connection.execute(
                    """
                    UPDATE callback_deliveries SET
                        status = ?, attempts = ?, last_error = ?, next_attempt_at = ?
                    WHERE event_id = ?
                    """,
                    (
                        delivery.status,
                        delivery.attempts,
                        delivery.last_error,
                        delivery.next_attempt_at,
                        delivery.event_id,
                    ),
                )

    def deliveries_for(self, item_id: str) -> list[CallbackDeliveryRecord]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM callback_deliveries WHERE item_id = ? ORDER BY event_id",
                (item_id,),
            ).fetchall()
            return [
                CallbackDeliveryRecord(
                    event_id=str(row["event_id"]),
                    analysis_run_item_id=str(row["item_id"]),
                    status=str(row["status"]),
                    attempts=int(row["attempts"]),
                    last_error=row["last_error"],
                    next_attempt_at=row["next_attempt_at"],
                )
                for row in rows
            ]

    def pending_callbacks(self, now: float | None = None) -> list[PendingCallback]:
        current = time.time() if now is None else now
        with self._lock:
            rows = self._connection.execute(
                """
                SELECT event_json
                FROM callback_deliveries
                WHERE status = 'retrying' AND next_attempt_at <= ?
                ORDER BY next_attempt_at
                """,
                (current,),
            ).fetchall()
        return [
            PendingCallback(
                event=ExecutionEvent.model_validate_json(row["event_json"]),
            )
            for row in rows
        ]

    @contextmanager
    def retry_guard(self, event_id: str) -> Iterator[bool]:
        """Serialize a retry with terminal delivery creation for one process.

        The retry worker obtains a snapshot before sending. Holding the repository
        lock while checking and sending prevents a terminal callback from
        superseding that snapshot and then being overtaken by an old processing
        callback. Horizontal execution is intentionally unsupported while this
        repository uses local SQLite.
        """
        with self._lock:
            row = self._connection.execute(
                "SELECT status FROM callback_deliveries WHERE event_id = ?",
                (event_id,),
            ).fetchone()
            yield row is not None and row["status"] == "retrying"

    def recover_interrupted_executions(self) -> int:
        """Turn orphaned processing records into retryable terminal failures."""
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM execution_records"
            ).fetchall()
            interrupted = [
                self._record(row)
                for row in rows
                if self._record(row).event.status == ExecutionStatus.PROCESSING
            ]
            for record in interrupted:
                failed = ExecutionEvent(
                    event_id=event_id(
                        record.event.analysis_run_item_id, ExecutionStatus.FAILED
                    ),
                    analysis_run_item_id=record.event.analysis_run_item_id,
                    status=ExecutionStatus.FAILED,
                    error=ErrorResponse(
                        code="execution_interrupted",
                        message="Nozomi restarted before execution completed",
                    ),
                )
                self.put(
                    failed.analysis_run_item_id,
                    ExecutionRecord(record.fingerprint, failed),
                )
                delivery = self.delivery(failed)
                delivery.status = "retrying"
                delivery.next_attempt_at = 0
                self.update_delivery(delivery)
            return len(interrupted)


def request_fingerprint(request: ExecutionRequest) -> str:
    # Signed transport URLs and callback credentials can rotate without changing
    # the requested computation. Persist only a digest of semantic execution
    # content so idempotency remains stable and transport secrets are not hashed
    # into the local database.
    semantic_request = {
        "pipeline_id": request.pipeline_id,
        "snapshot_digest": request.snapshot_digest,
        "inputs": [
            {
                "slot_id": item.slot_id,
                "contract": item.contract.model_dump(mode="json"),
                "digest": item.digest,
                "available": item.available,
            }
            for item in sorted(request.inputs, key=lambda item: item.slot_id)
        ],
        "bindings": [
            item.model_dump(mode="json")
            for item in sorted(
                request.bindings,
                key=lambda item: (
                    item.target_component_instance,
                    item.target_slot_id,
                    item.source_component_instance or "",
                    item.source_slot_id,
                ),
            )
        ],
        "parameters": request.parameters,
    }
    payload = json.dumps(semantic_request, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def event_id(item_id: str, status: str) -> str:
    return hashlib.sha256(f"{item_id}:{status}".encode()).hexdigest()


def send_callback(event: ExecutionEvent) -> None:
    url = configured_callback_url()
    headers = {"content-type": "application/json"}
    body = json.dumps(event.model_dump(mode="json")).encode()
    shared_token = os.getenv("KAEDE_API_SHARED_TOKEN")
    if shared_token:
        headers["authorization"] = f"Bearer {shared_token}"
        headers["x-callback-secret"] = shared_token
    with build_opener(_NoRedirect).open(
        Request(url, data=body, headers=headers, method="POST"), timeout=10
    ) as response:
        if response.status >= 300:
            raise RuntimeError(f"callback returned HTTP {response.status}")


def send_callback_with_retry(
    repository: ExecutionRepository,
    event: ExecutionEvent,
    sender: Any = send_callback,
) -> None:
    delivery = repository.delivery(event)
    last_error: Exception | None = None
    for _ in range(3):
        delivery.attempts += 1
        try:
            sender(event)
            delivery.status = "delivered"
            delivery.last_error = None
            delivery.next_attempt_at = None
            repository.update_delivery(delivery)
            return
        except Exception as exc:
            last_error = exc
            delivery.status = "failed"
            delivery.last_error = str(exc)
            repository.update_delivery(delivery)
    if last_error is not None:
        delivery.status = "retrying"
        delivery.next_attempt_at = time.time() + min(
            300.0, float(2 ** min(delivery.attempts, 8))
        )
        repository.update_delivery(delivery)
        raise last_error


def retry_pending_callbacks(
    repository: ExecutionRepository,
    sender: Any = send_callback,
    now: float | None = None,
) -> int:
    attempted = 0
    for pending in repository.pending_callbacks(now):
        with repository.retry_guard(pending.event.event_id) as should_retry:
            if not should_retry:
                continue
            attempted += 1
            try:
                send_callback_with_retry(
                    repository,
                    pending.event,
                    sender=sender,
                )
            except Exception:
                continue
    return attempted


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
        expected_types = (
            {expected} if isinstance(expected, str) else set(expected or [])
        )
        if "null" in expected_types and value is None:
            continue
        if "string" in expected_types and not isinstance(value, str):
            raise PermanentComponentError(f"parameter {key} must be a string")
        if "number" in expected_types and (
            not isinstance(value, (int, float)) or isinstance(value, bool)
        ):
            raise PermanentComponentError(f"parameter {key} must be a number")
        if "integer" in expected_types and (
            not isinstance(value, int) or isinstance(value, bool)
        ):
            raise PermanentComponentError(f"parameter {key} must be an integer")
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if not math.isfinite(value):
                raise PermanentComponentError(f"parameter {key} must be finite")
            constraints = properties[key]
            if "minimum" in constraints and value < constraints["minimum"]:
                raise PermanentComponentError(
                    f"parameter {key} must be at least {constraints['minimum']}"
                )
            if "maximum" in constraints and value > constraints["maximum"]:
                raise PermanentComponentError(
                    f"parameter {key} must be at most {constraints['maximum']}"
                )
            if (
                "exclusiveMinimum" in constraints
                and value <= constraints["exclusiveMinimum"]
            ):
                raise PermanentComponentError(
                    f"parameter {key} must be greater than "
                    f"{constraints['exclusiveMinimum']}"
                )

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
