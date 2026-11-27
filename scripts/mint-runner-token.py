#!/usr/bin/env python3
"""Mint a GitHub Actions runner registration token for aceplex2021/karaoke."""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

REPO = os.getenv("GITHUB_REPO", "aceplex2021/karaoke")
ENV_CANDIDATES = [
    Path("/root/trading/.env"),
    Path("/root/karaoke/.env"),
    Path.home() / "AI/trading/.env",
]


def load_pat() -> str | None:
    if os.getenv("GH_PAT"):
        return os.getenv("GH_PAT")
    if os.getenv("FVG"):
        return os.getenv("FVG")
    for env_path in ENV_CANDIDATES:
        if not env_path.is_file():
            continue
        for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("FVG=") and not line.startswith("FVG_"):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
            if line.startswith("GH_PAT="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def main() -> int:
    pat = load_pat()
    if not pat:
        print("NO_PAT", file=sys.stderr)
        return 1
    url = f"https://api.github.com/repos/{REPO}/actions/runners/registration-token"
    req = urllib.request.Request(
        url,
        method="POST",
        data=b"{}",
        headers={
            "Authorization": f"Bearer {pat}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    out = Path(os.getenv("TOKEN_OUT", "/tmp/kara2-reg-token"))
    out.write_text(data["token"], encoding="utf-8")
    print(f"TOKEN_OK expires={data.get('expires_at')} out={out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
