import json
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from src.schemas.analysis import AnalyzeRequest


class DefaultRikkaStrategy:
    name = "default_rikka"
    callback_timeout_seconds = 10

    def run(self, request: AnalyzeRequest) -> None:
        payload = {
            "trajectory_id": str(request.trajectory_id),
            "status": "failed",
            "callback_token": request.callback_token,
            "error_code": "NOZOMI_ANALYSIS_NOT_IMPLEMENTED",
            "error_message": "default rikka analysis is not implemented",
        }
        callback_request = UrlRequest(
            str(request.callback_url),
            data=json.dumps(payload).encode("utf-8"),
            headers={"content-type": "application/json"},
            method="POST",
        )

        with urlopen(
            callback_request,
            timeout=self.callback_timeout_seconds,
        ) as response:
            if response.status >= 400:
                msg = f"callback failed with status {response.status}"
                raise RuntimeError(msg)
