"""Derive a conservative casing accelerator from the existing pinned SUBTLEX file."""
import csv
import gzip
import hashlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = root / 'semantic/subtlex-us.tsv.gz'
with gzip.open(source, 'rt') as stream:
    words = sorted({row['Word'].lower() for row in csv.DictReader(stream, delimiter='\t')
                    if int(row['FREQcount']) >= 500 and int(row['FREQlow']) / int(row['FREQcount']) > .5})
data = {'version': 'subtlex-auto-case/1.0',
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'rule': 'FREQcount >= 500 and FREQlow/FREQcount > 0.5; conservative lowercase evidence, not a name classifier',
        'words': words}
output = json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
destination = root / 'automatic-lowercase-1.json'
if '--write' in sys.argv:
    destination.write_text(output)
else:
    assert destination.read_text() == output, 'Automatic-case inventory differs from its pinned source'
print(f'Automatic-case source verified: {len(words)} entries')
