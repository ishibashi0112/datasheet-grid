import sys,json,re
for line in sys.stdin:
    m=re.match(r'(\w+ ?\d*) (\{.*\})',line)
    if m:
        d=json.loads(m.group(2)); print(' ', m.group(1), {k:d[k] for k in ['heapMB','nodes','listeners','win','doc','bodyKids','roots']})
    else: print(line.rstrip()[:300])
