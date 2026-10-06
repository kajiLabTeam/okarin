from __future__ import annotations

from fastapi.testclient import TestClient

from src.registry.adapter import RikkaAdapter
from src.registry.catalog import initial_catalog
from src.registry.registry import PipelineRegistry
from src.schemas.pipeline import (
    AssetContract,
    DataType,
)
from src.server import app

ACCE = AssetContract(data_type=DataType.ACCE, schema_version="1", format="csv")
GYRO = AssetContract(data_type=DataType.GYRO, schema_version="1", format="csv")


def test_catalog_lists_four_initial_pipelines() -> None:
    catalog = initial_catalog()
    assert len(catalog) == 4
    ids = [d.pipeline_id for d in catalog]
    assert ids == [
        "pdr",
        "pdr-particle-filter",
        "pdr-ble",
        "pdr-particle-filter-ble",
    ]


def test_registry_computes_deterministic_digest() -> None:
    registry = PipelineRegistry(initial_catalog(), RikkaAdapter())
    snapshot1 = registry.resolve("pdr")
    snapshot2 = registry.resolve("pdr")
    assert snapshot1 is not None and snapshot2 is not None
    assert snapshot1.digest == snapshot2.digest
    assert len(snapshot1.digest) == 64


def test_unsupported_rikka_component_marks_availability_false() -> None:
    registry = PipelineRegistry(initial_catalog(), RikkaAdapter())
    snapshot = registry.resolve("pdr")
    assert snapshot is not None
    assert not snapshot.availability.available
    assert snapshot.availability.reason is not None
    assert snapshot.availability.reason.code == "unsupported_component"


def test_get_pipelines_api_returns_catalog() -> None:
    client = TestClient(app)
    response = client.get("/pipelines")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 4
    assert data[0]["pipeline_id"] == "pdr"
    assert "digest" in data[0]


def test_get_internal_pipeline_by_id_returns_snapshot() -> None:
    client = TestClient(app)
    response = client.get("/internal/pipelines/pdr")
    assert response.status_code == 200
    data = response.json()
    assert data["definition"]["pipeline_id"] == "pdr"
    assert "digest" in data


def test_get_internal_pipeline_unknown_returns_404() -> None:
    client = TestClient(app)
    response = client.get("/internal/pipelines/unknown-id")
    assert response.status_code == 404
    data = response.json()
    assert data["detail"]["code"] == "unknown_pipeline"
