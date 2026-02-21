#!/bin/bash
# Mazza Finance — Postgres Initialization
# Runs automatically on first container start via docker-entrypoint-initdb.d.
#
# Creates a least-privilege runtime user (mazza_app) and the mazza_finance
# database. Shell script used instead of .sql so $POSTGRES_APP_PASSWORD
# is available from the container environment.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE USER mazza_app WITH PASSWORD '$POSTGRES_APP_PASSWORD';
    CREATE DATABASE mazza_finance;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "mazza_finance" <<-EOSQL
    -- Grant connection access
    GRANT CONNECT ON DATABASE mazza_finance TO mazza_app;

    -- Grant schema usage and DDL (CREATE required for Drizzle migrations)
    GRANT USAGE, CREATE ON SCHEMA public TO mazza_app;

    -- Grant DML on all existing and future tables
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mazza_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mazza_app;

    -- Grant sequence access (needed for uuid/serial columns)
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mazza_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO mazza_app;
EOSQL
