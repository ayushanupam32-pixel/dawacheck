"""Address -> coordinates with OpenStreetMap Nominatim, politely and only once per address.

Nominatim's usage policy: at most 1 request per second, an identifying User-Agent, and cache
the results. The cache (pipeline/cache/geocode.json) is committed, so an address is geocoded
once ever, and monthly runs only geocode new or changed addresses.
"""

import json

from medicheck_pipeline.http import PoliteSession
from medicheck_pipeline.paths import PIPELINE_DIR

CACHE_FILE = PIPELINE_DIR / "cache" / "geocode.json"
NOMINATIM = "https://nominatim.openstreetmap.org/search"

_session: PoliteSession | None = None
_cache: dict[str, list[float] | None] | None = None


def _load_cache() -> dict[str, list[float] | None]:
    global _cache
    if _cache is None:
        _cache = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}
    return _cache


def _save_cache() -> None:
    CACHE_FILE.parent.mkdir(exist_ok=True)
    CACHE_FILE.write_text(json.dumps(_load_cache(), ensure_ascii=False, indent=1, sort_keys=True))


def geocode_address(query: str) -> tuple[float, float] | None:
    """Returns (lat, lng) or None. Failed lookups are cached too, so they are not retried."""
    global _session
    cache = _load_cache()
    if query in cache:
        hit = cache[query]
        return (hit[0], hit[1]) if hit else None

    if _session is None:
        _session = PoliteSession(min_interval=1.1)  # Nominatim: max 1 request per second
    resp = _session.get(
        NOMINATIM, params={"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "in"}
    )
    resp.raise_for_status()
    results = resp.json()
    point = (float(results[0]["lat"]), float(results[0]["lon"])) if results else None
    cache[query] = list(point) if point else None
    _save_cache()
    return point
