"""Turn CDSCO's prohibited-FDC PDFs into one table: pipeline/clean/banned_fdcs.csv.

Input: the PDFs saved by fetch_cdsco_fdc.py. We read the documents that are tables of
prohibited drugs (picked by title in documents.json): the consolidated list "as on 22.11.2021"
and the later lists (14 FDCs of 2023, 156 of 2024, S(+) Etodolac + Paracetamol of 2024, 16 of
2026) and the list of restricted FDCs. The scanned gazettes are not read: their entries are in
these lists.

For each entry:
- `salts`: the ingredients, normalized like every other source (normalize.py), so a medicine's
  composition can be compared with it. Strengths, forms and words like "IP" are removed from the
  names; the strengths are kept in `strengths` when the entry names them.
- `kind`: "combination" (2+ salts, matchable), "single" (one named drug, e.g. "Phenacetin"), or
  "category" (a description like "Fixed dose combinations of vitamins with analgesics", which
  cannot be matched exactly, so the app never claims a match for it).
- `status`: from the consolidated list's own footnotes (its legend is quoted in STATUS_BY_NOTE):
  prohibited, stayed, quashed, under_examination, revoked_with_conditions, or restricted.

When the same combination appears more than once, the latest notification wins: S(+) Etodolac +
Paracetamol was prohibited in 2018, quashed by the Delhi High Court in 2020, and prohibited again
on 12.08.2024, so its status is "prohibited".

Run: uv run python -m medicheck_pipeline.parse_cdsco_fdc
"""

import json
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import pandas as pd
import pdfplumber

from medicheck_pipeline.normalize import (
    STRENGTH_RE,
    clean_text,
    extract_phrases,
    format_decimal,
    normalize_salt,
    parse_strength,
)
from medicheck_pipeline.paths import CLEAN_DIR, latest_raw_dir

# The consolidated list's footnotes (page 33-34 of "Updated Banned Drugs List.pdf"):
#   1# Presently stayed by the Hon'ble High Court of Madras.
#   2# Prohibition was revoked with following conditions ... (dextropropoxyphene)
#   3# As per Hon'ble Supreme Court order dated 15.12.2017 ... still under examination
#   4# As per Hon'ble Supreme Court order dated 14.02.2019 ... still under examination
#   5# The Notification ... was quashed by Hon'ble Delhi High Court ... matter is sub judice
#   6# Prohibition was revoked ... for Pioglitazone ... subject to following conditions
STATUS_BY_NOTE = {
    "1": "stayed",
    "2": "revoked_with_conditions",
    "3": "under_examination",
    "4": "under_examination",
    "5": "quashed",
    "6": "revoked_with_conditions",
}
NOTE_TEXT = {
    "stayed": "Presently stayed by the High Court of Madras.",
    "revoked_with_conditions": "The prohibition was revoked; the drug may be sold with conditions.",
    "under_examination": "Under examination by an expert committee after Supreme Court orders.",
    "quashed": "The prohibition was quashed by the Delhi High Court; CDSCO has appealed "
    "and the matter is sub judice.",
    "restricted": "Restricted: allowed only under the conditions in the notification.",
    "prohibited": "",
}

COLUMNS = [
    "combination_key",
    "salts",
    "kind",
    "status",
    "description",
    "strengths",
    "salt_strengths",
    "forms",
    "releases",
    "notification",
    "notified_on",
    "status_note",
    "source_title",
    "source_url",
]

_STRENGTH = re.compile(
    r"\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|gm|iu|i\.u\.|%|ml|lac|lakh|million|m)\b"
    r"(?:\s*/\s*\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm|iu|%|ml)?\b)*",
    re.I,
)
# Words that describe the product, not the ingredient ("Nimesulide + Paracetamol dispersible
# tablets", "Mefenamic Acid + Paracetamol Injection", "for human use").
_DESCRIPTORS = re.compile(
    r"\b(ip|bp|usp|for human use|for internal use|human use|preparations?|formulations?|"
    r"hard gelatin|soft gelatin|film coated|uncoated|coated|liquid oral|oral liquid|oral|"
    r"dispersible|tablets?|capsules?|injection|infusion|syrup|suspension|drops?|cream|gel|"
    r"ointment|lotion|powder|granules|sachets?|solution|and its salts|all|containing|with)\b",
    re.I,
)
# Entries whose name in the table is less precise than the document's own legend. Keyed by
# notification number. 5#: "The Notification of S.O. No. 1855 (E) dated 08.06.2017 [S.O. No. 4706
# (E) dated 07.09.2018] pertaining to FDC of S(+) Etodolac + Paracetamol was quashed": the table
# row says only "Etodolac + Paracetamol", but the ban is about S(+) Etodolac. Read literally, it
# would put ordinary (racemic) etodolac + paracetamol medicines "under legal review".
DESCRIPTION_FROM_LEGEND = {"4706": "S(+) Etodolac + Paracetamol"}

_FORM_LIMITED = re.compile(
    r"\b(liquid|oral|ointment|skin|eye|powder|tablets?|capsules?|preparations?|toothpaste|"
    r"cream|injection|syrup|cosmetics?)\b",
    re.I,
)
_VAGUE = re.compile(r"\b(any|other|excluding|except|group|combination|combikit|kit|of)\b")
_DATE = re.compile(r"(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})")


def latest_date(text: str) -> str:
    """The latest dd.mm.yyyy date in a notification cell, as YYYY-MM-DD ('' if none).

    Line wraps in the PDF put spaces inside dates ("Dated3 0.09.1994", "10.03 .2016",
    "18- 6-2013"), so spaces between digits and separators are removed first.
    """
    joined = re.sub(r"(?<=[\d.\-/])\s+(?=[\d.\-/])", "", text)
    dates = []
    for d, m, y in _DATE.findall(joined):
        try:
            dates.append(date(int(y), int(m), int(d)))
        except ValueError:
            continue
    return max(dates).isoformat() if dates else ""


def repair(name: str, vocabulary: set[str]) -> str:
    """Fix words the PDF split ("Cetir izine", "Aden osine triphosphate") or misspelt
    ("Acelofenac", "Dextromethophen").

    Only when the result is a known salt (one our medicine data uses) and the original is not, and
    only when exactly one known salt is that close: 1 letter for names of 8+ letters, 2 letters
    for names of 12+ letters (long chemical names differ by more than 2 letters).
    """
    if not vocabulary or name in vocabulary:
        return name
    words = name.split(" ")
    for i in range(len(words) - 1):  # rejoin one split word
        candidate = " ".join([*words[:i], words[i] + words[i + 1], *words[i + 2 :]])
        if candidate in vocabulary:
            return candidate
    if name.replace(" ", "") in vocabulary:
        return name.replace(" ", "")
    allowed = 2 if len(name) >= 12 else 1 if len(name) >= 8 else 0
    if allowed:
        close = [
            v
            for v in vocabulary
            if abs(len(v) - len(name)) <= allowed and _distance(name, v) <= allowed
        ]
        if len(close) == 1:
            return close[0]
    return name


def _distance(a: str, b: str) -> int:
    """Edit distance: letters to add, remove or change to turn a into b."""
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]


@dataclass
class Parsed:
    """What an entry bans. Every restriction it names is kept, because each one narrows the ban:
    "Aceclofenac (SR) + Paracetamol" bans only the sustained-release form; "Diclofenac +
    Paracetamol injection" only the injection; "Gliclazide 80mg + Metformin 325 mg" only those
    strengths. Matching on the salts alone would call thousands of legal medicines banned.
    """

    salts: list[str]
    kind: str  # combination | single | category
    strengths: str = ""  # as written, for display
    salt_strengths: dict[str, list[str]] = field(default_factory=dict)  # "50:mg", like keys
    forms: list[str] = field(default_factory=list)  # canonical forms named ("injection")
    releases: list[str] = field(default_factory=list)  # release types named ("er", "dr")


def strengths_in(text: str) -> list[str]:
    """ "Glimepiride 1mg/2mg/3mg" -> ["1:mg", "2:mg", "3:mg"]; "250mg/5ml" -> ["50:mg/ml"]."""
    return [
        f"{format_decimal(st.value)}:{st.unit}"
        for st in (parse_strength(m) for m in STRENGTH_RE.finditer(text))
    ]


def split_salts(description: str, vocabulary: set[str]) -> Parsed:
    """ "Glimepiride 1mg/2mg + Pioglitazone 15mg (as HCl)" -> salts, kind and restrictions."""
    text = clean_text(description).rstrip(". ")
    group = re.match(r"^fixed\s+dose\s+combinations?\s+of\s+", text, flags=re.I)
    text = text[group.end() :] if group else text
    # "S(+) Etodolac": the (+) names the S-enantiomer, it is not a separator.
    text = re.sub(r"\b([SRLD])\s*\(\s*[+-]\s*\)\s*-?\s*", lambda m: f"{m[1].lower()}-", text)
    strengths = " ; ".join(m.group(0) for m in _STRENGTH.finditer(text))
    forms, _ = extract_phrases(text, "forms")
    releases, _ = extract_phrases(text, "releases")
    restrictions = {"forms": sorted(forms), "releases": sorted(set(releases) - {"ir"})}
    parts = [p for p in re.split(r"\s*\+\s*", text) if p.strip()]
    if len(parts) < 2 and group:
        return Parsed([], "category", strengths)  # "FDCs of vitamins with analgesics"
    if len(parts) < 2 and _FORM_LIMITED.search(text):
        # "Tetracycline Liquid Oral preparations": only some forms are banned. Matching on the
        # drug alone would wrongly flag legal tetracycline capsules, so this is not matched.
        return Parsed([], "category", strengths)
    if len(parts) < 2:
        # One named drug ("Phenacetin") or a description of a group.
        words = re.sub(r",?\s*(its salts|as a drug)\b", " ", text, flags=re.I)
        words = _DESCRIPTORS.sub(" ", re.sub(r"\([^)]*\)", " ", words))
        words = re.sub(r"\s+", " ", words).strip(" ,.")
        if re.search(r"\b(of|in|and|or|any|other|group|agents?|than|except)\b", words, re.I):
            return Parsed([], "category", strengths)
        return Parsed([repair(normalize_salt(words), vocabulary)], "single", strengths)

    salts: list[str] = []
    salt_strengths: dict[str, list[str]] = {}
    for part in parts:
        p = re.sub(r"\([^)]*\)?", " ", part)  # "(As enteric coated tablet)", "(A)"
        p = re.sub(r"\b(?:eq\.?|equivalent)\s+to\b.*$", " ", p, flags=re.I)
        p = _STRENGTH.sub(" ", p)
        _, p = extract_phrases(p, "forms")
        _, p = extract_phrases(p, "releases")
        p = _DESCRIPTORS.sub(" ", p)
        p = re.sub(r"[^A-Za-z0-9\s\-()']", " ", p)
        p = re.sub(r"\s+", " ", p).strip(" -")
        salt = repair(normalize_salt(p), vocabulary) if p else ""
        if salt:
            salts.append(salt)
            if found := strengths_in(part):
                salt_strengths[salt] = found
    # A part that is a description, not a drug ("Corticosteroids + any other drug excluding
    # ...", "Combikit of ..."), or two parts naming the same salt ("Chlorpheniramine +
    # Chlorpheniramine maleate"): we cannot tell exactly what is banned, so it is not matched.
    if any(_VAGUE.search(x) for x in salts) or len(set(salts)) < len(salts):
        return Parsed([], "category", strengths)
    return Parsed(
        sorted(salts),
        "combination" if len(salts) >= 2 else "single",
        strengths,
        salt_strengths,
        **restrictions,
    )


def table_rows(pdf_path: Path) -> list[list[str]]:
    with pdfplumber.open(pdf_path) as pdf:
        return [
            [clean_text(c or "") for c in row]
            for page in pdf.pages
            for table in page.extract_tables()
            for row in table
            if len(row) >= 3
        ]


def entries(rows: list[list[str]]) -> list[dict]:
    """Join a table's rows into entries: a number in the first column starts a new one."""
    out: list[dict] = []
    for serial, name, notification, *_ in rows:
        notes = re.findall(r"(\d)\s*#", f"{serial} {name}")
        starts = re.match(r"^\d+\s*\.", serial)
        if starts:
            out.append({"description": "", "notification": "", "notes": set()})
        if not out or re.match(r"^(s\.?\s*no|sr\.?\s*no)", serial, re.I):
            continue
        entry = out[-1]
        entry["description"] = f"{entry['description']} {re.sub(r'\d\s*#', ' ', name)}".strip()
        entry["notification"] = f"{entry['notification']} {notification}".strip()
        entry["notes"].update(notes)
    for entry in out:
        entry["description"] = re.sub(r"\s+", " ", entry["description"]).strip()
        entry["notification"] = re.sub(r"\s+", " ", entry["notification"]).strip()
    return [e for e in out if e["description"]]


def status_of(entry: dict, restricted: bool) -> str:
    if restricted:
        return "restricted"
    for note in sorted(entry["notes"]):
        if note in STATUS_BY_NOTE:
            return STATUS_BY_NOTE[note]
    # Analgin: "Initial suspension ... Was revoked allowing the use of drug with certain condition"
    if re.search(r"\brevoked\b", entry["notification"], re.I):
        return "revoked_with_conditions"
    return "prohibited"


def known_salts() -> set[str]:
    """Salt names already in our data (Jan Aushadhi + brands), for repairing split words."""
    vocabulary: set[str] = set()
    for name in ("ja_products.csv", "brands.csv"):
        path = CLEAN_DIR / name
        if path.exists():
            for cell in pd.read_csv(path, usecols=["ingredients"])["ingredients"].dropna():
                vocabulary.update(i["salt"] for i in json.loads(cell))
    return vocabulary


def parse(folder: Path, vocabulary: set[str]) -> pd.DataFrame:
    documents = json.loads((folder / "documents.json").read_text())
    rows = []
    for doc in documents:
        title = doc["title"]
        if not re.match(r"^(list of|updated banned)", title, re.I):
            continue  # gazettes (scanned or bilingual) and notices
        restricted = bool(re.search(r"restricted", title, re.I))
        for entry in entries(table_rows(folder / doc["file"])):
            number = re.search(r"S\.?\s*O\.?\s*(?:No\.?)?\s*(\d+)", entry["notification"])
            if number and number[1] in DESCRIPTION_FROM_LEGEND:
                entry["description"] = DESCRIPTION_FROM_LEGEND[number[1]]
            parsed = split_salts(entry["description"], vocabulary)
            status = status_of(entry, restricted)
            rows.append(
                {
                    "combination_key": "|".join(parsed.salts) if parsed.kind != "category" else "",
                    "salts": json.dumps(parsed.salts),
                    "kind": parsed.kind,
                    "status": status,
                    "description": entry["description"],
                    "strengths": parsed.strengths,
                    "salt_strengths": json.dumps(parsed.salt_strengths),
                    "forms": json.dumps(parsed.forms),
                    "releases": json.dumps(parsed.releases),
                    "notification": entry["notification"],
                    "notified_on": latest_date(entry["notification"]),
                    "status_note": NOTE_TEXT[status],
                    "source_title": title,
                    "source_url": doc.get("pdf_url", ""),
                }
            )
    df = pd.DataFrame(rows, columns=COLUMNS)
    # The same combination in several documents: the latest notification decides. "Same" means
    # same salts AND same strengths: Glimepiride + Pioglitazone + Metformin is prohibited in some
    # strengths and quashed (sub judice) in others, and those must stay separate entries.
    matchable = df[df["combination_key"] != ""].sort_values("notified_on", kind="stable")
    latest = matchable.drop_duplicates(
        ["combination_key", "salt_strengths", "forms", "releases"], keep="last"
    )
    return pd.concat([latest, df[df["combination_key"] == ""]], ignore_index=True)


def main() -> None:
    folder = latest_raw_dir("cdsco_fdc")
    df = parse(folder, known_salts())
    CLEAN_DIR.mkdir(exist_ok=True)
    out = CLEAN_DIR / "banned_fdcs.csv"
    df.to_csv(out, index=False)
    print(f"{len(df)} entries from {folder.name} -> {out}")
    print(df.groupby(["kind", "status"]).size().to_string())


if __name__ == "__main__":
    main()
