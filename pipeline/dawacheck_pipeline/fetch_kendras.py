"""Download the list of Jan Aushadhi Kendras (stores), state by state.

Source: the "Locate Kendra" feature on janaushadhi.gov.in, which loads Kendras per state from a
public JSON endpoint. As with the product list, we first get the anonymous guest token every
visitor's browser gets, then ask for each state in turn, 2 seconds apart (36 states/UTs ≈ 75 s).
The endpoint refuses an empty state, so there is no single all-India request.

Output: pipeline/raw/kendras/<today>/states.json and state_<census code>.json: the responses as
received, except that the owner's personal name (contactPerson) is removed.

Run: uv run python -m dawacheck_pipeline.fetch_kendras
"""

import json

from dawacheck_pipeline.fetch_jan_aushadhi import API_BASE
from dawacheck_pipeline.http import PoliteSession
from dawacheck_pipeline.paths import raw_dir

SOURCE_PAGE = "https://janaushadhi.gov.in/near-by-kendra"
PERSONAL_FIELD = "contactPerson"


def main() -> None:
    session = PoliteSession(min_interval=2.0)
    session.headers.update({"Origin": "https://janaushadhi.gov.in", "Referer": SOURCE_PAGE})
    token_resp = session.get(f"{API_BASE}/auth/generateGuestToken")
    token_resp.raise_for_status()
    session.headers["Authorization"] = f"Bearer {token_resp.json()['responseBody']}"

    out = raw_dir("kendras")
    states_resp = session.get(f"{API_BASE}/api/kendra/getAllStateOfIndia")
    states_resp.raise_for_status()
    states = states_resp.json()["data"]
    (out / "states.json").write_text(json.dumps(states, ensure_ascii=False, indent=1))

    total = 0
    for state in states:
        # The Kendra API identifies a state by its census code (Delhi = 7), not by its row id.
        code = state["stateCode"]
        resp = session.post(
            f"{API_BASE}/api/v1/website/getAllKendraByStateDistrict",
            json={
                "pageIndex": 0,
                "pageSize": 0,  # 0 = no paging, the whole state
                "stateId": str(code),
                "districtId": "",
                "pinCode": 0,
                "storeCode": "",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        kendras = (data.get("responseBody") or {}).get("addKendraResponseList") or []
        # The one change we make to the raw response: drop the owner's personal name.
        # DawaCheck doesn't need it, and the raw files are published in the repository.
        for kendra in kendras:
            kendra.pop(PERSONAL_FIELD, None)
        (out / f"state_{code}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
        total += len(kendras)
        print(f"{state['stateNameInEnglish']}: {len(kendras)}")

    print(f"Saved {total} Kendras from {len(states)} states/UTs to {out}")


if __name__ == "__main__":
    main()
