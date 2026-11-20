-- S.Y LIVE SERVICE - initial schema
-- Every business (tenant) is logically isolated: every tenant-owned table carries tenant_id
-- and every query in the API layer is scoped by the tenant of the authenticated principal.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Subscription plans (SaaS-ready; no real billing in phase 1)
CREATE TABLE plans (
  id                      text PRIMARY KEY,
  name                    text NOT NULL,
  max_cameras             int  NOT NULL,
  max_users               int  NOT NULL,
  storage_quota_mb        int  NOT NULL,
  max_concurrent_streams  int  NOT NULL,
  max_viewers_per_stream  int  NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plans (id, name, max_cameras, max_users, storage_quota_mb, max_concurrent_streams, max_viewers_per_stream)
VALUES ('pilot', 'פיילוט', 2, 5, 20480, 1, 5),
       ('basic', 'בסיסי', 2, 3, 51200, 2, 5),
       ('pro',   'מקצועי', 10, 25, 512000, 10, 20);

CREATE TABLE tenants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  slug             citext NOT NULL UNIQUE,
  plan_id          text NOT NULL REFERENCES plans(id) DEFAULT 'pilot',
  retention_days   int  NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 3650),
  next_job_number  int  NOT NULL DEFAULT 1000,
  settings         jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_demo          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email               citext NOT NULL UNIQUE,
  full_name           text NOT NULL,
  password_hash       text NOT NULL,
  role                text NOT NULL CHECK (role IN ('owner','admin','technician')),
  is_active           boolean NOT NULL DEFAULT true,
  failed_login_count  int NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  last_login_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_tenant_idx ON users(tenant_id);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE,
  user_agent  text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

-- Customers: phone/email are encrypted at rest (AES-256-GCM); *_hash is an HMAC blind index for lookup.
CREATE TABLE customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  phone_enc   text,
  phone_hash  bytea,
  email_enc   text,
  email_hash  bytea,
  is_demo     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_tenant_idx ON customers(tenant_id);
CREATE INDEX customers_phone_idx ON customers(tenant_id, phone_hash);

CREATE TABLE workstations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE cameras (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workstation_id  uuid REFERENCES workstations(id) ON DELETE SET NULL,
  label           text NOT NULL,
  kind            text NOT NULL DEFAULT 'usb' CHECK (kind IN ('usb','ip')),
  device_label    text,
  last_seen_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workstation_id, device_label)
);

-- Per-tenant customisable workflow statuses
CREATE TABLE job_statuses (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key         text NOT NULL,
  label       text NOT NULL,
  sort_order  int  NOT NULL,
  is_terminal boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE jobs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_number            int  NOT NULL,
  customer_id           uuid REFERENCES customers(id) ON DELETE SET NULL,
  device_type           text NOT NULL,
  device_details        text,
  issue_description     text NOT NULL,
  technician_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  status_key            text NOT NULL,
  received_at           timestamptz NOT NULL DEFAULT now(),
  started_at            timestamptz,
  closed_at             timestamptz,
  parts_replaced        jsonb NOT NULL DEFAULT '[]'::jsonb,
  tech_notes            text,
  summary               text,
  -- Random, unguessable media path name. Never derived from job_number.
  stream_path           text NOT NULL UNIQUE,
  camera_id             uuid REFERENCES cameras(id) ON DELETE SET NULL,
  consent_streaming_at  timestamptz,
  consent_recording_at  timestamptz,
  consent_method        text,
  consent_by_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  is_demo               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, job_number),
  FOREIGN KEY (tenant_id, status_key) REFERENCES job_statuses(tenant_id, key) ON UPDATE CASCADE
);
CREATE INDEX jobs_tenant_status_idx ON jobs(tenant_id, status_key);

CREATE TABLE job_status_history (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Customer viewing links. Only a SHA-256 hash of the 256-bit random token is stored.
CREATE TABLE share_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id            uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  token_hash        bytea NOT NULL UNIQUE,
  pin_hash          text,
  failed_pin_count  int NOT NULL DEFAULT 0,
  max_viewers       int NOT NULL DEFAULT 3 CHECK (max_viewers BETWEEN 1 AND 50),
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  revoked_at        timestamptz,
  last_used_at      timestamptz,
  use_count         int NOT NULL DEFAULT 0
);
CREATE INDEX share_links_job_idx ON share_links(job_id);

CREATE TABLE stream_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id       uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  started_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  profile      jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz
);
CREATE INDEX stream_sessions_job_idx ON stream_sessions(job_id);

CREATE TABLE media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id        uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('photo','video')),
  storage_key   text NOT NULL UNIQUE,
  mime          text NOT NULL,
  size_bytes    bigint NOT NULL,
  sha256        text NOT NULL,
  client_id     text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  captured_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_id)
);
CREATE INDEX media_job_idx ON media(job_id);

CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  actor        text NOT NULL DEFAULT 'user',
  action       text NOT NULL,
  target_type  text,
  target_id    text,
  ip           text,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_tenant_time_idx ON audit_log(tenant_id, created_at DESC);
