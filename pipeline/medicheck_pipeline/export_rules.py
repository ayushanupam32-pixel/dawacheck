"""Copy the normalization rules from synonyms.yaml to the web app.

web/lib/ai/salt-rules.json  synonyms, suffixes, forms and release words

The matcher (web/lib/ai/normalize.ts) must normalize salt names read from a strip exactly the way
this pipeline normalized the database, or "Metformin Hydrochloride IP" on a strip would never
equal "metformin" in a composition key. One source of truth (synonyms.yaml), copied, and a test
(tests/test_export_rules.py) fails if the copy is out of date.

Run: uv run python -m medicheck_pipeline.export_rules
"""

import json

from medicheck_pipeline.normalize import rules
from medicheck_pipeline.paths import PIPELINE_DIR

OUT = PIPELINE_DIR.parent / "web" / "lib" / "ai" / "salt-rules.json"
KEYS = [
    "synonyms",
    "strip_suffixes",
    "protect_prefixes",
    "forms",
    "releases",
    "always_delayed_release",
]


def render() -> str:
    data = {"_generated_by": "pipeline/medicheck_pipeline/export_rules.py from synonyms.yaml"}
    data.update({key: rules()[key] for key in KEYS})
    return json.dumps(data, ensure_ascii=False, indent=1) + "\n"


def main() -> None:
    OUT.write_text(render())
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
