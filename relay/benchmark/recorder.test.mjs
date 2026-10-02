import assert from 'node:assert/strict';
import http from 'node:http';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
const root=await mkdtemp('/private/tmp/relay-recorder-contract-');process.env.RELAY_BENCH_RUNS=root;
const {saveState,loadState}=await import('./storage.mjs');
const {initRun,act,extract}=await import('./recorder.mjs');
const body='A  B\n\nC\tD café 😀';let publishes=0,adds=0;
const messageId='IARC-M-11111111-1111-1111-1111-111111111111';
const server=http.createServer((req,res)=>{
  res.setHeader('X-Relay-Release','fixture-v1');
  if(req.url==='/headerless'){res.removeHeader('X-Relay-Release');res.writeHead(503);res.end('Worker exceeded resource limits');return;}
  if(req.url==='/redirect'){res.writeHead(302,{Location:'/root'});res.end();return;}
  if(req.url==='/record'){res.setHeader('Content-Type','text/html');res.end('<h1>Relay response</h1><pre>'+JSON.stringify({message_id:messageId,visibility:'public',conversation_id:messageId.replace("IARC-M-","IARC-C-"),contributor_designation:null,body,body_digest:createHash('sha256').update(body).digest('base64url'),reply_to:null})+'</pre>');return;}
  if(req.url==='/add'){adds++;}
  if(req.url==='/publish/cap'){publishes++;}
  const html='<!doctype html><html><head><title>Fixture</title><style>invisible css</style></head><body><h1>Test</h1>'+ (req.url==='/publish/cap'?`<p>Message ID: <code>${messageId}</code></p>`:'')+'<pre class="draft">'+body+'</pre><a href="/add" aria-label="Add colon">:</a><a href="#anchor">Jump</a><a href="/publish/cap">Publish publicly</a><a href="https://example.com/">External</a><a href="/record">Machine record</a><a href="/review/exact">Review</a><script>invisible script</script></body></html>';
  const compressed=gzipSync(html);res.setHeader('Content-Type','text/html');res.setHeader('Content-Encoding','gzip');res.end(compressed);
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
try{
  const p=await extract('<title>X</title><base href="/b/"><pre class="draft">a  b\n\nc</pre><a href="x?one=1&amp;two=2" aria-label="Exact x">x</a><svg><title>ignored</title></svg>');
  assert.equal(p.title,'X');assert.equal(p.base,'/b/');assert.equal(p.drafts[0],'a  b\n\nc');assert.equal(p.links[0].href,'x?one=1&two=2');assert.equal(p.links[0].label,'Exact x');assert.ok(p.extracted_tokens_o200k>0);
  await initRun('contract',{start_url:base+'/redirect',release:'fixture-v1',expected_body:body});
  let page=await act('contract',{op:'start'},{local:true});assert.equal(page.page,1);assert.equal(page.drafts[0],body);
  const before=JSON.parse(await readFile(root+'/contract/state.json'));assert.equal(before.http_requests,2);assert.equal(before.activations,1);
  await assert.rejects(act('contract',{op:'follow',page:0,link:1},{local:true}),/Stale/);
  await assert.rejects(act('contract',{op:'follow',page:1,link:3},{local:true}),/explicit/);assert.equal(publishes,0);
  await assert.rejects(act('contract',{op:'follow',page:1,link:3,intent:'publish'},{local:true}),/no exact/);assert.equal(publishes,0);
  await assert.rejects(act('contract',{op:'follow',page:1,link:4},{local:true}),/External/);
  page=await act('contract',{op:'follow',page:1,link:2},{local:true});assert.equal(page.page,1);
  let s=JSON.parse(await readFile(root+'/contract/state.json'));assert.equal(s.http_requests,2);assert.equal(s.activations,2);
  await act('contract',{op:'follow',page:1,link:1,drop:true},{local:true});assert.equal(adds,1);
  page=await act('contract',{op:'retry'},{local:true});assert.equal(adds,2);assert.equal(page.page,2);
  page=await act('contract',{op:'follow',page:2,link:6},{local:true});
  page=await act('contract',{op:'follow',page:3,link:3,intent:'publish'},{local:true});assert.equal(publishes,1);
  page=await act('contract',{op:'follow',page:4,link:5},{local:true});
  const done=await act('contract',{op:'finish',outcome:'completed'},{local:true});assert.equal(done.outcome,'completed');
  const events=(await readFile(root+'/contract/events.jsonl','utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(events.filter(e=>e.kind==='fragment').length,1);assert.equal(events.filter(e=>e.kind==='http').length,7);
  assert.ok(events.some(e=>e.kind==='http'&&e.wire_body_bytes<e.uncompressed_bytes));assert.ok(events.some(e=>e.kind==='injected-response-loss'));
  await initRun('changed',{start_url:base+'/root',release:'wrong'});await assert.rejects(act('changed',{op:'start'},{local:true}),/Release changed/);
  await assert.rejects(act('changed',{op:'retry'},{local:true}),/persistent/);
  await initRun('headerless',{start_url:base+'/headerless',release:'fixture-v1'});
  await assert.rejects(act('headerless',{op:'start'},{local:true}),/Unverified service error HTTP 503/);
  const missing=JSON.parse(await readFile(root+'/headerless/state.json'));
  assert.equal(missing.http_requests,1);assert.equal(missing.frozen_release_mismatch,undefined);
  await initRun('mismatch',{start_url:base+'/record',expected_body:body});await act('mismatch',{op:'start'},{local:true});await assert.rejects(act('mismatch',{op:'finish',outcome:'completed'},{local:true}),/publication receipt/);
  const prefixConfig={method_id:'prefix-link',method_href:'/predictive-keyboard/html/prefix-keyboard/',expected_body:body};
  await initRun('prefix-action',{...prefixConfig,start_url:base+'/predictive-keyboard/html/word-links/step/fixture?view=prefix'});
  await act('prefix-action',{op:'start'},{local:true});
  await initRun('prefix-exact',{...prefixConfig,start_url:base+'/predictive-keyboard/html/word-links/characters/fixture?view=prefix'});
  await act('prefix-exact',{op:'start'},{local:true});
  await initRun('prefix-switch',{...prefixConfig,start_url:base+'/predictive-keyboard/html/word-links/'});
  await assert.rejects(act('prefix-switch',{op:'start'},{local:true}),/Changing assigned method/);
  const shortConfig={method_id:'short-word',method_href:'/predictive-keyboard/html/short-word-keyboard/',expected_body:body};
  await initRun('short-action',{...shortConfig,start_url:base+'/predictive-keyboard/html/word-links/step/fixture?view=short'});
  await act('short-action',{op:'start'},{local:true});
  await initRun('short-exact',{...shortConfig,start_url:base+'/predictive-keyboard/html/word-links/characters/fixture?view=short'});
  await act('short-exact',{op:'start'},{local:true});
  await initRun('short-switch',{...shortConfig,start_url:base+'/predictive-keyboard/html/word-links/step/fixture?view=prefix'});
  await assert.rejects(act('short-switch',{op:'start'},{local:true}),/Changing assigned method/);
  const spanConfig={method_id:'span',method_href:'/predictive-keyboard/html/span-keyboard/',expected_body:body};
  await initRun('span-action',{...spanConfig,start_url:base+'/predictive-keyboard/html/word-links/step/fixture?view=span'});
  await act('span-action',{op:'start'},{local:true});
  await initRun('span-exact',{...spanConfig,start_url:base+'/predictive-keyboard/html/word-links/characters/fixture?view=span'});
  await act('span-exact',{op:'start'},{local:true});
  await initRun('span-switch',{...spanConfig,start_url:base+'/predictive-keyboard/html/word-links/step/fixture?view=short'});
  await assert.rejects(act('span-switch',{op:'start'},{local:true}),/Changing assigned method/);
  const frameConfig={method_id:'frame',method_href:'/predictive-keyboard/html/frame-keyboard/',expected_body:body};
  await initRun('frame-review',{...frameConfig,start_url:base+'/predictive-keyboard/html/frame-keyboard/review/fixture'});
  await act('frame-review',{op:'start'},{local:true});
  const frameState=await loadState(root+'/frame-review');
  assert.ok(frameState.review_witness);
  await act('frame-review',{op:'follow',page:1,link:3,intent:'publish'},{local:true});
  await act('frame-review',{op:'follow',page:2,link:5},{local:true});
  assert.equal((await act('frame-review',{op:'finish',outcome:'completed'},{local:true})).outcome,'completed');
  await initRun('frame-switch',{...frameConfig,start_url:base+'/predictive-keyboard/html/word-links/'});
  await assert.rejects(act('frame-switch',{op:'start'},{local:true}),/Changing assigned method/);
  const semantic=await extract('<a href="/word" data-relay-action="span" data-relay-span-words="3" data-relay-effect="next">a lot of</a>');
  assert.deepEqual(semantic.links[0].semantic,{action:'span',effect:'next','span-words':'3'});
  await initRun('byline',{start_url:base+'/record',expected_body:body,expected_designation:'Tester'});await act('byline',{op:'start'},{local:true});const byline=await loadState(root+'/byline');byline.publication_receipt_id=messageId;await saveState(root+'/byline',byline);assert.equal((await act('byline',{op:'finish',outcome:'completed'},{local:true})).outcome,'published_mismatch');
  console.log('Recorder contract passed: exact text, supplied links, stale selections, fragments, redirects, compressed bytes, dropped responses, publication intent, receipt checks, and release freeze.');
}finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true});}
