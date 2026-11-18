from __future__ import annotations

from io import BytesIO
from typing import Any

import pandas as pd
import rikka.legacy_analysis as legacy_analysis
from rikka.analysis_api import AnalysisInputError, execute_method, list_methods
from rikka.analysis_contracts import ExecutionOptions

from src.registry.catalog import pipeline_from_method
from src.schemas.pipeline import ComponentContract
from src.usecases.pipeline_execution import PermanentComponentError


class RikkaComponentExecutor:
    """Rikkaの公開契約をNozomiの実行基盤へ接続する。"""

    def capabilities(self) -> tuple[ComponentContract, ...]:
        return tuple(
            pipeline_from_method(method).components[0] for method in list_methods()
        )

    def execute(
        self,
        component: ComponentContract,
        inputs: dict[str, Any],
        parameters: dict[str, Any],
    ) -> dict[str, Any]:
        method = next(
            (
                method
                for method in list_methods()
                if method.component_id == component.component_id
            ),
            None,
        )
        if method is None:
            raise PermanentComponentError(
                f"unsupported Rikka component: {component.component_id}"
            )
        try:
            if parameters.get("_legacy_trajectory"):
                if method.method_id != "pdr":
                    raise PermanentComponentError(
                        "legacy trajectory compatibility requires pdr"
                    )
                body = legacy_analysis.analyze_to_csv(inputs, parameters)
                frame = pd.read_csv(BytesIO(body))
                return {
                    "trajectory": {
                        "points": [
                            {
                                "x": row.x,
                                "y": row.y,
                                "timestamp_s": None
                                if pd.isna(row.rikka_timestamp_s)
                                else row.rikka_timestamp_s,
                            }
                            for row in frame.itertuples()
                        ],
                        "_legacy_csv": body,
                    }
                }
            return execute_method(
                method.method_id,
                {
                    key: value
                    for key, value in inputs.items()
                    if key != "_ground_truth_csv"
                },
                {
                    key: value
                    for key, value in parameters.items()
                    if key != "_output_artifacts"
                },
                options=ExecutionOptions(
                    requested_artifacts=tuple(parameters.get("_output_artifacts", {})),
                    ground_truth_csv=inputs.get("_ground_truth_csv"),
                ),
            )
        except AnalysisInputError as exc:
            raise PermanentComponentError(str(exc)) from exc
