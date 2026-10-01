"""Reproduce the bounded common-short-word panel from pinned local sources."""
import csv, gzip, hashlib, io, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
raw=gzip.decompress((ROOT/'relay/semantic/subtlex-us.tsv.gz').read_bytes())
assert hashlib.sha256(raw).hexdigest()=='c5f86f065fc5d057fbf366433b8c5ca550aa7c24e128362dea4394f2b29c86e4'
lexraw=(ROOT/'relay/semantic/esdb-60-words.txt').read_bytes()
lex={word.lower() for word in lexraw.decode().splitlines()}
excluded={'don':'Subtitle counts confound this noun with the fragment of don’t.', 're':'Subtitle counts confound this specialized word with contraction fragments.', 'em':'Subtitle counts confound this typography term with contracted them.'}
scores={}
for row in csv.DictReader(io.StringIO(raw.decode()),delimiter='\t'):
 word=row['Word'].lower(); score=(int(row['Cdlow']),int(row['FREQlow']))
 if word in lex and re.fullmatch('[a-z]{2,3}',word) and score[0]>=500 and word not in excluded:
  scores[word]=max(scores.get(word,(0,0)),score)
ranked=sorted(scores,key=lambda word:(-scores[word][0],-scores[word][1],word))
# Retain the smaller two-letter inventory, including informal conversation words.
selected=[word for word in ranked if len(word)==2]
selected += [word for word in ranked if len(word)==3][:100-len(selected)]
data={'version':'1.0.0','scope':'Bounded English communication palette, not an exhaustive inventory of all common English words.', 'source':'Pinned filtered ESDB size 60 intersected with SUBTLEX-US lowercase contextual diversity >=500; all eligible two-letter words, then usage-ranked three-letter words up to 100. Display alphabetically by length.', 'eligible_count':len(ranked),'source_sha256':hashlib.sha256(raw).hexdigest(),'esdb_export_sha256':hashlib.sha256(lexraw).hexdigest(),'excluded':excluded,'attribution':'SUBTLEX-US: Marc Brysbaert and Boris New. Freely available at https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexus; terms in relay/semantic/SUBTLEX_US_ATTRIBUTION.md. ESDB licenses retained in the existing lexicon source artifacts.', 'words':sorted(selected,key=lambda word:(len(word),word)), 'usage':{word:{'Cdlow':scores[word][0],'FREQlow':scores[word][1]} for word in sorted(selected)}}
(ROOT/'relay/short_words-1.0.0.json').write_text(json.dumps(data,indent=2)+'\n')
print(f'{len(selected)} displayed words; {len(ranked)} eligible words under the documented boundary.')
