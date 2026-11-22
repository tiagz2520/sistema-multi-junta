#!/bin/sh
set +x
set -eu

: "${PGHOST:?Configura PGHOST}"
: "${PGPORT:?Configura PGPORT}"
: "${PGDATABASE:?Configura PGDATABASE}"
: "${PGUSER:?Configura PGUSER}"
: "${PGPASSWORD:?Configura PGPASSWORD}"
: "${POSTGRES_APP_PASSWORD:?Configura POSTGRES_APP_PASSWORD}"
: "${POSTGRES_MIGRATION_PASSWORD:?Configura POSTGRES_MIGRATION_PASSWORD}"

if [ "$POSTGRES_APP_PASSWORD" = "$POSTGRES_MIGRATION_PASSWORD" ] ||
  [ "$POSTGRES_APP_PASSWORD" = "$PGPASSWORD" ] ||
  [ "$POSTGRES_MIGRATION_PASSWORD" = "$PGPASSWORD" ]; then
  printf '%s\n' 'Usa contraseñas distintas para el administrador, la aplicación y las migraciones.' >&2
  exit 1
fi

carriage_return=$(printf '\r')
line_feed='
'
case "$POSTGRES_APP_PASSWORD$POSTGRES_MIGRATION_PASSWORD" in
  *"$carriage_return"* | *"$line_feed"*)
    printf '%s\n' 'Las contraseñas de la aplicación y de migración deben ocupar una sola línea.' >&2
    exit 1
    ;;
esac

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)

# El servicio se ejecuta sin TTY. psql lee el pipe y deriva los verificadores SCRAM en el cliente.
printf '%s\n' \
  "$POSTGRES_APP_PASSWORD" "$POSTGRES_APP_PASSWORD" \
  "$POSTGRES_MIGRATION_PASSWORD" "$POSTGRES_MIGRATION_PASSWORD" |
  psql --no-psqlrc --no-password --single-transaction --set=ON_ERROR_STOP=1 \
    --file="$script_dir/provision.sql"
