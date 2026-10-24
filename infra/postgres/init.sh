#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$APP_DB_PASSWORD" -v keycloak_password="$KEYCLOAK_DB_PASSWORD" -v flowable_password="$FLOWABLE_DB_PASSWORD" <<'SQL'
CREATE USER schoolops WITH PASSWORD :'app_password';
CREATE DATABASE schoolops OWNER schoolops;
CREATE USER keycloak WITH PASSWORD :'keycloak_password';
CREATE DATABASE keycloak OWNER keycloak;
CREATE USER flowable WITH PASSWORD :'flowable_password';
CREATE DATABASE flowable OWNER flowable;
SQL
