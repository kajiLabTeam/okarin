from typing import Protocol

from src.schemas.analysis import AnalyzeRequest


class AnalysisStrategy(Protocol):
    name: str

    def run(self, request: AnalyzeRequest) -> None: ...
