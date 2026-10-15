#!/usr/bin/env bash
# E2E security regression battery against a local production-mode server
# (pg-embed @5433). Prereqs:
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/cortex npx prisma db push
#   DATABASE_URL=... bun scripts/seed-security-e2e.ts
#   DATABASE_URL=... AUTH_SECRET=... CRON_SECRET=... AUTH_DEV_CODE_FALLBACK=true \
#     NODE_ENV=production npx next start -p 3100
set -u
BASE="http://127.0.0.1:3100"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
check() { if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1"; fi; }

echo "── 1. verify-email: NO session without a valid code (C-1 takeover fix)"
BODY=$(curl -s -X POST "$BASE/api/auth/verify-email" \
  -H 'Content-Type: application/json' -d '{"email":"sec-e2e@local.test","code":"000000"}')
HDRS=$(curl -s -D - -o /dev/null -X POST "$BASE/api/auth/verify-email" \
  -H 'Content-Type: application/json' -d '{"email":"sec-e2e@local.test","code":"000000"}')
echo "$BODY" | grep -q "alreadyVerified" ; check "alreadyVerified response for verified account (body: $(echo $BODY | head -c 60))" $?
echo "$HDRS" | grep -qi "set-cookie: cortex_session" && bad "signed in without valid code!" || ok "no session cookie on wrong code"

echo "── 2. verify-email: correct code still mints a session (happy path)"
V=$(curl -s -D - -o /dev/null -X POST "$BASE/api/auth/verify-email" \
  -H 'Content-Type: application/json' -d '{"email":"sec-e2e-unverified@local.test","code":"111222"}')
echo "$V" | grep -qi "set-cookie: cortex_session" ; check "correct code → session cookie" $?

echo "── 3. verify-email: IP rate limit"
LAST=000
for i in $(seq 1 24); do
  LAST=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/verify-email" \
    -H 'Content-Type: application/json' -d '{"email":"nobody@local.test","code":"123456"}')
done
[ "$LAST" = "429" ]; check "late attempts hit 429 (got $LAST)" $?

echo "── 4. legacy /api/steps routes are gone"
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/steps" -H 'Content-Type: application/json' -d '{"goalId":"x","title":"pwn"}')
[ "$C" = "401" ]; check "anonymous POST /api/steps → 401 (middleware)" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/steps" -H "Cookie: $(curl -s -D - -o /dev/null -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"sec-e2e@local.test","password":"password-123"}' | grep -i '^set-cookie: cortex_session=' | sed 's/^[Ss]et-[Cc]ookie: //' | cut -d';' -f1)" -H 'Content-Type: application/json' -d '{"goalId":"x","title":"pwn"}')
[ "$C" = "404" ]; check "authenticated POST /api/steps → 404 route removed (got $C)" $?

echo "── 5. cron: fail-closed"
C=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/cron/morning?dryRun=1" -H "x-vercel-cron: 1")
[ "$C" = "401" ]; check "spoofed x-vercel-cron → 401" $?
C=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/cron/morning?dryRun=1")
[ "$C" = "401" ]; check "anonymous → 401" $?
C=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/cron/feeds" -H "Authorization: Bearer e2e-cron-secret")
[ "$C" = "200" ] || [ "$C" = "500" ]; check "correct bearer accepted (feeds) → $C" $?

echo "── 6. storage-ref ownership (cross-tenant reads)"
LOGIN=$(curl -s -D - -o /dev/null -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"email":"sec-e2e@local.test","password":"password-123"}')
COOKIE=$(echo "$LOGIN" | grep -i "^set-cookie: cortex_session=" | sed 's/^[Ss]et-[Cc]ookie: //' | cut -d';' -f1)
[ -n "$COOKIE" ]; check "login works" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/documents/pdf/from-blob" \
  -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -d '{"storageRef":"r2://pdf/some-other-user-id/11111111-2222-3333-4444-555555555556/secret.pdf"}')
[ "$C" = "403" ]; check "from-blob foreign r2 prefix → 403 (got $C)" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/agent/profile/parse-cv" \
  -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -d '{"fileRef":"r2://pdf/victim-id/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/cv.pdf"}')
[ "$C" = "403" ]; check "parse-cv foreign ref → 403 (got $C)" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/agent/profile/parse-cv" \
  -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -d '{"fileRef":"r2://pdf/some-other-user-id/11111111-2222-3333-4444-555555555556/cv.pdf","fileName":"cv.pdf"}')
[ "$C" = "403" ]; check "parse-cv foreign ref (again, post-reorder) → 403 (got $C)" $?

echo "── 7. sources: SSRF validation at ingest"
for u in "http://127.0.0.1:6379" "http://169.254.169.254/latest/meta-data/" "//evil.example/x.xml" "file:///etc/passwd"; do
  C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/sources" -H "Cookie: $COOKIE" \
    -H 'Content-Type: application/json' -d "{\"name\":\"abuse\",\"url\":\"$u\"}")
  [ "$C" = "400" ]; check "$u → 400 (got $C)" $?
done

echo "── 8. tokenVersion: password reset kills outstanding sessions"
L1=$(curl -s -D - -o /dev/null -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"sec-e2e@local.test","password":"password-123"}')
CK1=$(echo "$L1" | grep -i "^set-cookie: cortex_session=" | sed 's/^[Ss]et-[Cc]ookie: //' | cut -d';' -f1)
C=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/auth/me" -H "Cookie: $CK1")
[ "$C" = "200" ]; check "session valid after login (got $C)" $?
curl -s -o /dev/null -X POST "$BASE/api/auth/reset-password" -H 'Content-Type: application/json' \
  -d '{"email":"sec-e2e@local.test","code":"654321","newPassword":"newpassword-456"}'
C=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/auth/me" -H "Cookie: $CK1")
[ "$C" = "401" ]; check "old session INVALID after reset (got $C)" $?
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"sec-e2e@local.test","password":"newpassword-456"}')
[ "$C" = "200" ]; check "new password works (got $C)" $?

echo "── 9. dev code fallback hard-disabled in production"
REG=$(curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Prod Leak Probe\",\"email\":\"leak-probe-$RANDOM@local.test\",\"password\":\"password-123\"}")
echo "$REG" | grep -q "devCode" && bad "devCode leaked in production!" || ok "no devCode in production register response"

echo "── 10. security headers"
H=$(curl -s -D - -o /dev/null "$BASE/login")
echo "$H" | grep -qi "x-frame-options: DENY" ; check "X-Frame-Options: DENY" $?
echo "$H" | grep -qi "x-content-type-options: nosniff" ; check "nosniff" $?
echo "$H" | grep -qi "content-security-policy" ; check "CSP present" $?
echo "$H" | grep -qi "strict-transport-security" ; check "HSTS" $?

echo "── 11. ops/health rate limited"
HITS=0
for i in $(seq 1 14); do
  C=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/ops/health")
  [ "$C" = "429" ] && HITS=$((HITS+1))
done
[ "$HITS" -gt 0 ]; check "at least one 429 across 14 hits ($HITS)" $?

echo "── 12. safepay webhook fails closed"
C=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/billing/webhook/safepay" \
  -H 'Content-Type: application/json' -d '{"t":1,"tracker":"x","status":"success","hash":"deadbeef"}')
[ "$C" = "401" ] || [ "$C" = "400" ]; check "unsigned safepay webhook → $C" $?

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
