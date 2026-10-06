from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from src.registry.adapter import RikkaAdapter
from src.registry.catalog import initial_catalog
from src.registry.registry import PipelineRegistry
from src.schemas.execution import (
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
    UnsupportedExecutor,
    event_id,
    execute_pipeline,
    request_fingerprint,
    send_callback_with_retry,
    validate_request,
)

executions_router = APIRouter()
execution_repository = ExecutionRepository()
registry = PipelineRegistry(initial_catalog(), RikkaAdapter())
executor = UnsupportedExecutor()
input_loader = HttpInputLoader()
output_writer = HttpOutputWriter()


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
            request.callback.url,
            request.callback.secret,
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
    existing = execution_repository.get(request.analysis_run_item_id)
    fingerprint = request_fingerprint(request)
    if existing is not None:
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
    execution_repository.put(
        request.analysis_run_item_id, ExecutionRecord(fingerprint, processing)
    )
    background_tasks.add_task(
        send_callback_with_retry,
        execution_repository,
        processing,
        request.callback.url,
        request.callback.secret,
    )
    background_tasks.add_task(_run_execution, request)
    return ExecutionAccepted(
        analysis_run_item_id=request.analysis_run_item_id,
        status=ExecutionStatus.PROCESSING,
    )


@executions_router.get(
    "/internal/pipeline-executions/{analysis_run_item_id}/callbacks",
    tags=["executions"],
    summary="子実行のコールバック配信状況を取得する",
)
def callback_status(analysis_run_item_id: str) -> list[dict[str, Any]]:
    return [
        d.__dict__ for d in execution_repository.deliveries_for(analysis_run_item_id)
    ]
