"""Polite HTTP for government sites: clear User-Agent, rate limit, retries.

Every fetch_* script goes through `PoliteSession`, so all sources get the same good behaviour.
"""

import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

USER_AGENT = (
    "Medicheck/0.1 (B.Tech class project; monthly low-volume fetch; "
    "https://github.com/ayushanupam32-pixel/medicheck)"
)


class PoliteSession(requests.Session):
    """A requests.Session that waits `min_interval` seconds between requests to the same site."""

    def __init__(self, min_interval: float = 1.0) -> None:
        super().__init__()
        self.min_interval = min_interval
        self._last_request = 0.0
        self.headers["User-Agent"] = USER_AGENT
        # Retry temporary failures (server busy, gateway errors) with growing waits: 2s, 4s, 8s.
        retry = Retry(
            total=3,
            backoff_factor=2,
            status_forcelist=[429, 502, 503, 504],
            allowed_methods=["GET", "POST"],
        )
        self.mount("https://", HTTPAdapter(max_retries=retry))

    def request(self, method, url, *args, **kwargs):  # type: ignore[override]
        wait = self.min_interval - (time.monotonic() - self._last_request)
        if wait > 0:
            time.sleep(wait)
        kwargs.setdefault("timeout", 60)
        try:
            return super().request(method, url, *args, **kwargs)
        finally:
            self._last_request = time.monotonic()
