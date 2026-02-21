-- Mazza Finance — Postgres Initialization
-- Runs automatically on first container start via docker-entrypoint-initdb.d.
--
-- Creates a least-privilege runtime user (mazza_app) with DML-only access.
-- The postgres superuser is not used at runtime.

-- Create the application runtime user
CREATE USER mazza_app WITH PASSWORD :'POSTGRES_APP_PASSWORD';

-- Create the application database owned by the superuser
-- (mazza_app cannot CREATE DATABASE — that requires superuser)
CREATE DATABASE mazza_finance;

-- Grant connection access to the application user
GRANT CONNECT ON DATABASE mazza_finance TO mazza_app;

\connect mazza_finance

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO mazza_app;

-- Grant DML on all existing tables (none yet, but covers future manual creates)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mazza_app;

-- Automatically grant DML on all future tables created by postgres superuser
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mazza_app;

-- Grant sequence access (needed for gen_random_uuid() and serial columns)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mazza_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO mazza_app;

-- Explicitly deny DDL (CREATE, DROP, ALTER) — mazza_app must not modify schema
REVOKE CREATE ON SCHEMA public FROM mazza_app;
