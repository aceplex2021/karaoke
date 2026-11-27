-- Google OAuth identity on kara_users (Phase B)
ALTER TABLE kara_users
  ADD COLUMN IF NOT EXISTS google_sub TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kara_users_google_sub
  ON kara_users (google_sub)
  WHERE google_sub IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kara_users_email
  ON kara_users (email)
  WHERE email IS NOT NULL;
