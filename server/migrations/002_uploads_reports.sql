-- Resumable (chunked) uploads for large recordings.
-- A client creates an upload, sends chunks in order (offset must equal bytes received so far),
-- and completes it; the finished file becomes a normal row in `media`.
CREATE TABLE uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id        uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('photo','video')),
  mime          text NOT NULL,
  total_size    bigint NOT NULL CHECK (total_size > 0),
  received      bigint NOT NULL DEFAULT 0,
  client_id     text NOT NULL,
  captured_at   timestamptz,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  media_id      uuid REFERENCES media(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id)
);
CREATE INDEX uploads_job_idx ON uploads(job_id);
