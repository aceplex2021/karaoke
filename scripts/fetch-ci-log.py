#!/usr/bin/env python3
import json
import subprocess
import urllib.request

url = subprocess.check_output(
    ["git", "-C", "/root/trading", "remote", "get-url", "origin"], text=True
).strip()
pat = url.split("://", 1)[1].split("@", 1)[0].split(":", 1)[1]
headers = {
    "Authorization": f"Bearer {pat}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}
req = urllib.request.Request(
    "https://api.github.com/repos/aceplex2021/karaoke/actions/runs/45950926620/jobs",
    headers=headers,
)
with urllib.request.urlopen(req, timeout=30) as resp:
    jobs = json.loads(resp.read().decode())["jobs"]
for job in jobs:
    print("JOB", job["name"], job["conclusion"])
    for s in job.get("steps", []):
        print(" ", s["number"], s["name"], s["conclusion"])
