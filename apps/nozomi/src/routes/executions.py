import logging
import os
import threading
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from src.registry.catalog import initial_catalog
from src.registry.registry import PipelineRegistry
from src.registry.rikka_executor import ParticleAnimation, RikkaComponentExecutor
from src.schemas.execution import (
    ArtifactRetryAccepted,
    ArtifactRetryRequest,
    CallbackDeliveryResponse,
    ErrorEnvelope,
    ErrorResponse,
    ExecutionAccepted,
    ExecutionEvent,
    ExecutionRequest,
    ExecutionStatus,
    OutputArtifactUpload,
)
from src.usecases.pipeline_execution import (
    ExecutionRecord,
    ExecutionRepository,
    HttpInputLoader,
    HttpOutputWriter,
    artifact_event_id,
    event_id,
    execute_pipeline,
    request_fingerprint,
    retry_pending_callbacks,
    send_callback_with_retry,
    validate_request,
)

logger = logging.getLogger(__name__)

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
    deferred: dict[str, Callable[[], dict[str, Any]]] = {}
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
            execution_request = request.model_copy(
                update={
                    "parameters": {
                        **request.parameters,
                        "_output_artifacts": {
                            name: value.model_dump()
                            for name, value in request.output_artifacts.items()
                        },
                    }
                }
            )
            event = execute_pipeline(
                snapshot, execution_request, executor, input_loader
            )
            if event.status == ExecutionStatus.COMPLETED:
                animations = event.outputs.get("trajectory", {}).pop(
                    "_deferred_artifacts", {}
                )
                deferred = {
                    name: animation.render for name, animation in animations.items()
                }
                references = output_writer.write(
                    request.output_uri, event.outputs, request.output_artifacts
                )
                if deferred:
                    artifacts = references.setdefault(
                        "output_manifest", {"schema_version": "1", "artifacts": {}}
                    )["artifacts"]
                    for name in deferred:
                        target = request.output_artifacts[name]
                        retry_available = False
                        try:
                            execution_repository.save_artifact_source(
                                request.analysis_run_item_id,
                                name,
                                animations[name].serialize(),
                            )
                            retry_available = True
                        except Exception:
                            logger.exception(
                                "Could not persist video source: item_id=%s",
                                request.analysis_run_item_id,
                            )
                        artifacts[name] = {
                            "object_key": target.object_key,
                            "content_type": target.content_type,
                            "format": target.format,
                            "available": False,
                            "generation_status": "processing",
                            "generation_attempt": 0,
                            "retry_available": retry_available,
                        }
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

    if event.status == ExecutionStatus.COMPLETED and deferred:
        _finish_deferred_artifacts(
            event, deferred, request.output_artifacts, request_fingerprint(request)
        )


def _finish_deferred_artifacts(
    completed: ExecutionEvent,
    deferred: dict[str, Callable[[], dict[str, Any]]],
    artifact_uploads: dict[str, OutputArtifactUpload],
    fingerprint: str,
) -> None:
    # Work from a copy so the persisted initial completion remains immutable.
    outputs = completed.model_copy(deep=True).outputs
    artifacts = outputs["output_manifest"]["artifacts"]
    for name, render in deferred.items():
        try:
            manifest = output_writer.write_artifacts(render(), artifact_uploads)
            if name not in manifest:
                raise RuntimeError(f"deferred artifact {name} was not uploaded")
            for artifact in manifest.values():
                artifact["generation_attempt"] = artifacts[name].get(
                    "generation_attempt", 0
                )
            artifacts.update(manifest)
        except Exception:
            logger.exception(
                "Background artifact generation failed: item_id=%s artifact=%s",
                completed.analysis_run_item_id,
                name,
            )
            artifacts[name] = {
                **artifacts[name],
                "available": False,
                "generation_status": "failed",
            }

    event = completed.model_copy(
        update={
            "event_id": artifact_event_id(
                completed.analysis_run_item_id,
                max(
                    artifact.get("generation_attempt", 0)
                    for artifact in artifacts.values()
                ),
                "finished",
            ),
            "outputs": outputs,
        }
    )
    execution_repository.put(
        completed.analysis_run_item_id,
        ExecutionRecord(fingerprint, event),
    )
    for name in deferred:
        if artifacts[name].get("available") is True:
            try:
                execution_repository.delete_artifact_source(
                    completed.analysis_run_item_id, name
                )
            except Exception:
                logger.exception(
                    "Could not remove video source: item_id=%s",
                    completed.analysis_run_item_id,
                )
    _deliver_callback_without_interrupting(event)


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


@executions_router.post(
    "/internal/pipeline-executions/{analysis_run_item_id}/particle-animation/retry",
    response_model=ArtifactRetryAccepted,
    status_code=202,
    responses={404: {"model": ErrorEnvelope}, 409: {"model": ErrorEnvelope}},
    tags=["executions"],
    summary="保存済み粒子履歴から失敗した動画だけを再生成する",
)
def retry_particle_animation(
    analysis_run_item_id: str,
    request: ArtifactRetryRequest,
    background_tasks: BackgroundTasks,
) -> ArtifactRetryAccepted:
    if set(request.output_artifacts) != {
        "particle_animation",
        "particle_animation_mp4",
    }:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_artifact_targets",
                "message": "WebM and MP4 upload targets are required",
            },
        )
    if (
        request.output_artifacts["particle_animation_mp4"].manifest_name
        != "particle_animation"
    ):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_artifact_targets",
                "message": "MP4 target must use the particle_animation manifest name",
            },
        )
    try:
        event, source = execution_repository.begin_artifact_retry(
            analysis_run_item_id, "particle_animation"
        )
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={"code": "execution_not_found", "message": "execution not found"},
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": str(exc),
                "message": "Video cannot be retried; its source may be unavailable",
            },
        ) from exc
    if source is not None:
        record = execution_repository.get(analysis_run_item_id)
        assert record is not None
        background_tasks.add_task(_deliver_callback_without_interrupting, event)
        background_tasks.add_task(
            _finish_deferred_artifacts,
            event,
            {
                "particle_animation": lambda: ParticleAnimation.deserialize(
                    source
                ).render()
            },
            request.output_artifacts,
            record.fingerprint,
        )
    return ArtifactRetryAccepted(
        analysis_run_item_id=analysis_run_item_id,
        generation_attempt=event.outputs["output_manifest"]["artifacts"][
            "particle_animation"
        ].get("generation_attempt", 0),
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
