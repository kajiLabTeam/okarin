import os
import threading

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from src.registry.catalog import initial_catalog
from src.registry.registry import PipelineRegistry
from src.registry.rikka_executor import RikkaComponentExecutor
from src.schemas.execution import (
    CallbackDeliveryResponse,
    ErrorEnvelope,
    ErrorResponse,
    ExecutionAccepted,
    ExecutionEvent,
    ExecutionRequest,
    ExecutionStatus,
)
from src.usecases.pipeline_execution import (
    ExecutionRecord,
    ExecutionRepository,
    HttpInputLoader,
    HttpOutputWriter,
    event_id,
    execute_pipeline,
    request_fingerprint,
    retry_pending_callbacks,
    send_callback_with_retry,
    validate_request,
)

executions_router = APIRouter()
execution_repository = ExecutionRepository(
    os.getenv("NOZOMI_EXECUTION_DB_PATH", ":memory:")
)
executor = RikkaComponentExecutor()
registry = PipelineRegistry(initial_catalog(), executor)
input_loader = HttpInputLoader()
output_writer = HttpOutputWriter()
_callback_retry_stop = threading.Event()
_callback_retry_thread: threading.Thread | None = None


def _callback_retry_loop() -> None:
    interval = float(os.getenv("NOZOMI_CALLBACK_RETRY_INTERVAL_SECONDS", "5"))
    while not _callback_retry_stop.wait(interval):
        retry_pending_callbacks(execution_repository)


def start_callback_retry_worker() -> None:
    global _callback_retry_thread
    if _callback_retry_thread is not None and _callback_retry_thread.is_alive():
        return
    execution_repository.recover_interrupted_executions()
    _callback_retry_stop.clear()
    _callback_retry_thread = threading.Thread(
        target=_callback_retry_loop,
        name="pipeline-callback-retry",
        daemon=True,
    )
    _callback_retry_thread.start()


def stop_callback_retry_worker() -> None:
    _callback_retry_stop.set()
    if _callback_retry_thread is not None:
        _callback_retry_thread.join(timeout=1)


def _deliver_callback_without_interrupting(event: ExecutionEvent) -> None:
    """Record callback failure without preventing the next background task."""
    try:
        send_callback_with_retry(
            execution_repository,
            event,
        )
    except Exception:
        # send_callback_with_retry persists the failed delivery and its last error.
        # Callback availability must not control whether the pipeline itself runs.
        return


def _run_execution(request: ExecutionRequest) -> None:
    snapshot = registry.resolve(request.pipeline_id)
    if snapshot is None:
        event = ExecutionEvent(
            event_id=event_id(request.analysis_run_item_id, ExecutionStatus.FAILED),
            analysis_run_item_id=request.analysis_run_item_id,
            status=ExecutionStatus.FAILED,
            error=ErrorResponse(code="unknown_pipeline", message="Unknown pipeline_id"),
        )
    elif request.snapshot_digest != snapshot.digest:
        event = ExecutionEvent(
            event_id=event_id(request.analysis_run_item_id, ExecutionStatus.FAILED),
            analysis_run_item_id=request.analysis_run_item_id,
            status=ExecutionStatus.FAILED,
            error=ErrorResponse(
                code="snapshot_mismatch", message="snapshot digest does not match"
            ),
        )
    else:
        try:
            if not snapshot.availability.available:
                raise ValueError("pipeline is unavailable")
            validate_request(snapshot, request)
            event = execute_pipeline(snapshot, request, executor, input_loader)
            if event.status == ExecutionStatus.COMPLETED:
                references = output_writer.write(request.output_uri, event.outputs)
                event = event.model_copy(update={"outputs": references})
        except ValueError as exc:
            event = ExecutionEvent(
                event_id=event_id(request.analysis_run_item_id, ExecutionStatus.FAILED),
                analysis_run_item_id=request.analysis_run_item_id,
                status=ExecutionStatus.FAILED,
                error=ErrorResponse(code="invalid_request", message=str(exc)),
            )
        except Exception as exc:
            event = ExecutionEvent(
                event_id=event_id(request.analysis_run_item_id, ExecutionStatus.FAILED),
                analysis_run_item_id=request.analysis_run_item_id,
                status=ExecutionStatus.FAILED,
                error=ErrorResponse(
                    code="execution_failed", message=str(exc) or "execution failed"
                ),
            )

    execution_repository.put(
        request.analysis_run_item_id,
        ExecutionRecord(request_fingerprint(request), event),
    )
    try:
        send_callback_with_retry(
            execution_repository,
            event,
        )
    except Exception as exc:
        execution_repository.put(
            request.analysis_run_item_id,
            ExecutionRecord(request_fingerprint(request), event, 3, str(exc)),
        )


@executions_router.post(
    "/internal/pipeline-executions",
    response_model=ExecutionAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        404: {"model": ErrorEnvelope},
        409: {"model": ErrorEnvelope},
        422: {"model": ErrorEnvelope},
    },
    tags=["executions"],
    summary="Pipeline子実行を受け付けて非同期実行する",
)
def start_execution(
    request: ExecutionRequest, background_tasks: BackgroundTasks
) -> ExecutionAccepted:
    fingerprint = request_fingerprint(request)
    snapshot = registry.resolve(request.pipeline_id)
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "unknown_pipeline", "message": "Unknown pipeline_id"},
        )
    if request.snapshot_digest != snapshot.digest:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "snapshot_mismatch",
                "message": "snapshot digest does not match",
            },
        )
    if not snapshot.availability.available:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "UNSUPPORTED_COMPONENT",
                "message": "pipeline is unavailable",
            },
        )
    try:
        validate_request(snapshot, request)
    except Exception as exc:
        raise HTTPException(
            status_code=422, detail={"code": "invalid_request", "message": str(exc)}
        ) from exc

    processing = ExecutionEvent(
        event_id=event_id(request.analysis_run_item_id, ExecutionStatus.PROCESSING),
        analysis_run_item_id=request.analysis_run_item_id,
        status=ExecutionStatus.PROCESSING,
    )
    existing, created = execution_repository.reserve(
        request.analysis_run_item_id, fingerprint, processing
    )
    if not created:
        if existing.fingerprint != fingerprint:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "idempotency_conflict",
                    "message": (
                        "analysis_run_item_id was already used with different content"
                    ),
                },
            )
        return ExecutionAccepted(
            analysis_run_item_id=request.analysis_run_item_id,
            status=existing.event.status,
        )
    background_tasks.add_task(
        _deliver_callback_without_interrupting,
        processing,
    )
    background_tasks.add_task(_run_execution, request)
    return ExecutionAccepted(
        analysis_run_item_id=request.analysis_run_item_id,
        status=ExecutionStatus.PROCESSING,
    )


@executions_router.get(
    "/internal/pipeline-executions/{analysis_run_item_id}",
    response_model=ExecutionEvent,
    responses={404: {"model": ErrorEnvelope}},
    tags=["executions"],
    summary="Pipeline子実行の現在状態を取得する",
)
def execution_status(analysis_run_item_id: str) -> ExecutionEvent:
    record = execution_repository.get(analysis_run_item_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "execution_not_found", "message": "execution not found"},
        )
    return record.event


@executions_router.get(
    "/internal/pipeline-executions/{analysis_run_item_id}/callbacks",
    response_model=list[CallbackDeliveryResponse],
    tags=["executions"],
    summary="子実行のコールバック配信状況を取得する",
)
def callback_status(analysis_run_item_id: str) -> list[CallbackDeliveryResponse]:
    return [
        CallbackDeliveryResponse.model_validate(d.__dict__)
        for d in execution_repository.deliveries_for(analysis_run_item_id)
    ]
