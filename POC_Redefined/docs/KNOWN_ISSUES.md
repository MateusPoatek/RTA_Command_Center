# Known issues — lessons learned

## Google Cloud auth/webhook endpoints intermittently reject valid requests (transient, not our bug)

**Symptom:** a request to a Google-hosted endpoint fails with an auth or server error even though
the exact same credentials/payload succeed on retry seconds later.

**Confirmed instances:**
- **GTT API auth** (`gtt_adapter._mint_token`, via `oauth2.googleapis.com`): self-signed JWTs were
  rejected with `invalid_grant: Invalid JWT Signature` on ~65-70% of individual attempts. The same
  JWT was verified locally against its own public key with `pyjwt` and always passed — ruling out a
  bad/revoked key, a corrupted crypto stack (rebuilding the venv on Python 3.12 + OpenSSL made no
  difference), and clock skew (checked via `sntp`, ~60ms drift). The rejection happens on Google's
  side. Fixed 2026-09-11 with an 8-attempt retry (1s sleep) in `_mint_token` — measured 12/12
  successes after the fix.
- **Google Chat webhook dispatch** (`local_api.py`'s `/dispatch-alert`): the exact same class of
  failure — `503 Service Unavailable` from `chat.googleapis.com` on a valid webhook URL, succeeding
  immediately on retry. First seen 2026-09-04 (fixed ad hoc that session by manually retrying).
  Given a permanent fix 2026-09-11: `/dispatch-alert` now retries up to 4 times on 5xx responses
  only (a 4xx means the request/webhook itself is wrong and won't fix itself on retry).

**Lesson:** when a Google-hosted endpoint call fails with what looks like an auth/signature/server
error, don't assume the credential is dead — retry with the identical request first. If retries
consistently succeed, the fix is retry-with-backoff at the call site, not touching the credential.
Only chase the credential itself if retries also consistently fail.

## `.env` was never actually loaded — env vars had to be re-exported by hand every session

**Symptom:** `GCHAT_WEBHOOK_EPIC` (and any other secret meant to live in `POC_Redefined/.env`) would
appear "not configured" even though it had worked in a previous session — because it never had
worked automatically. Every prior session (2026-08-31, 09-01, 09-02, 09-04) required manually
`export`ing the webhook URL inline before starting `local_api.py`; nothing ever read `.env` itself.
This looked identical to "the webhook stopped working" but was actually "nobody exported it this
time."

**Fixed 2026-09-11:** `local_api.py` now auto-loads `POC_Redefined/.env` at startup (a small stdlib
loader, no new dependency — `os.environ.setdefault()` so an explicit shell export still wins). The
real webhook URL is persisted in `.env` (gitignored, never committed).

**Lesson:** if a documented `.env.example` says "no dotenv loader wired up, export manually," that's
a standing trap for exactly this kind of false regression report. Wire the loader once instead of
re-explaining the manual-export step every session.
