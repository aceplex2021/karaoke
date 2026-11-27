#!/usr/bin/env python3
import json
import subprocess
import urllib.request

url = subprocess.check_output(
    ["git", "-C", "/root/trading", "remote", "get-url", "origin"], text=True
).strip()
pat = url.split("://", 1)[1].split("@", 1)[0].split(":", 1)[1]
req = urllib.request.Request(
    "https://api.github.com/repos/aceplex2021/karaoke/actions/runs?per_page=8",
    headers={
        "Authorization": f"Bearer {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    },
)
with urllib.request.urlopen(req, timeout=30) as resp:
    data = json.loads(resp.read().decode())
for r in data.get("workflow_runs", []):
    print(r["name"], r["status"], r.get("conclusion"), r["html_url"])
