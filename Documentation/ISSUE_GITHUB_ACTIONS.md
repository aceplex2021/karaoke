# INFRA — Add GitHub Actions CI + kara2 deploy

| Field | Value |
|-------|-------|
| **Issue ID** | `INFRA-GHA-KARA2-001` |
| **Status** | ADDED — runner setup still required for deploy |
| **Created** | 2026-11-27 |

## Problem

Repo had no `.github/workflows`; Actions / workflow path 404’d.

## Change

- `ci.yml` — typecheck + build on GitHub-hosted runners  
- `deploy-kara2.yml` — compose rebuild on self-hosted `kara2` runner  
- `Documentation/GITHUB_ACTIONS_KARA2.md` — setup guide  

## Test plan

- [ ] Actions tab lists CI + Deploy kara2  
- [ ] CI runs on push  
- [ ] After runner install: Deploy kara2 succeeds on push  
