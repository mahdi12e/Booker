#!/usr/bin/env bash
# End-to-end API smoke test, including authorization (IDOR) and privacy checks.
# Start the API first:  npm run db:migrate:local && npm run dev:api
# Note: registration is rate limited to 8 per hour per IP, so two or three runs per hour is the limit.
set -euo pipefail

API="${API:-http://localhost:8787}"
ORIGIN="${ORIGIN:-http://localhost:5173}"   # must equal APP_URL
A=$(mktemp); B=$(mktemp); OUT=$(mktemp)
trap 'rm -f "$A" "$B" "$OUT"' EXIT
SFX="$RANDOM$RANDOM"

call() { # jar method path [json]
  local jar=$1 m=$2 p=$3 d=${4:-}
  if [ -n "$d" ]; then
    curl -s -o "$OUT" -w '%{http_code}' -b "$jar" -c "$jar" -X "$m" -H "Origin: $ORIGIN" -H 'X-Requested-With: fetch' -H 'Content-Type: application/json' --data "$d" "$API$p"
  else
    curl -s -o "$OUT" -w '%{http_code}' -b "$jar" -c "$jar" -X "$m" -H "Origin: $ORIGIN" -H 'X-Requested-With: fetch' "$API$p"
  fi
}
expect() { # got want label
  if [ "$1" = "$2" ]; then echo "ok    $3"; else echo "FAIL  $3 (got $1, want $2)"; cat "$OUT"; echo; exit 1; fi
}

reg() { echo "{\"name\":\"Tester $2\",\"username\":\"$2$SFX\",\"email\":\"$2$SFX@example.com\",\"password\":\"correct horse battery\",\"confirm_password\":\"correct horse battery\",\"turnstile_token\":\"test\"}"; }

expect "$(call "$A" POST /api/auth/register "$(reg alice)")" 201 "register alice"
expect "$(call "$B" POST /api/auth/register "$(reg bob)")" 201 "register bob"
expect "$(call "$B" POST /api/auth/register "$(reg alice)")" 409 "duplicate username is rejected"
expect "$(call "$A" GET /api/me)" 200 "me"

expect "$(call "$A" POST /api/posts '{"type":"poem","title":"Hello","content":"line one\nline two","visibility":"public"}')" 201 "create public poem"
PUB=$(sed -n 's/.*"post":{"id":"\([^"]*\)".*/\1/p' "$OUT")
expect "$(call "$A" POST /api/posts '{"type":"story","title":"Secret","content":"only me","visibility":"private"}')" 201 "create private story"
PRIV=$(sed -n 's/.*"post":{"id":"\([^"]*\)".*/\1/p' "$OUT")
expect "$(call "$A" POST /api/posts '{"type":"book_part","book_title":"Book","title":"Ch 1","content":"","visibility":"draft"}')" 201 "create draft book part"
DRAFT=$(sed -n 's/.*"post":{"id":"\([^"]*\)".*/\1/p' "$OUT")
expect "$(call "$A" POST /api/posts '{"type":"poem","title":"x","content":"","visibility":"public"}')" 422 "empty public content is rejected"

ANON=$(mktemp); trap 'rm -f "$A" "$B" "$OUT" "$ANON"' EXIT
expect "$(call "$ANON" GET "/api/posts/$PUB")" 200 "anonymous can read public post"
expect "$(call "$ANON" GET "/api/posts/$PRIV")" 404 "anonymous cannot read private post"
expect "$(call "$ANON" GET "/api/posts/$DRAFT")" 404 "anonymous cannot read draft"
expect "$(call "$B" GET "/api/posts/$PRIV")" 404 "other user cannot read private post"
expect "$(call "$ANON" GET "/api/users/alice$SFX/posts")" 200 "public profile posts"
grep -q "Secret" "$OUT" && { echo "FAIL  private post leaked on profile"; exit 1; } || echo "ok    private post not listed publicly"

expect "$(call "$B" PATCH "/api/posts/$PUB" '{"title":"Hacked"}')" 404 "IDOR: other user cannot edit"
expect "$(call "$B" DELETE "/api/posts/$PUB")" 404 "IDOR: other user cannot delete"
expect "$(call "$ANON" PATCH "/api/posts/$PUB" '{"title":"Hacked"}')" 401 "anonymous cannot edit"
expect "$(call "$A" PATCH "/api/posts/$PUB" '{"title":"Hello again"}')" 200 "owner can edit"
expect "$(call "$A" PATCH "/api/posts/$DRAFT" '{"content":"now with text","visibility":"public"}')" 200 "owner publishes draft"

CODE=$(curl -s -o "$OUT" -w '%{http_code}' -X POST -H 'X-Requested-With: fetch' -H 'Content-Type: application/json' --data '{}' "$API/api/auth/logout")
expect "$CODE" 403 "CSRF: request without Origin is blocked"

expect "$(call "$A" DELETE "/api/posts/$PUB")" 200 "owner can delete"
expect "$(call "$A" POST /api/auth/logout)" 200 "logout"
expect "$(call "$A" GET /api/me)" 200 "me after logout"
grep -q '"user":null' "$OUT" && echo "ok    session cleared" || { echo "FAIL  still signed in"; exit 1; }
echo "All checks passed."
