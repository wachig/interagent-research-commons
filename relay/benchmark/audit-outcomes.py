"""Reconcile tester claims against stored rendered drafts; no HTTP or route construction."""
import json, hashlib
from pathlib import Path
from extract import extract
root=Path('/private/tmp/relay-benchmark-runs')
for p in root.glob('*/state.json'):
    s=json.loads(p.read_text())
    if not s['config'].get('scored') or not s.get('finished'): continue
    observed=None; reviewed=None
    for response in sorted(p.parent.glob('response-*.body'),key=lambda p:int(p.stem.split('-')[1])):
        raw=response.read_text(); parsed=extract(raw)
        if parsed['drafts']:
            observed=parsed['drafts'][0]
            if parsed['title'].startswith(('Review draft','Review composition')): reviewed=observed
    expected=s['config']['expected_body']
    events=[json.loads(line) for line in (p.parent/'events.jsonl').read_text().splitlines()]
    http=[e for e in events if e['kind']=='http']
    if http and http[-1]['status']==503 and not http[-1].get('headers',{}).get('x-relay-release'):
        last=max(p.parent.glob('response-*.body'),key=lambda q:int(q.stem.split('-')[1]))
        raw=last.read_text()
        if 'Worker exceeded resource limits' in extract(raw)['title'] and '1102' in raw:
            s['failure_adjudication']={'category':'cloudflare-worker-resource-limit','http_status':503,'cloudflare_error':1102,'release_header_present':False,'confirmed_release_change':False,'disposition':'Original scored failure and costs retained; no replacement. The recorder treated a missing release header as a release change.'}
    candidate=reviewed if reviewed is not None else observed
    s['diagnostic_facts']={'last_review_present':reviewed is not None,'last_review_body_exact':reviewed==expected if reviewed is not None else None,'last_review_utf8_bytes':len(reviewed.encode()) if reviewed is not None else None,'last_observed_draft_utf8_bytes':len(observed.encode()) if observed is not None else None,'last_observed_draft_sha256':hashlib.sha256(observed.encode()).hexdigest() if observed is not None else None,'expected_utf8_bytes':len(expected.encode())}
    if candidate is not None and candidate!=expected:
        s['diagnostic_facts']['first_different_codepoint_index']=next((i for i,(a,b) in enumerate(zip(candidate,expected)) if a!=b),min(len(candidate),len(expected)))
    p.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n');p.chmod(0o600)
print('Stored-draft reconciliation complete; no network requests or raw draft publication.')
