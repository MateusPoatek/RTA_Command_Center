"""gtt_adapter.py — typed GTT data fetcher.

Promotes the gate probe (gtt_gate.py) into a reusable module that returns
structured GTTRow objects.  Never logs raw PII; email/name are kept in the
dataclass for join purposes but the caller decides what to mask.

Usage:
    from gtt_adapter import fetch_gtt, GTTRow

    rows = fetch_gtt(
        functional_area="FA_CIBC",
        sites="GT - Guatemala - Pradera East",
        date="2026-06-16",
    )
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime

_URL = "https://gttpostmortemreport-1040489670153.europe-west1.run.app"
_DEFAULT_KEY = "GTT_JSON/ti-is-prod-eu-w1-82ce0c6f2e03.json"

# Column indices in the API response (array-of-arrays format, per the docx)
_COL_SITE = 0
_COL_EMAIL = 1
_COL_WORKDAY_ID = 2
_COL_EMPLOYEE = 3
_COL_SUPERVISOR = 4
_COL_COST_CENTER = 5
_COL_SUBGROUP = 6
_COL_STATUS = 7           # "clock_in" | "clock_out"
_COL_DATE_ET = 8          # "YYYY-MM-DD"
_COL_TIME_ET = 9          # "HH:MM:SS"
_COL_DATE_UTC = 12
_COL_TIME_UTC = 13


@dataclass
class GTTRow:
    site: str
    email: str            # PII — mask before logging/displaying
    workday_id: str       # 8-digit numeric string
    employee: str         # "Firstname Lastname" (already normalised by GTT)
    supervisor: str
    cost_center: str
    subgroup: str         # GTT LOB label, e.g. "CIBC", "CIBC - Costco"
    event_type: str       # "clock_in" | "clock_out"
    event_dt_eastern: datetime | None
    event_dt_utc: datetime | None

    # Derived helpers
    @property
    def surname(self) -> str:
        """Surname for name-based join with Verint.

        GTT's `employee` field is "Firstname Surname" — but Central American
        names commonly carry TWO surnames (paternal + maternal, e.g. "Gabriela
        Rivas Marroquin"). Verint's "Last, First" format puts the FULL surname
        (both words) before the comma — see
        gtt_verint_reconciler._verint_surname(). Taking only the last token
        here ("marroquin") would never match Verint's "rivas marroquin" and
        silently pushed every double-surname employee onto the fuzzy-match
        fallback (or dropped them entirely if rapidfuzz wasn't installed).
        Assumption: exactly one first name token — a compound first name
        (e.g. "Maria Jose Rivas Marroquin") would still mismatch; this is a
        strict improvement for the common case, not a perfect parser.
        """
        return " ".join(self.employee.split()[1:]).lower() if self.employee else ""

    @property
    def firstname(self) -> str:
        return self.employee.split()[0].lower() if self.employee else ""


def _mint_token(key_path: str) -> tuple[str, str]:
    """Return (identity_token, service_account_email).

    Google's token endpoint intermittently rejects a self-signed JWT with
    "invalid_grant: Invalid JWT Signature" even though the same JWT verifies
    fine locally against its own public key — confirmed this is a transient
    server-side rejection, not a bad key or a clock/crypto issue on our end.
    Measured per-attempt failure rate against the real endpoint is ~65-70%,
    so this needs enough retries to make success near-certain, not just "a
    few tries".
    # ponytail: fixed retry count/delay, tune if the failure rate changes
    """
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    from google.auth.exceptions import RefreshError
    import time

    creds = service_account.IDTokenCredentials.from_service_account_file(
        key_path, target_audience=_URL
    )
    max_attempts = 8
    for attempt in range(max_attempts):
        try:
            creds.refresh(Request())
            return creds.token, creds.service_account_email
        except RefreshError:
            if attempt == max_attempts - 1:
                raise
            time.sleep(1)


def _parse_dt(date_str: str, time_str: str) -> datetime | None:
    try:
        return datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


def _parse_row(raw: list) -> GTTRow | None:
    try:
        def _get(idx: int, default: str = "") -> str:
            v = raw[idx] if idx < len(raw) else default
            return str(v).strip() if v is not None else default

        return GTTRow(
            site=_get(_COL_SITE),
            email=_get(_COL_EMAIL),
            workday_id=_get(_COL_WORKDAY_ID),
            employee=_get(_COL_EMPLOYEE),
            supervisor=_get(_COL_SUPERVISOR),
            cost_center=_get(_COL_COST_CENTER),
            subgroup=_get(_COL_SUBGROUP),
            event_type=_get(_COL_STATUS),
            event_dt_eastern=_parse_dt(_get(_COL_DATE_ET), _get(_COL_TIME_ET)),
            event_dt_utc=_parse_dt(_get(_COL_DATE_UTC), _get(_COL_TIME_UTC)),
        )
    except Exception:
        return None


def fetch_gtt(
    functional_area: str,
    sites: str,
    date: str,
    key_path: str | None = None,
    tz: str = "America/Toronto",
    tz_label: str = "Eastern Time (America/Toronto)",
    verbose: bool = False,
) -> list[GTTRow]:
    """Authenticate → POST → return typed GTTRow list.

    Args:
        functional_area: GTT functional area code, e.g. "FA_CIBC".
        sites: Pipe-semicolon-separated site string, e.g. "GT - Guatemala - Pradera East".
        date: Date string "YYYY-MM-DD".
        key_path: Path to GCP SA key JSON.  Falls back to GOOGLE_APPLICATION_CREDENTIALS env var.
        verbose: If True, print progress to stdout.
    """
    import requests

    resolved_key = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or key_path or _DEFAULT_KEY

    token, sa_email = _mint_token(resolved_key)
    if verbose:
        print(f"[gtt-adapter] SA: {sa_email}")

    body = {
        "timezoneLabel": tz_label,
        "functionalArea": functional_area,
        "sites": sites,
        "startDate": f"{date} 00:00:00",
        "endDate": f"{date} 23:59:59",
        "timezone": tz,
    }

    if verbose:
        print(f"[gtt-adapter] POST {_URL} | FA={functional_area!r} date={date}")

    resp = requests.post(
        _URL,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=body,
        timeout=90,
    )

    if resp.status_code != 200:
        raise RuntimeError(
            f"GTT API returned HTTP {resp.status_code}: {resp.text[:300]}"
        )

    data = resp.json()
    raw_rows: list = (
        data if isinstance(data, list)
        else data.get("data") or data.get("rows") or []
    )

    rows = [r for raw in raw_rows if (r := _parse_row(raw)) is not None]

    if verbose:
        print(f"[gtt-adapter] {len(rows)} rows parsed ({len(raw_rows)} raw)")

    return rows
