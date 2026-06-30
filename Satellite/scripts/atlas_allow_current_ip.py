"""Add THIS machine's current public IP to the MongoDB Atlas project allowlist.

Why: the Satellite service talks to a MongoDB Atlas cluster (mongodb+srv://...). Atlas
rejects connections from IPs not on the project's Network Access list, so a dev on a
changing/dynamic IP (home Wi-Fi, hotspot, VPN) hits `connection ... buffering timed out`
until they manually re-add their IP in the Atlas UI. This automates that one click.

Usage:
    python Satellite/scripts/atlas_allow_current_ip.py

Requires three values (env var OR Satellite/.env):
    ATLAS_PUBLIC_KEY    Atlas API key (public part)   — Project Access Manager → API Keys
    ATLAS_PRIVATE_KEY   Atlas API key (private part)
    ATLAS_PROJECT_ID    Atlas Project (group) id, 24-hex — from the Atlas URL / Project Settings
    ATLAS_IP_TTL_HOURS  (optional) auto-expire the entry after N hours (Atlas deleteAfterDate)

NB: the Atlas API key is NOT the database user in MONGO_URI — create a Project API key.
Safe to wire into startup: if the keys aren't set, or anything fails, it prints a notice
and exits 0 so it never blocks the stack from launching. Uses only the Python stdlib
(urllib digest auth) — no pip installs.
"""
import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))


def _load_env_file(path: str) -> None:
    """Shallow .env loader (KEY=VALUE); does not override real environment vars."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _public_ip() -> str | None:
    for url in ("https://api.ipify.org", "https://checkip.amazonaws.com"):
        try:
            with urllib.request.urlopen(url, timeout=8) as r:
                ip = r.read().decode().strip()
                if ip:
                    return ip
        except Exception:
            continue
    return None


def main() -> int:
    _load_env_file(os.path.join(HERE, "..", ".env"))

    pub = os.environ.get("ATLAS_PUBLIC_KEY")
    priv = os.environ.get("ATLAS_PRIVATE_KEY")
    gid = os.environ.get("ATLAS_PROJECT_ID") or os.environ.get("ATLAS_GROUP_ID")
    if not (pub and priv and gid):
        print("[atlas-ip] ATLAS_PUBLIC_KEY / ATLAS_PRIVATE_KEY / ATLAS_PROJECT_ID not set "
              "— skipping IP allowlist auto-add.")
        return 0

    ip = _public_ip()
    if not ip:
        print("[atlas-ip] could not determine current public IP — skipping.")
        return 0

    entry = {"ipAddress": ip, "comment": f"dev auto-add {datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}"}
    ttl = os.environ.get("ATLAS_IP_TTL_HOURS")
    if ttl:
        try:
            expire = datetime.now(timezone.utc) + timedelta(hours=float(ttl))
            entry["deleteAfterDate"] = f"{expire:%Y-%m-%dT%H:%M:%SZ}"
        except ValueError:
            print(f"[atlas-ip] ignoring non-numeric ATLAS_IP_TTL_HOURS={ttl!r}")

    url = f"https://cloud.mongodb.com/api/atlas/v2/groups/{gid}/accessList"
    body = json.dumps([entry]).encode()

    # HTTP Digest auth (Atlas API keys) via stdlib — no requests dependency.
    mgr = urllib.request.HTTPPasswordMgrWithDefaultRealm()
    mgr.add_password(None, "https://cloud.mongodb.com", pub, priv)
    opener = urllib.request.build_opener(urllib.request.HTTPDigestAuthHandler(mgr))

    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Accept", "application/vnd.atlas.2023-11-15+json")
    req.add_header("Content-Type", "application/json")

    try:
        with opener.open(req, timeout=15) as resp:
            print(f"[atlas-ip] added {ip} to Atlas project {gid} allowlist (HTTP {resp.status}).")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        if e.code == 409 or "already exists" in detail.lower() or "DUPLICATE" in detail:
            print(f"[atlas-ip] {ip} already in allowlist — nothing to do.")
        else:
            # Don't break startup on an API error — just report it.
            print(f"[atlas-ip] FAILED (HTTP {e.code}): {detail[:300]}")
    except Exception as e:
        print(f"[atlas-ip] error contacting Atlas API: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
