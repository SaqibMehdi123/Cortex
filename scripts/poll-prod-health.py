#!/usr/bin/env python3
"""Poll prod /api/ops/health until the NEW deployment (with the `ai` section) is live."""
import json, sys, time, urllib.request

URL = "https://cortex.scrutinies.dev/api/ops/health"
DEADLINE = time.time() * 60  # minutes given via argv[1]
minutes = float(sys.argv[1]) if len(sys.argv) > 1 else 10
DEADLINE = time.time() + minutes * 60

while time.time() < DEADLINE:
    try:
        with urllib.request.urlopen(URL, timeout=25) as r:
            data = json.loads(r.read().decode())
        if "ai" in data:
            print("NEW DEPLOYMENT IS LIVE")
            print(json.dumps(data["ai"], indent=2))
            print("mail:", json.dumps({k: data["mail"].get(k) for k in ("provider", "keyValid", "senderConfirmed")}))
            print("checkedAt:", data.get("checkedAt"))
            sys.exit(0)
        print(f"old deployment still serving (no ai section) — {time.strftime('%H:%M:%S')}")
    except Exception as e:
        print(f"probe failed: {e} — {time.strftime('%H:%M:%S')}")
    time.sleep(30)
print("TIMEOUT: new deployment not detected within window")
sys.exit(1)
