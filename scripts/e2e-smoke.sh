#!/bin/bash
# End-to-end smoke test of the changed storage + security flows (local disk mode).
set -e
BASE=http://localhost:3000
JAR=/tmp/cortex-cookies.txt
rm -f "$JAR"

EMAIL="e2e-$(date +%s)@test.local"
NAME="E2E Tester"
PASS="supersecret123"

echo "— register —"
REG=$(curl -s -c "$JAR" -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$NAME\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
echo "$REG" | python3 -c "import json,sys; d=json.load(sys.stdin); print('needsVerification:', d.get('needsVerification'), '| devCode present:', bool(d.get('devCode')))"
CODE=$(echo "$REG" | python3 -c "import json,sys; print(json.load(sys.stdin).get('devCode',''))")
[ -n "$CODE" ] || { echo "no devCode — cannot continue"; exit 1; }

echo "— verify email (code $CODE) —"
curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/verify-email" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"code\":\"$CODE\"}" | head -c 120; echo

echo "— upload mode probe (expect server, no blob/r2 locally) —"
curl -s -b "$JAR" "$BASE/api/documents/upload-url"; echo

echo "— build a tiny valid PDF —"
python3 - <<'EOF'
minimal = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
open('/tmp/e2e-test.pdf','wb').write(minimal)
EOF

echo "— stream upload the PDF —"
UP=$(curl -s -b "$JAR" -X POST "$BASE/api/documents/pdf/stream?name=e2e-test.pdf" -H 'Content-Type: application/pdf' --data-binary @/tmp/e2e-test.pdf)
echo "$UP" | python3 -c "import json,sys; d=json.load(sys.stdin); doc=d.get('document',{}); print('created:', bool(doc.get('id')), '| pages:', d.get('pages'), '| filePath:', doc.get('filePath'))"
DOCID=$(echo "$UP" | python3 -c "import json,sys; print(json.load(sys.stdin)['document']['id'])")

echo "— fetch the stored file (disk mode) —"
curl -s -b "$JAR" -o /tmp/e2e-out.pdf -w "HTTP %{http_code}, %{size_download} bytes\n" "$BASE/api/documents/$DOCID/file"
head -c 5 /tmp/e2e-out.pdf; echo " <- magic bytes"

echo "— ownership: file is 404 without session —"
curl -s -o /dev/null -w "anon GET file: HTTP %{http_code}\n" "$BASE/api/documents/$DOCID/file"

echo "— settings: googleAuth must NOT leak —"
curl -s -b "$JAR" "$BASE/api/settings" | python3 -c "
import json,sys
d=json.load(sys.stdin)['setting']
print('setting keys:', sorted(d.keys()))
print('googleAuth leaked:', 'googleAuth' in d)
"

echo "— capture SSRF guard: internal URL must NOT be fetched (listener records hits) —"
node -e "require('http').createServer((q,s)=>{require('fs').appendFileSync('/tmp/ssrf-hit.txt','HIT');s.end()}).listen(9999)" &
LISTENER_PID=$!
sleep 1
rm -f /tmp/ssrf-hit.txt
curl -s -b "$JAR" -X POST "$BASE/api/capture" -H 'Content-Type: application/json' \
  -d '{"type":"url","content":"http://127.0.0.1:9999/secret"}' | python3 -c "import json,sys; d=json.load(sys.stdin); print('capture ok:', d.get('ok'), '| kind:', d.get('kind'))"
sleep 1
if [ -f /tmp/ssrf-hit.txt ]; then echo "SSRF LEAK: internal listener was hit!"; else echo "internal host NOT contacted — guard works"; fi
kill $LISTENER_PID 2>/dev/null

echo "— capture public URL still extracts (example.com) —"
curl -s -b "$JAR" -X POST "$BASE/api/capture" -H 'Content-Type: application/json' \
  -d '{"type":"url","content":"https://example.com"}' | python3 -c "import json,sys; d=json.load(sys.stdin); doc=d.get('document',{}); print('capture ok:', d.get('ok'), '| content extracted:', bool(doc.get('content')))"

echo "— delete document (cleans the file) —"
curl -s -b "$JAR" -X DELETE "$BASE/api/documents/$DOCID" | head -c 60; echo
if [ -f "db/uploads/$DOCID.pdf" ] || [ -f "uploads/$DOCID.pdf" ]; then echo "file still on disk (unexpected)"; else echo "stored file removed"; fi

echo "DONE"
