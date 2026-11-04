#!/bin/bash
# Local stack for recording the help videos (scripts/help-videos/README in record.mts):
#   mock WHMCS on :4565, mock DirectAdmin (https) on :4566, the app (next dev) on :3411.
# Needs the local Postgres from .env.local (port 5433). Self-signed cert for the DA mock goes to $TMP_DIR.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
TMP_DIR="${TMP_DIR:-$(mktemp -d)}"
[ -f "$TMP_DIR/cert.pem" ] || openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=localhost -keyout "$TMP_DIR/key.pem" -out "$TMP_DIR/cert.pem" 2>/dev/null
MOCK_PORT=4565 nohup node "$HERE/mocks/mock-whmcs.mjs" > "$TMP_DIR/whmcs.log" 2>&1 &
DA_PORT=4566 DA_CERT="$TMP_DIR/cert.pem" DA_KEY="$TMP_DIR/key.pem" nohup node "$HERE/mocks/mock-da.mjs" > "$TMP_DIR/da.log" 2>&1 &
cd "$ROOT"
export WHMCS_API_URL=http://127.0.0.1:4565/includes/api.php AI_MOCK=1 DA_URL=https://localhost:4566 DA_USER=admin DA_LOGIN_KEY=mock-key DA_WHMCS_SERVER_IDS=5 HOSTING_HMAC_SECRET=rec-secret-0123456789abcdef NODE_EXTRA_CA_CERTS="$TMP_DIR/cert.pem" NEXT_TELEMETRY_DISABLED=1
exec npx next dev -p 3411 > "$TMP_DIR/next.log" 2>&1
