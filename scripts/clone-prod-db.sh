#!/usr/bin/env bash
# Replaces the LOCAL dev `gc` schema with a copy of production's: tables, data, indexes,
# primary/foreign keys, sequences. Production is only read (pg_dump takes ACCESS SHARE).
#
#   PROD_DATABASE_URL=postgres://… ./scripts/clone-prod-db.sh
#
# PROD_DATABASE_URL is required and is never read from a file: apps/api/.env is the dev
# config, and a prod URL sitting next to it is one `bun run dev` away from being used.
# The target is DEV_DATABASE_URL, defaulting to DATABASE_URL in apps/api/.env.
#
# Needs pg_dump and psql at least as new as the production server (override with PG_BIN=<dir>).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${PROD_DATABASE_URL:?set PROD_DATABASE_URL to the production connection string}"
DEV_DATABASE_URL="${DEV_DATABASE_URL:-$(sed -n 's/^DATABASE_URL=//p' apps/api/.env 2>/dev/null | tr -d '"' | tail -1)}"
: "${DEV_DATABASE_URL:?no dev target: set DEV_DATABASE_URL or DATABASE_URL in apps/api/.env}"
PG_BIN="${PG_BIN:+$PG_BIN/}"

host_of() { sed -E 's#^[a-z]+://([^@/]*@)?(\[[^]]+\]|[^:/?]+).*#\2#' <<<"$1"; }
db_of() { sed -E 's#^[a-z]+://[^/]*/([^?]*).*#\1#' <<<"$1"; }
# Never echo credentials: user@host/db only.
show() { sed -E 's#//([^:@/]*)(:[^@]*)?@#//\1@#' <<<"$1"; }

# Guard 1: this script DROPs a schema, so the target must be this machine. A mistyped or
# swapped variable pointing at a remote database fails here, before anything is touched.
case "$(host_of "$DEV_DATABASE_URL")" in
  localhost | 127.0.0.1 | ::1 | '[::1]') ;;
  *) echo "refusing: target host '$(host_of "$DEV_DATABASE_URL")' is not local" >&2; exit 1 ;;
esac
# Guard 2: source and target must differ (same host+db would restore a database onto itself).
if [[ "$(host_of "$PROD_DATABASE_URL")/$(db_of "$PROD_DATABASE_URL")" == \
  "$(host_of "$DEV_DATABASE_URL")/$(db_of "$DEV_DATABASE_URL")" ]]; then
  echo "refusing: source and target are the same database" >&2
  exit 1
fi

echo "source (read only): $(show "$PROD_DATABASE_URL")"
echo "target (schema gc will be DROPPED and recreated): $(show "$DEV_DATABASE_URL")"
read -r -p "Type the target database name ($(db_of "$DEV_DATABASE_URL")) to continue: " answer
[[ "$answer" == "$(db_of "$DEV_DATABASE_URL")" ]] || { echo "aborted" >&2; exit 1; }

# Dump to a file FIRST and restore only if the dump finished. Piping would let psql commit a
# truncated stream (single-transaction commits at EOF) if pg_dump died halfway.
dump="$(mktemp)"
trap 'rm -f "$dump"' EXIT # the file holds production data: never leave it behind

# token DATA is skipped (structure kept): rows are live refresh tokens, useless in dev and
# not something to copy onto a laptop. No owner/ACL: roles differ between the two servers.
"${PG_BIN}pg_dump" "$PROD_DATABASE_URL" --schema=gc --no-owner --no-privileges \
  --exclude-table-data=gc.token -f "$dump"

# One transaction: if the restore fails, the old dev schema is still there. -o drops only
# stdout (the dump's set_config result row); errors still reach stderr.
"${PG_BIN}psql" "$DEV_DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -q -o /dev/null \
  -c 'DROP SCHEMA IF EXISTS gc CASCADE' -f "$dump"

"${PG_BIN}psql" "$DEV_DATABASE_URL" -Atc "
  select 'tables', count(*) from pg_tables where schemaname = 'gc'
  union all select 'primary keys', count(*) from pg_constraint where connamespace = 'gc'::regnamespace and contype = 'p'
  union all select 'foreign keys', count(*) from pg_constraint where connamespace = 'gc'::regnamespace and contype = 'f'
  union all select 'indexes', count(*) from pg_indexes where schemaname = 'gc'
  union all select 'andamento rows', count(*) from gc.andamento
  union all select 'andamento distinct ids', count(distinct id) from gc.andamento" |
  tr '|' ':'

# The app assumes every id is unique (Drizzle declares primary keys). A source without them
# clones faithfully — duplicates included — and the list renders every copy.
pks="$("${PG_BIN}psql" "$DEV_DATABASE_URL" -Atc "select count(*) from pg_constraint where connamespace = 'gc'::regnamespace and contype = 'p'")"
((pks > 0)) || echo "warning: the cloned schema has NO primary keys — production lacks them too" >&2
