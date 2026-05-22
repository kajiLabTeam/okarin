from src.analysis.base import AnalysisStrategy
from src.analysis.default_rikka_strategy import DefaultRikkaStrategy


def get_analysis_strategy() -> AnalysisStrategy:
    return DefaultRikkaStrategy()
