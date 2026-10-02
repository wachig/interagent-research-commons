import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {fixture,parse} from '../tools/local-evaluation.mjs';
import {readFile} from 'node:fs/promises';
// Stub only the rendering runtime's WASM import; execute the actual storage/alarm source.
const storageSource=(await readFile(new URL('../worker.js',import.meta.url),'utf8')).replace('import protocolRuntime from "./runtime.js";', 'const protocolRuntime = {};').replace('from "./schema.js"', 'from '+JSON.stringify(new URL('../schema.js',import.meta.url).href));
const {RelayStore}=await import('data:text/javascript;base64,'+Buffer.from(storageSource).toString('base64'));
import {USAGE_RETENTION_MS,MAX_CHOICES_PER_DAY,usageExport} from '../keyboard_usage.js';
const f=await fixture();const overhead=[];
const html=async route=>{const p=await f.request(route,{html:true});assert.notEqual(p.headers.get('x-relay-usage'),'unavailable','telemetry must succeed');if(p.headers.has('x-relay-usage-ms'))overhead.push(Number(p.headers.get('x-relay-usage-ms')));return {...p,...parse(p.text,p.url)};};
const link=(p,predicate)=>{const l=p.links.find(typeof predicate==='string'?x=>x.text===predicate:predicate);assert.ok(l,'missing supplied link');return l.url;};
try{
 const methods=(await f.request('/methods.json')).body.methods.filter(m=>m.group==='keyboard');
 assert.equal(methods.length,7);
 for(const method of methods){
  console.log("Checking native telemetry:",method.id);
  let p=await html(method.href);let requests=1;
  assert.equal(p.headers.get('x-relay-execution'),'durable-object','all seven keyboard entry renderers execute beside existing storage');
  if(method.id==='frame'){p=await html(link(p,l=>/start\//.test(l.url)&&l.text.includes('Write a sentence')));requests++;p=await html(link(p,'Compose exact text'));requests++;}
  if(method.id==='token-link'){p=await html(link(p,l=>/\/start\/generation\//.test(l.url)));requests++;p=await html(link(p,'Browse exact UTF-8 bytes'));requests++;p=await html(link(p,l=>l['aria-label']==='Browse bytes 60 through 6f'));requests++;}
  const run=p.headers.get('x-relay-usage-run');assert.match(run,/^[a-f0-9]{64}$/);
  if(method.id!=='token-link'&&!p.links.some(l=>l.text==='a'&&(/\/step\//.test(l.url)||/\/action\//.test(l.url)))){p=await html(link(p,l=>/^Exact characters|^Literal characters/.test(l.text)));requests++;}
  const first=method.id==='token-link'?link(p,l=>/\/branch\/[^/]+\/b61\//.test(l.url)):link(p,l=>l.text==='a'&&(/\/step\//.test(l.url)||/\/action\//.test(l.url)));
  p=await html(first);requests++;assert.equal(p.headers.get('x-relay-usage-run'),run);
  const beforeReplay=await f.sql('SELECT SUM(choice_count) AS n FROM keyboard_usage_daily');
  const replay=await html(first);requests++;
  assert.equal((await f.sql('SELECT SUM(choice_count) AS n FROM keyboard_usage_daily'))[0].n,beforeReplay[0].n,'replay adds a request but no duplicate issued-choice allocation');assert.equal(replay.headers.get('x-relay-usage-run'),run);
  const before=f.sql('SELECT COUNT(*) AS count FROM keyboard_usage_events WHERE run_id=?',run);
  await f.request(first,{method:'HEAD',html:true});await f.request(first,{method:'OPTIONS',html:true});
  assert.equal((await f.sql('SELECT COUNT(*) AS count FROM keyboard_usage_events WHERE run_id=?',run))[0].count,(await before)[0].count,'HEAD/OPTIONS do not add telemetry');
  if(method.id==='frame'){p=await html(link(p,l=>/^Return to/.test(l.text)&&/\/state\//.test(l.url)));requests++;}
  p=await html(link(p,method.id==='token-link'?'Review this exact branch':'Review message'));requests++;
  if(method.id==='token-link'){p=await html(link(p,'Arm publication'));requests++;}
  const publishHref=link(p,'Publish this message publicly');p=await html(publishHref);requests++;assert.equal(p.headers.get('x-relay-usage-run'),run,'publication remains in originating run');
  const record=link(p,l=>/\/message\/IARC-M-/.test(l.url));await html(record);requests++;
  const events=await f.sql('SELECT * FROM keyboard_usage_events WHERE run_id=? ORDER BY created_at',run);
  // Token/Frame have a read-only overview outside the new session.
  const unassociated=method.id==='token-link'||method.id==='frame'?1:0;
  assert.equal(events.length,requests-unassociated,method.id+' complete request reconciliation');
  assert.equal(events.filter(e=>e.repeat_request).length,1,'exact replay counted as a new observed request');
  assert.ok(events.some(e=>e.action==='publication'));
  assert.ok(events.some(e=>e.action==='public-record-read'));
  const r=(await f.sql('SELECT * FROM keyboard_usage_runs WHERE run_id=?',run))[0];
  assert.equal(r.method_id,method.id);assert.equal(r.furthest_stage,'published');assert.ok(r.message_id);
  assert.equal(r.expires_at-r.created_at,USAGE_RETENTION_MS,'30-day deadline is fixed at first observation');
  assert.ok(events.every(e=>e.expires_at===r.expires_at));
  assert.ok(events.every(e=>e.response_bytes>0&&e.server_ms>=0));
  if(method.id==='token-link'){await f.sql('DELETE FROM token_composer_states WHERE session_id IN (SELECT session_id FROM token_composer_sessions WHERE published_at IS NOT NULL)');assert.equal((await html(publishHref)).status,200,'receipt replay survives private trace deletion');}
 }
 // Exercise realistic high-choice word pages through the actual storage RPC, not just literal keys.
 let sentence=await html('/predictive-keyboard/html/chunk-keyboard-3/');const sentenceRun=sentence.headers.get('x-relay-usage-run');let sentenceRequests=1;
 for(const word of ['Can','you']) {
   const choice=link(sentence,l=>l.text.toLowerCase()===word.toLowerCase()&&/\/step\/.*\/pick\//.test(l.url));
   sentence=await html(choice);sentenceRequests++;
 }
 assert.equal((await f.sql('SELECT COUNT(*) AS n FROM keyboard_usage_events WHERE run_id=?',sentenceRun))[0].n,sentenceRequests,'dense candidate pages retain every observed word selection');
 // Choice attribution is sourced from emitted links without saving their text.
 let p=await html('/predictive-keyboard/html/short-word-keyboard/');const run=p.headers.get('x-relay-usage-run');p=await html(link(p,l=>l.text==='You'&&/\/step\//.test(l.url)));
 const choice=(await f.sql('SELECT section,choice_rank,delta_bytes FROM keyboard_usage_events WHERE run_id=? ORDER BY created_at DESC LIMIT 1',run))[0];
 assert.ok(choice.section);assert.ok(choice.choice_rank>0);assert.equal(choice.delta_bytes,3);
 assert.equal((await f.request('/admin/api/keyboard-usage')).status,401);
 assert.equal((await f.request('/admin/keyboard-usage')).status,401);
 const exportDB={prepare(query){return {bind(...args){return {async first(){return (await f.sql(query,...args))[0]||null;},async all(){return {results:await f.sql(query,...args)};}};}};}};
 let cursor=null,beforeId=null,exported=[];
 do {const url=new URL('https://local.invalid/admin/api/keyboard-usage?limit=3');if(cursor!==null){url.searchParams.set('before',cursor);url.searchParams.set('before_id',beforeId);}const page=await usageExport({RELAY_DB:exportDB},url);exported.push(...page.events);cursor=page.next_before;beforeId=page.next_before_id;}while(cursor!==null);
 assert.equal(new Set(exported.map(e=>e.event_id)).size,exported.length);
 assert.equal(exported.length,(await f.sql('SELECT COUNT(*) AS n FROM keyboard_usage_events WHERE expires_at>?',Date.now()))[0].n,'compound cursor exports every retained event');

 // Near-cap new pages retain request observations and mark partial rank metadata.
 const currentDay=Math.floor(Date.now()/86400000)*86400000;
 await f.sql('UPDATE keyboard_usage_daily SET choice_count=? WHERE day=?',MAX_CHOICES_PER_DAY-1,currentDay);
 const limited=await html('/predictive-keyboard/html/short-word-keyboard/');
 const limitedRun=limited.headers.get('x-relay-usage-run');
 assert.equal((await f.sql('SELECT choice_count FROM keyboard_usage_daily WHERE day=?',currentDay))[0].choice_count,MAX_CHOICES_PER_DAY,'bounded choice cap is honored');
 assert.equal((await f.sql('SELECT choices_truncated FROM keyboard_usage_runs WHERE run_id=?',limitedRun))[0].choices_truncated,1,'partial choices are explicitly marked');
 assert.equal((await f.sql('SELECT COUNT(*) AS n FROM keyboard_usage_events WHERE run_id=?',limitedRun))[0].n,1,'choice exhaustion does not suppress observed request');
 const capExport=await usageExport({RELAY_DB:exportDB},new URL('https://local.invalid/admin/api/keyboard-usage'));
 assert.equal(capExport.daily_caps.issued_choices,MAX_CHOICES_PER_DAY);
 const columns=await f.sql('PRAGMA table_info(keyboard_usage_events)');assert.ok(!columns.some(c=>/body|text|url|capability|ip_address/.test(c.name)));
 overhead.sort((a,b)=>a-b);console.log('Local telemetry overhead ms:',JSON.stringify({requests:overhead.length,median:overhead[Math.floor(overhead.length/2)],p95:overhead[Math.floor((overhead.length-1)*.95)],max:overhead.at(-1)}));
 console.log('Native telemetry: all seven methods, exact request/replay accounting, publication/record association, choice attribution, 30-day deadlines, read-only HEAD/OPTIONS and protected export passed.');
}finally{await f.close();}
// Invoke actual alarm cleanup against a real SQLite adapter, not a copied DELETE implementation.
const db=new DatabaseSync(':memory:');let scheduled=null;
const sql={exec(query,...values){const rows=db.prepare(query).all(...values);return {toArray(){return rows;}};}};
const ctx={storage:{sql,transactionSync(fn){db.exec('BEGIN');try{fn();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},async setAlarm(at){scheduled=at;},async deleteAlarm(){scheduled=null;}}};
const store=new RelayStore(ctx,{RELAY_MESSAGE_RETENTION_SECONDS:'7776000'});const now=Date.now();
db.exec(`INSERT INTO keyboard_usage_runs VALUES ('expired','chunk-word','test','test','test',${now-USAGE_RETENTION_MS-1000},${now-1000},${now-1},${now-100},'started',NULL,NULL,0,0)`);
db.exec(`INSERT INTO keyboard_usage_events VALUES ('event','expired','chunk-word',${now-USAGE_RETENTION_MS-1000},${now-1},'page-read',NULL,NULL,200,10,1,1,0,0,0,'fingerprint',NULL)`);
db.exec(`INSERT INTO keyboard_usage_choices VALUES ('fingerprint','expired','other',1,'review',${now-1})`);
db.prepare('INSERT INTO messages (message_id,conversation_id,author_ref,body,body_digest,policy_version,created_at) VALUES (?,?,?,?,?,?,?)').run('retained','conversation','author','keep','digest','policy',now-40*24*60*60*1000);
db.prepare("INSERT INTO token_composer_sessions (session_id,root_state_id,task_class,author_ref,condition_id,created_at,expires_at,published_at,message_id,traversal_count) VALUES ('receipt-session','root','generation','author','condition',?,?,?,?,1)").run(now-40*86400000,now-39*86400000,now-40*86400000,'retained');
db.prepare("INSERT INTO token_composer_states (state_id,session_id,parent_state_id,unit_id,unit_kind,unit_bytes_b64,body_bytes_b64,body_length,created_at) VALUES ('root','receipt-session',NULL,NULL,'root','','',0,?)").run(now-40*86400000);
db.prepare("INSERT INTO token_composer_events (event_id,session_id,event_type,created_at) VALUES ('legacy','receipt-session','session_started',?)").run(now-40*86400000);
db.prepare("INSERT INTO token_composer_outcome_aggregates VALUES ('2000-01','generation','condition','version','published','published',1,?)").run(now-40*86400000);
await store.alarm();for(const table of ['keyboard_usage_events','keyboard_usage_choices','keyboard_usage_runs','keyboard_usage_daily'])assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,0);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM token_composer_events').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM token_composer_states').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM token_composer_outcome_aggregates').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM token_composer_sessions').get().n,1,'operational receipt session remains available');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n,1,'30-day telemetry cleanup does not shorten message retention');assert.ok(scheduled>now);db.close();
console.log('Actual Durable Object alarm: expired telemetry removed; 40-day public message preserved.');
