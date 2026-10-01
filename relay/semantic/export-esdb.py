#!/usr/bin/env python3
"""Rebuild fully expanded, filtered word forms from the pinned upstream archive."""
import gzip, hashlib, json, re, subprocess, tarfile, tempfile, unicodedata
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / 'relay/semantic'
policy = json.loads((HERE / 'lexicon-policy.json').read_text())
archive = ROOT / 'relay/assets/lexicon-source/esdb-1e5b7d3a.tar.gz'
assert hashlib.sha256(archive.read_bytes()).hexdigest() == policy['archive_sha256'], 'ESDB archive integrity failed'
additions = json.loads((HERE / 'lexicon-additions.json').read_text())['entries']
word = re.compile(r"[^\W_]+(?:['’\-][^\W_]+)*", re.UNICODE)
with tempfile.TemporaryDirectory(prefix='relay-esdb-') as tmp:
    src = Path(tmp)
    with tarfile.open(archive) as tar:
        tar.extractall(src, filter='data')
    subprocess.run(['make'], cwd=src, check=True, stdout=subprocess.DEVNULL)
    summaries = []
    for size in policy['comparison_sizes']:
        args = ['./scowl', 'word-list', str(size), policy['spellings'], str(policy['variant_level']),
                '--wo-poses=' + policy['exclude_poses'], '--wo-pos-classes=' + policy['exclude_pos_classes'],
                '--categories=' + policy['categories'], '--hyphen', '--apostrophe=True']
        raw = subprocess.run(args, cwd=src, check=True, capture_output=True, text=True).stdout
        words = {unicodedata.normalize('NFC', w) for w in raw.splitlines()
                 if word.fullmatch(w) and len(w) <= 80 and len(w.encode()) <= 320
                 and (not w[:1].isupper() or w in policy['preserve_case'])
                 and w not in policy['exclude_exact']}
        upstream_count = len(words)
        words.update(e['word'] for e in additions)
        text = '\n'.join(sorted(words)) + '\n'
        (HERE / f'esdb-{size}-words.txt').write_text(text)
        summaries.append({'size':size, 'upstream_filtered_forms':upstream_count, 'with_additions':len(words),
                          'utf8_bytes':len(text.encode()), 'gzip_bytes':len(gzip.compress(text.encode(),mtime=0)),
                          'sha256':hashlib.sha256(text.encode()).hexdigest(), 'export_arguments':args[1:]})
    manifest = {'format':'relay-esdb-export-1', 'policy':policy,
                'additions_sha256':hashlib.sha256((HERE/'lexicon-additions.json').read_bytes()).hexdigest(), 'exports':summaries}
    (HERE / 'esdb-export-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(summaries,indent=2))
