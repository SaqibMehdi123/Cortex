#!/usr/bin/env python3
"""Check domain registration status via RDAP (404 = unregistered/available)."""
import json, urllib.request, concurrent.futures

CANDIDATES = [
    "engram.app", "engram.so", "engram.ai",
    "loci.app", "loci.so", "useloci.com",
    "mnemo.app", "mnemo.so",
    "cognivo.com", "cognivo.app",
    "memora.app",
    "mindra.app",
    "zettra.com",
    "mindvault.app",
    "cortia.com",
    "remara.com",
    "yadgar.app",
    "hafiza.app",
]

def check(domain: str) -> tuple[str, str]:
    url = f"https://rdap.org/domain/{domain}"
    req = urllib.request.Request(url, headers={"accept": "application/rdap+json"})
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            if r.status == 200:
                return domain, "TAKEN"
            return domain, f"?{r.status}"
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return domain, "AVAILABLE"
        return domain, f"?{e.code}"
    except Exception as e:
        return domain, f"ERR:{type(e).__name__}"

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    results = list(ex.map(check, CANDIDATES))

for d, s in sorted(results, key=lambda x: (x[1] != "AVAILABLE", x[0])):
    print(f"{s:10s} {d}")
