# Issue: Queue shows "Anonymous" instead of display name

**Status:** Deployed on kara2  
**DB truth:** `kara_users.display_name` is correct (e.g. Jesse Nguyen).  
**UI/API:** state mapping falls back to `Anonymous` because nested `kara_users` is null.

## Root cause
`pg-admin` `parseSelect`: when select is `*, kara_users!user_id (*)`, encountering `*` returned early and **dropped all nests**.

## Fix
Continue parsing after `*`; keep nests; columns remain `*`.
