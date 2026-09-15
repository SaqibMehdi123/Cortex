import re, json

html = open('/home/z/my-project/scripts/home.html', encoding='utf-8', errors='ignore').read()

print('=== TITLE / META ===')
for m in re.findall(r'<title[^>]*>(.*?)</title>', html, flags=re.S):
    print('TITLE:', m.strip())
for m in re.findall(r'<meta[^>]+>', html):
    if re.search(r'name="(description|keywords)"|property="og:|name="twitter:|name="robots"', m):
        print('META:', m)
for m in re.findall(r'<link[^>]+rel="canonical"[^>]*>', html):
    print('CANONICAL:', m)

print()
print('=== JSON-LD ===')
for m in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, flags=re.S):
    print(m.strip()[:500])

body = html.split('<body', 1)[-1]
body = re.sub(r'<script.*?</script>', '', body, flags=re.S)
body = re.sub(r'<style.*?</style>', '', body, flags=re.S)
text = re.sub(r'<[^>]+>', ' ', body)
text = re.sub(r'\s+', ' ', text).strip()
print()
print('=== VISIBLE TEXT (server-rendered) ===')
print('LEN:', len(text))
print(text[:1000])
