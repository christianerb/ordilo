#!/usr/bin/env bash
# Starts a throwaway PostgreSQL + PostgREST with every Supabase migration
# applied, for src/lib/ai/__tests__/graph.integration.test.ts.
#
#   scripts/graph-test-db/start.sh        # prints the env vars to export
#   scripts/graph-test-db/start.sh stop
#
# Needs PostgreSQL 16 with pgvector (apt: postgresql-16-pgvector) and
# network access for the one-time PostgREST download. Runs as root by
# switching to the postgres user for the server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${GRAPH_TEST_DB_DIR:-/var/tmp/ordilo-graph-db}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PG_PORT="${GRAPH_TEST_PG_PORT:-54339}"
REST_PORT="${GRAPH_TEST_REST_PORT:-54340}"
JWT_SECRET="local-graph-test-secret-0123456789abcdef"
POSTGREST_VERSION="v12.2.3"

as_postgres() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

if [ "${1:-}" = "stop" ]; then
  [ -f "$DIR/postgrest.pid" ] && kill "$(cat "$DIR/postgrest.pid")" 2>/dev/null || true
  as_postgres "$PG_BIN/pg_ctl -D $DIR/data stop -m fast" || true
  rm -rf "$DIR"
  exit 0
fi

mkdir -p "$DIR"
[ "$(id -u)" = 0 ] && chown postgres "$DIR"

if [ ! -d "$DIR/data" ]; then
  as_postgres "$PG_BIN/initdb -D $DIR/data -A trust -U postgres" >/dev/null
fi
if ! as_postgres "$PG_BIN/pg_ctl -D $DIR/data status" >/dev/null 2>&1; then
  as_postgres "$PG_BIN/pg_ctl -D $DIR/data -o '-p $PG_PORT -k $DIR -c listen_addresses=127.0.0.1' -l $DIR/pg.log start" >/dev/null
fi

PSQL=(psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -q -v ON_ERROR_STOP=1)
if ! "${PSQL[@]}" -d ordilo -c "select 1" >/dev/null 2>&1; then
  "${PSQL[@]}" -c "create database ordilo"
  "${PSQL[@]}" -d ordilo -f "$ROOT/scripts/graph-test-db/bootstrap.sql" >/dev/null 2>&1
  for f in "$ROOT"/supabase/migrations/*.sql; do
    "${PSQL[@]}" -d ordilo -f "$f" >/dev/null 2>"$DIR/migration.err" || { echo "Migration failed: $f" >&2; cat "$DIR/migration.err" >&2; exit 1; }
  done
fi

if [ ! -x "$DIR/postgrest" ]; then
  curl -sSL "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz" | tar -xJ -C "$DIR"
fi
cat > "$DIR/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:pw@127.0.0.1:$PG_PORT/ordilo"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = $REST_PORT
EOF
if ! curl -sf "http://127.0.0.1:$REST_PORT/" >/dev/null 2>&1; then
  nohup "$DIR/postgrest" "$DIR/postgrest.conf" >"$DIR/postgrest.log" 2>&1 &
  echo $! >"$DIR/postgrest.pid"
  for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:$REST_PORT/families?limit=0" >/dev/null 2>&1 && break; sleep 0.5; done
fi

echo "export GRAPH_TEST_REST_URL=http://127.0.0.1:$REST_PORT"
echo "export GRAPH_TEST_DB_URL=postgres://postgres@127.0.0.1:$PG_PORT/ordilo"
echo "export GRAPH_TEST_JWT_SECRET=$JWT_SECRET"
