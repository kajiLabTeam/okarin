from src.schemas.analysis import AnalyzeRequest


class DefaultRikkaStrategy:
    name = "default_rikka"

    def run(self, request: AnalyzeRequest) -> None:
        # TODO: raw download, rikka function dispatch, result upload, callback
        _ = request
