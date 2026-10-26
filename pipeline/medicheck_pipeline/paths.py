"""Where raw downloads and cleaned outputs live, so every script agrees."""

from datetime import date
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = PIPELINE_DIR / "raw"
CLEAN_DIR = PIPELINE_DIR / "clean"


def raw_dir(source: str, on: date | None = None) -> Path:
    """pipeline/raw/<source>/<YYYY-MM-DD>/ — one folder per download, never overwritten."""
    path = RAW_DIR / source / (on or date.today()).isoformat()
    path.mkdir(parents=True, exist_ok=True)
    return path


def latest_raw_dir(source: str) -> Path:
    """The most recent download folder for a source (folder names sort by date)."""
    folders = sorted(p for p in (RAW_DIR / source).iterdir() if p.is_dir())
    if not folders:
        raise FileNotFoundError(f"No raw downloads for {source!r} in {RAW_DIR / source}")
    return folders[-1]
