# Feature: Mandatory Google sign-in before room entry

**Status:** Deployed on kara2 — verify Google sign-in + room gate  
**Requirement:** Users must Sign in with Google before `/join`, `/create`, or `/room/*`. TV stays ungated. No fingerprint merge in v1.

## Design
- NextAuth (Google provider) + session cookie
- Upsert `kara_users` by `google_sub`; favorites/history use that `user_id`
- Join/create APIs require session; resolve host/participant from `karaUserId` in JWT
- Login UI: Sign in with Google (Apple later)

## Secrets
- `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`
- Never commit secrets. Client secret was shared in chat — **rotate in Google Cloud after deploy**.

## Out of scope (v1)
- Apple Sign In
- Fingerprint → Google merge
- YouTube favorite key rewrite
