from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.registry.adapter import RikkaAdapter
from src.registry.catalog import initial_catalog
from src.registry.registry import PipelineRegistry
from src.schemas.execution import ErrorEnvelope
from src.schemas.pipeline import PipelineCatalogEntry, PipelineSnapshot

pipelines_router = APIRouter()
registry = PipelineRegistry(initial_catalog(), RikkaAdapter())


@pipelines_router.get(
    "/pipelines",
    response_model=list[PipelineCatalogEntry],
    tags=["pipelines"],
    summary="利用可能な測位Pipelineカタログを取得する",
)
def list_pipelines() -> list[PipelineCatalogEntry]:
    return list(registry.catalog())


@pipelines_router.get(
    "/internal/pipelines/{pipeline_id}",
    response_model=PipelineSnapshot,
    responses={404: {"model": ErrorEnvelope}},
    tags=["pipelines"],
    summary="指定した測位Pipelineの不変定義スナップショットを取得する",
)
def resolve_pipeline(pipeline_id: str) -> PipelineSnapshot:
    snapshot = registry.resolve(pipeline_id)
    if snapshot is None:
        return JSONResponse(
            status_code=404,
            content={
                "detail": {
                    "code": "unknown_pipeline",
                    "message": "Unknown pipeline_id",
                }
            },
        )  # type: ignore[return-value]
    return snapshot
