"""
verint_client.py — Server-side Verint WFM API client.

Authenticates to Verint SaaS directly using requests.Session().
No browser, no Playwright, no Citrix dependency.

The API shape (calendar-filter endpoint, request body, response schema) was
proven by the POC browser extension. The only piece requiring manual discovery
is the login endpoint — see _login() and the comment block below.

BEFORE USE: Discover the login endpoint
  1. Open Chrome DevTools → Network tab
  2. Log into your Verint tenant
  3. Find the POST request to the login/auth endpoint
  4. Note: URL path, request body, response headers (Set-Cookie + impact360authtoken)
  5. Update _login() with the confirmed values
"""

from __future__ import annotations

import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)


class VerintClient:
    """
    Authenticated client for Verint WFM SaaS.

    Usage:
        client = VerintClient(
            base_url="https://wfo.a87.verintcloudservices.com",
            username="svc_rta_automation",
            password="...",
        )
        roster = client.fetch_roster()  # list of resourceData dicts
    """

    def __init__(self, base_url: str, username: str, password: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/vnd.api+json, application/json",
                "Content-Type": "application/json",
                "User-Agent": "RTA-Automation/1.0",
            }
        )
        self._login(username, password)

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    def _login(self, username: str, password: str) -> None:
        """
        Authenticate to Verint. Sets session cookies + impact360authtoken header.

        *** LOGIN ENDPOINT NOT YET CONFIRMED ***

        To confirm: open Chrome DevTools → Network tab → log into Verint →
        find the POST to the login/auth endpoint and note:
          - URL path (update LOGIN_PATH below)
          - Request body fields (update the json= dict below)
          - Where impact360authtoken appears (response header or JSON body)

        Common Verint patterns observed in the wild:
          /rest/WFO_REST/API/login          (older on-prem versions)
          /api/wfm/main/v1/login            (SaaS v1)
          /wfo/logon                        (form-POST, URL-encoded)
        """
        LOGIN_PATH = "/api/wfm/main/v1/login"  # ← confirm from DevTools

        logger.info("Authenticating to Verint at %s", self.base_url)
        r = self.session.post(
            f"{self.base_url}{LOGIN_PATH}",
            json={"username": username, "password": password},  # ← confirm body shape
            timeout=30,
            allow_redirects=True,
        )
        r.raise_for_status()

        # impact360authtoken may appear in response header or JSON body — try both.
        token = (
            r.headers.get("impact360authtoken")
            or r.headers.get("Impact360AuthToken")
            or _dig(r.json(), "data", "attributes", "token")
            or _dig(r.json(), "impact360authtoken")
            or _dig(r.json(), "token")
        )
        if token:
            self.session.headers.update({"impact360authtoken": token})
            logger.info("Login successful; impact360authtoken acquired")
        else:
            # Session cookie may be sufficient — log a warning but don't abort.
            logger.warning(
                "impact360authtoken not found in login response. "
                "Will proceed with session cookies only. "
                "Check DevTools capture if calendar-filter calls return 401."
            )

    # ------------------------------------------------------------------
    # Verint calendar-filter (the proven endpoint)
    # ------------------------------------------------------------------

    def _calendar_filter(
        self,
        offset: int = 0,
        work_resource_ids: list[int] | None = None,
    ) -> list[dict]:
        """
        Single call to the proven calendar-filter endpoint.

        Endpoint captured from live production session by the POC browser extension.
        Request body format: JSON:API with calendarFilterCriteria.
        """
        body: dict[str, Any] = {
            "data": {
                "attributes": {
                    "calendarFilterCriteria": {
                        "offset": offset,
                        "workResourceWorkspaceCriteria": {
                            "useAllEmployees": work_resource_ids is None,
                            "workResourceIds": work_resource_ids or [],
                        },
                    }
                }
            }
        }
        r = self.session.post(
            f"{self.base_url}/api/wfm/main/v2/calendar-filter",
            json=body,
            timeout=30,
        )
        r.raise_for_status()
        return r.json()["data"]["attributes"]["resourceData"]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def fetch_roster(self) -> list[dict]:
        """
        Fetch all agents by paging (offset=0, 50, 100, …) until the page is short.

        Returns the merged resourceData[] list — same schema that parse.js and
        gtt_verint_reconciler.py already handle.
        """
        all_rows: list[dict] = []
        offset = 0
        while True:
            logger.debug("calendar-filter offset=%d", offset)
            rows = self._calendar_filter(offset=offset)
            all_rows.extend(rows)
            if len(rows) < 50:
                break
            offset += 50
        logger.info("Fetched %d agents from Verint", len(all_rows))
        return all_rows

    def fetch_roster_by_ids(self, work_resource_ids: list[int]) -> list[dict]:
        """
        V2/V3 gate variant — fetch a specific set of agents in one call.

        Proven by the POC gate probe (June 2026): Verint accepts arbitrary
        cross-page, cross-LOB workResourceId batches without restriction.
        Use this when agent IDs are known from a prior census call.
        """
        logger.debug("calendar-filter by-ids count=%d", len(work_resource_ids))
        rows = self._calendar_filter(work_resource_ids=work_resource_ids)
        logger.info("Fetched %d agents by ID batch", len(rows))
        return rows


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _dig(obj: Any, *keys: str) -> Any:
    """Safely walk a nested dict; return None if any key is missing."""
    for k in keys:
        if not isinstance(obj, dict):
            return None
        obj = obj.get(k)
    return obj


# ------------------------------------------------------------------
# Quick smoke-test (python verint_client.py)
# ------------------------------------------------------------------

if __name__ == "__main__":
    import os
    import json

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    url = os.environ.get("VERINT_URL", "https://wfo.a87.verintcloudservices.com")
    user = os.environ.get("VERINT_USER") or input("Verint username: ")
    pw = os.environ.get("VERINT_PASS") or input("Verint password: ")

    client = VerintClient(url, user, pw)
    roster = client.fetch_roster()

    print(f"\n{len(roster)} agents fetched")
    if roster:
        print("Keys:", list(roster[0].keys()))
        print("First agent sample:")
        print(json.dumps(roster[0], indent=2, default=str)[:800])
