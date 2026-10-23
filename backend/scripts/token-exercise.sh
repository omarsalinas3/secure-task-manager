#!/usr/bin/env bash
# Hands-on exercise 19a: rotation, reuse detection, logout, and logout-all.
# Prints only status codes and "different"/"same" - never token values.
# Requires: a running API (npm run dev), curl, and jq (falls back to Node if jq is missing).
set -euo pipefail

BASE=${BASE:-http://localhost:3000/api/v1}

# json_field FIELD: reads JSON on stdin and prints one top-level string field.
if command -v jq >/dev/null 2>&1; then
  json_field() { jq -r ".$1"; }
else
  json_field() {
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(String(JSON.parse(s)['$1']??''))}catch{}})"
  }
fi

post_json() { curl -sS -X POST "$BASE/$1" -H 'Content-Type: application/json' -d "$2"; }
status_of() { curl -sS -o /dev/null -w "%{http_code}" -X POST "$BASE/$1" -H 'Content-Type: application/json' "${@:2}"; }

declare -A RESULT

echo "== Setup =="
EMAIL="student-$RANDOM$RANDOM@example.test"
PASSWORD='a-long-local-test-password-for-this-exercise'
REGISTER=$(post_json auth/register "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
ACCESS=$(printf '%s' "$REGISTER" | json_field accessToken)
REFRESH=$(printf '%s' "$REGISTER" | json_field refreshToken)
unset REGISTER
[ -n "$ACCESS" ] && [ -n "$REFRESH" ] && echo "token variables are set (values not shown)"

echo "== Task 1 - Rotation =="
OLD_REFRESH=$REFRESH
ROTATED=$(curl -sS -w '\n%{http_code}' -X POST "$BASE/auth/refresh" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$OLD_REFRESH\"}")
ROTATION_STATUS=${ROTATED##*$'\n'}
ROTATED=${ROTATED%$'\n'*}
NEW_ACCESS=$(printf '%s' "$ROTATED" | json_field accessToken)
NEW_REFRESH=$(printf '%s' "$ROTATED" | json_field refreshToken)
echo "refresh status: $ROTATION_STATUS"
if [ "$NEW_REFRESH" != "$OLD_REFRESH" ]; then printf 'different\n'; else printf 'same\n'; fi
RESULT[valid]=$ROTATION_STATUS
ACCESS=$NEW_ACCESS
REFRESH=$NEW_REFRESH
unset ROTATED NEW_ACCESS NEW_REFRESH

echo "== Task 2 - Reuse detection =="
RESULT[old]=$(status_of auth/refresh -d "{\"refreshToken\":\"$OLD_REFRESH\"}")
RESULT[newest]=$(status_of auth/refresh -d "{\"refreshToken\":\"$REFRESH\"}")
echo "old token: ${RESULT[old]}"
echo "newest token after reuse: ${RESULT[newest]}"

echo "== Task 3 - Logout =="
LOGIN=$(post_json auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
LOGOUT_REFRESH=$(printf '%s' "$LOGIN" | json_field refreshToken)
unset LOGIN
echo "logout: $(status_of auth/logout -d "{\"refreshToken\":\"$LOGOUT_REFRESH\"}")"
RESULT[logout]=$(status_of auth/refresh -d "{\"refreshToken\":\"$LOGOUT_REFRESH\"}")
echo "refresh after logout: ${RESULT[logout]}"

echo "== Task 4 - Logout-all =="
SESSION_ONE=$(post_json auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
ACCESS_ONE=$(printf '%s' "$SESSION_ONE" | json_field accessToken)
REFRESH_ONE=$(printf '%s' "$SESSION_ONE" | json_field refreshToken)
unset SESSION_ONE
SESSION_TWO=$(post_json auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
REFRESH_TWO=$(printf '%s' "$SESSION_TWO" | json_field refreshToken)
unset SESSION_TWO
echo "logout-all: $(curl -sS -o /dev/null -w "%{http_code}" -X POST "$BASE/auth/logout-all" -H "Authorization: Bearer $ACCESS_ONE")"
ONE=$(status_of auth/refresh -d "{\"refreshToken\":\"$REFRESH_ONE\"}")
TWO=$(status_of auth/refresh -d "{\"refreshToken\":\"$REFRESH_TWO\"}")
echo "session one refresh: $ONE"
echo "session two refresh: $TWO"
RESULT[logoutall]="$ONE/$TWO"

unset ACCESS REFRESH OLD_REFRESH LOGOUT_REFRESH ACCESS_ONE REFRESH_ONE REFRESH_TWO

pass() { [ "$1" = "$2" ] && echo "yes" || echo "NO"; }
echo
echo "| Test | Expected status | Your result | Pass? |"
echo "|---|---|---|---|"
echo "| Refresh with valid token | 200 | ${RESULT[valid]} | $(pass "${RESULT[valid]}" 200) |"
echo "| Refresh with old token | 401 | ${RESULT[old]} | $(pass "${RESULT[old]}" 401) |"
echo "| Refresh with newest token after reuse | 401 | ${RESULT[newest]} | $(pass "${RESULT[newest]}" 401) |"
echo "| Refresh after logout | 401 | ${RESULT[logout]} | $(pass "${RESULT[logout]}" 401) |"
echo "| Refresh after logout-all | 401 | ${RESULT[logoutall]} | $(pass "${RESULT[logoutall]}" 401/401) |"
