"""Build Span's public lexical graph and retained-model phrase indexes.
Requires marisa-trie==1.3.1 (build only); no runtime model expansion.
"""
import csv,gzip,hashlib,io,json,re,struct,unicodedata,collections,importlib.metadata
from pathlib import Path
import marisa_trie
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'relay/assets/span-keyboard/1.0.0'
OUT.mkdir(parents=True,exist_ok=True)
assert importlib.metadata.version('marisa-trie')=='1.3.1'
def sha(b):return hashlib.sha256(b).hexdigest()
def write(name,data):
 p=OUT/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
def norm(s):return unicodedata.normalize('NFC',s).lower()
def bucket(s):
 h=2166136261
 for b in s.encode():h=((h^b)*16777619)&0xffffffff
 return h%32
lexdir=ROOT/'relay/assets/semantic-lexicon'
lexraw=(lexdir/'manifest.json').read_bytes();lex=json.loads(lexraw);words=[]
for shard in lex['shards']:
 b=(lexdir/shard['path']).read_bytes();assert sha(b.rstrip(b'\n'))==shard['sha256'];words+=json.loads(b)
assert len(words)==lex['word_count'] and len(set(words))==len(words)
raw=gzip.decompress((ROOT/'relay/semantic/subtlex-us.tsv.gz').read_bytes())
assert sha(raw)=='c5f86f065fc5d057fbf366433b8c5ca550aa7c24e128362dea4394f2b29c86e4'
usage={}
for row in csv.DictReader(io.StringIO(raw.decode()),delimiter='\t'):
 k=norm(row['Word']);usage[k]=max(usage.get(k,0),int(row['FREQlow']))
rank=lambda w:(-usage.get(norm(w),0),norm(w),w)
nodes=[]
def build(prefix,group,parent=None):
 idx=len(nodes);node={'p':prefix,'parent':parent,'count':len(group),'words':sorted(group,key=rank)[:24],'children':[],'mass':sum(usage.get(norm(w),0) for w in group)};nodes.append(node)
 if len(group)>24:
  groups=collections.defaultdict(list)
  for w in group:
   k=norm(w)
   if len(k)>len(prefix):groups[k[:len(prefix)+1]].append(w)
  for pre,ws in sorted(groups.items()):
   # Skip unbranched runs; selecting a terminal still remains possible.
   keys=[norm(w) for w in ws]
   while len(ws)>24 and all(len(k)>len(pre) for k in keys) and len({k[len(pre)] for k in keys})==1:pre+=keys[0][len(pre)]
   node['children'].append(build(pre,ws,idx))
  # Every terminal spelling must be shown even when rare/case-distinct.
  terminal=[w for w in group if norm(w)==prefix]
  for w in terminal:
   if w not in node['words']:node['words'].append(w)
 return idx
build('',words)
shortcuts=sorted([i for i,n in enumerate(nodes) if 2<=len(n['p'])<=3 and n['count']>24],key=lambda i:(-nodes[i]['mass'],nodes[i]['p']))
rootchildren=nodes[0]['children'];shortcuts=[i for i in shortcuts if i not in rootchildren]
promotions={}
for i,n in enumerate(nodes):
 descendants=[]
 for child in n['children']:
  descendants.extend(nodes[child]['children'])
  for grandchild in nodes[child]['children']:descendants.extend(nodes[grandchild]['children'])
 ordered_ids=sorted(set(descendants),key=lambda j:(-nodes[j]['mass'],nodes[j]['p']))
 promotions[i]=ordered_ids
 n['shortcuts']=ordered_ids[:max(0,48-len(n['children']))]
# Retain root's shallow two/three-letter vocabulary shortcuts for predictable discovery.
promotions[0]=shortcuts
nodes[0]['shortcuts']=shortcuts[:max(0,48-len(rootchildren))]
assert max(len(n['children']) for n in nodes)<=80
# Independent coverage against every exact source spelling; refinements progress.
seen=set()
for i,n in enumerate(nodes):
 seen.update(n['words'])
 for child in n['children']:
  assert nodes[child]['p'].startswith(n['p']) and len(nodes[child]['p'])>len(n['p']) and nodes[child]['parent']==i
assert seen==set(words)
for n in nodes:n['routes']=[[i,nodes[i]['p']] for i in sorted(n['children']+n['shortcuts'],key=lambda i:nodes[i]['p'])]
for start in range(0,len(nodes),128):write(f'nodes/{start//128}.json',nodes[start:start+128])
m=json.loads((ROOT/'relay/html_keyboard_model.json').read_text());data=(ROOT/'relay/assets/predictive-keyboard/vendor/third_party/libpresage/en_US-html.data').read_bytes()
cb=data[m['files'][0]['start']:m['files'][0]['end']];tb=data[m['files'][1]['start']:m['files'][1]['end']]
assert sha(cb)=='352e006aeb5439236ebec43271615be2bb292ac9e898a6d06c6527a91b18c7ef'
assert sha(tb)=='930aa2ee2e51125a7decec5beb063fa6b57d676bb9d8ec7eaef190bee9570a75'
trie=marisa_trie.Trie().frombytes(tb);counts=struct.unpack('<'+'i'*(len(cb)//4),cb);assert len(counts)==len(trie)+1
blocked={'escort','escorts','hooker','hookers','prostitute','prostitutes','prostitution','porn','pornography','xxx','nude','nudes','onlyfans'}
pairs={'of cheap','cheap escort','cheap escorts'}
def wordok(w):return bool(re.fullmatch(r"[^\W_]+(?:['’\-][^\W_]+)*",w,re.UNICODE))
def valid(text):
 ws=text.split(' ');return 2<=len(ws)<=4 and len(text.encode())<=96 and all(wordok(w) and w.lower() not in blocked for w in ws) and not any(' '.join(ws[i:i+2]).lower() in pairs for i in range(len(ws)-1))
observed=collections.Counter();rejected=collections.Counter();records=[]
for key,idx in sorted(trie.items()):
 parts=key.split(' ');order=int(parts[0]);assert order==len(parts)-1 and 1<=order<=4 and counts[idx+1]>=0
 observed[order]+=1
 if order<2:continue
 text=' '.join(parts[1:])
 if counts[idx+1]<=0 or not valid(text):rejected[order]+=1;continue
 records.append({'text':text,'count':counts[idx+1]})
records.sort(key=lambda r:r['text']);contexts=collections.defaultdict(list);first=collections.defaultdict(list)
for idx,r in enumerate(records):
 r['id']=idx;ws=r['text'].split(' ');first[norm(ws[0])].append({'id':idx,'text':r['text'],'count':r['count']})
 for length in range(min(2,len(ws)-2)+1):
  context=norm(' '.join(ws[:length]));text=' '.join(ws[length:]);contexts[context].append({'id':idx,'text':text,'count':r['count']})
def ordered(rows,limit):
 unique={}
 for r in rows:
  if r['text'] not in unique or r['count']>unique[r['text']]['count']:unique[r['text']]=r
 return sorted(unique.values(),key=lambda r:(-r['count']*(len(r['text'].split())-1),-r['count'],r['text']))[:limit]
# Root openers are an explicit communication design choice, not a corpus ranking.
root_rows=[]
for first_word in ['i','could','please','we','can','would','thanks','thank']:
 ranked=ordered(first.get(first_word,[]),4)
 if ranked:root_rows.append(ranked[0])
for row in ordered(contexts[''],16):
 if len(root_rows)>=8:break
 if row['text'] not in {r['text'] for r in root_rows}:root_rows.append(row)
contexts['']=root_rows
for kind,table,limit in [('context',contexts,8),('first',first,4)]:
 buckets=[{} for _ in range(32)]
 for key,rows in sorted(table.items()):buckets[bucket(key)][key]=rows if kind=='context' and key=='' else ordered(rows,limit)
 for i,b in enumerate(buckets):write(f'{kind}/{i}.json',b)
for start in range(0,len(records),128):write(f'spans/{start//128}.json',records[start:start+128])
# Pure graph estimates; corpus weights are SUBTLEX proxies, not agent probabilities.
def estimate(width):
 depth=[10**9]*len(nodes);depth[0]=0
 for i,n in enumerate(nodes):
  for child in n['children']+promotions[i][:max(0,width-len(n['children']))]:depth[child]=min(depth[child],depth[i]+1)
 costs={}
 for i,n in enumerate(nodes):
  for w in n['words']:costs[w]=min(costs.get(w,10**9),depth[i]+1)
 mass=sum(usage.get(norm(w),0) for w in words)
 return {'root_routes':len(rootchildren)+len(promotions[0][:max(0,width-len(rootchildren))]),'max_word_selection_activations':max(costs.values()),'usage_weighted_word_selection_activations':round(sum(costs[w]*usage.get(norm(w),0) for w in words)/mass,4),'unweighted_word_selection_activations':round(sum(costs.values())/len(words),4)}
manifest={'version':'1.0.0','reader':'marisa-trie==1.3.1','generator':'build-span/1','lexicon_version':lex['lexicon_version'],'lexicon_manifest_sha256':sha(lexraw),'word_count':len(words),'node_count':len(nodes),'node_bucket_size':128,'counts_sha256':sha(cb),'trie_sha256':sha(tb),'subtlex_sha256':sha(raw),'source_archive':'/predictive-keyboard/vendor/source/fluenttyper-presage-inputs-9d4826d5.tar.gz','source_archive_sha256':sha((ROOT/'relay/assets/predictive-keyboard/vendor/source/fluenttyper-presage-inputs-9d4826d5.tar.gz').read_bytes()),'provenance':'Retained n-grams and stored counts from the pinned FluentTyper English model. Original corpus/build lineage is not independently verified. Counts may be thresholded/scaled; they are not conversational probabilities.','observed_orders':dict(observed),'rejected_orders':dict(rejected),'retained_spans':len(records),'root_span_rule':'Empty-draft openers: one highest-heuristic span per i/could/please/we/can/would/thanks/thank, then unconditional fallback to eight. Explicit communication design, not a corpus-frequency claim.','phrase_selection':'stored_count * (continuation_words - 1), then count, then lexical; eight/context and four/first-word; <=96 lexical UTF-8 bytes; known blocked terms and every adjacent pair excluded','coverage':'Every exact declared ESDB spelling is shown at a reachable node; refinements strictly lengthen prefix; case-distinct spellings preserved.','development_graph_estimates':{str(w):estimate(w) for w in [32,48,64]},'files':{}}
(OUT/'build-span.py').write_bytes(Path(__file__).read_bytes())
(OUT/'requirements.txt').write_text('marisa-trie==1.3.1\n')
for p in sorted(OUT.rglob('*')):
 if p.is_file() and p.name!='manifest.json':manifest['files'][str(p.relative_to(OUT))]={'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
write('manifest.json',manifest)
print(json.dumps({k:manifest[k] for k in ['word_count','node_count','observed_orders','rejected_orders','retained_spans','development_graph_estimates']},indent=2))
