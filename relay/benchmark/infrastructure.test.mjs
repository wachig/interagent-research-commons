import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,appendFile,stat} from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
const root=await mkdtemp('/private/tmp/relay-infrastructure-');process.env.RELAY_BENCH_RUNS=root;
const {saveState,loadState,readEvents,durableAppend,lockDirectory,diskGuard,backupPrivate,atomicJson}=await import('./storage.mjs');
const {initRun,act,wireGet}=await import('./recorder.mjs');
const {verifyManifest,hash,selectCohort}=await import('./manifest.mjs');
const {updateControl,beforeRequest,beforeActivation,serviceResult,reserveDispatch,accountUsage,accountRunTime}=await import('./control.mjs');
const {compatibility,probePath}=await import('./preflight.mjs');
const {comparisonFor}=await import('./compare.mjs');
let hitUnsafe=0;
const server=http.createServer((req,res)=>{
 res.setHeader('X-Relay-Release','fixture');res.setHeader('Content-Type','text/html');
 if(req.url==='/partial'){res.writeHead(200,{'Content-Length':'100000'});res.write('partial bytes');setTimeout(()=>res.end(),400);return;}
 if(req.url==='/predictive-keyboard/assigned/'){res.writeHead(302,{Location:'/compose/other/'});res.end();return;}
 if(req.url==='/review/exact'){res.end('<pre class="draft">I</pre><a href="/publish/approved">Publish</a>');return;}
 if(req.url==='/publish/approved'){res.writeHead(302,{Location:'/publish/unapproved'});res.end();return;}
 if(req.url==='/publish/unapproved'||req.url==='/compose/other/')hitUnsafe++;
 res.end('<pre class="draft">I</pre>');
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
try{
 const dir=root+'/storage';await mkdir(dir);const state={id:'storage',events:0};await saveState(dir,state);state.value=2;await saveState(dir,state);
 await writeFile(dir+'/state.json','{"broken":');assert.equal((await loadState(dir)).value,2);
 await durableAppend(dir+'/events.jsonl',{seq:1,kind:'first'});await appendFile(dir+'/events.jsonl','{"seq":2');assert.equal((await loadState(dir)).events,1);assert.equal((await readEvents(dir+'/events.jsonl')).length,1);
 await durableAppend(dir+'/events.jsonl',{seq:2,kind:'second'});assert.equal((await readEvents(dir+'/events.jsonl')).length,2);
 await mkdir(dir+'/.lock');await atomicJson(dir+'/.lock/owner.json',{pid:2147483647,host:os.hostname()});const release=await lockDirectory(dir);await assert.rejects(lockDirectory(dir),/live/);await release();
 await assert.rejects(diskGuard(root,Number.MAX_SAFE_INTEGER),/Low disk/);
 const dest=root+'-backup';await backupPrivate(root,dest);assert.equal((await stat(dest)).mode&0o777,0o700);assert.equal((await loadState(dest+'/storage')).value,2);await rm(dest,{recursive:true});
 const manifestDir=root+'/manifest';await mkdir(manifestDir);await writeFile(manifestDir+'/methods.json','{}');
 const manifest={schema_version:2,sources:{},resources:{'/methods.json':{sha256:hash('{}')}},plan:{methods:['a'],targets:[{id:'t'}]},runtime:{}};manifest.plan_sha256=hash(JSON.stringify(manifest.plan));await atomicJson(manifestDir+'/freeze.json',manifest);
 await verifyManifest(manifestDir,{runtime:false});await writeFile(manifestDir+'/methods.json','{"altered":true}');await assert.rejects(verifyManifest(manifestDir,{runtime:false}),/resource differs/);
 manifest.resources={};manifest.sources={'relay/benchmark/client.mjs':'wrong'};await atomicJson(manifestDir+'/freeze.json',manifest);await assert.rejects(verifyManifest(manifestDir,{runtime:false}),/source differs/);
 const f={schema_version:2,benchmark:'new',cohort:'c',manifest_sha256:'fp',release:'fixture',plan:{methods:['a','b'],targets:[{id:'1'},{id:'2'}]}};
 const row=(method,task)=>({benchmark:'new',cohort:'c',manifest_sha256:'fp',release:'fixture',scored:true,finished:true,method,task,outcome:'failed'});
 const duplicate={runs:[row('a','1'),row('a','1'),row('b','1'),row('b','2')]};assert.throws(()=>comparisonFor(duplicate,f),/Duplicate/);
 const mixed={runs:[row('a','1'),{...row('a','2'),cohort:'old'}]};assert.equal(comparisonFor(mixed,f).not_attempted,3);
 assert.throws(()=>selectCohort({runs:[{...row('a','1'),manifest_sha256:'other'}]},f),/Mixed/);
 assert.equal(compatibility({id:'prefix-link',required_capabilities:['follow-links']},'strict-supplied-links-no-js-no-forms','<form action="/search">').status,'incompatible');
 await assert.rejects(probePath(base+'/publish/no',{local:true}),/cannot publish/);
 await initRun('redirect-method',{start_url:base+'/predictive-keyboard/assigned/',method_href:'/predictive-keyboard/assigned/',release:'fixture'});
 await assert.rejects(act('redirect-method',{op:'start'},{local:true}),/Changing assigned method/);assert.equal(hitUnsafe,0);
 await initRun('redirect-publish',{start_url:base+'/review/exact',expected_body:'I',release:'fixture'});
 let p=await act('redirect-publish',{op:'start'},{local:true});await assert.rejects(act('redirect-publish',{op:'follow',page:p.page,link:1,intent:'publish'},{local:true}),/no exact/);assert.equal(hitUnsafe,0);
 await assert.rejects(wireGet(base+'/partial',{local:true,timeoutMs:100}),e=>{assert.ok(e.telemetry.wire_body_bytes>0);assert.equal(e.telemetry.status,200);assert.ok(e.telemetry.http_ms>=90);return true;});
 await initRun('partial-record',{start_url:base+'/partial',release:'fixture',transport_timeout_ms:100});await assert.rejects(act('partial-record',{op:'start'},{local:true}),/Transport/);
 const pending=await loadState(root+'/partial-record');assert.equal(pending.http_requests,1);assert.ok(pending.pending_request);assert.ok((await readEvents(root+'/partial-record/events.jsonl')).some(e=>e.kind==='transport-error'&&e.wire_body_bytes>0));
 await assert.rejects(reserveDispatch(root,{run:'x',method_id:'a'}),/preflight/);
 await updateControl(root,s=>{s.stage='small-pilot';s.preflight.a={status:'compatible',manifest_sha256:'fp'};s.limits.max_slots=1;});
 await reserveDispatch(root,{run:'x',method_id:'a',task_id:'one',manifest_sha256:'fp'});await assert.rejects(reserveDispatch(root,{run:'y',method_id:'a',task_id:'two',manifest_sha256:'fp'}),/slot/i);
 await beforeRequest(root,{activation:true});await serviceResult(root,{status:503,run:'x'});await serviceResult(root,{status:200,run:'x'});await serviceResult(root,{status:503,run:'x'});await assert.rejects(beforeRequest(root),/paused/);
 await updateControl(root,s=>{s.paused=null;s.limits.max_model_tokens=10;});await accountRunTime(root,'clock',200);await accountRunTime(root,'clock',200);assert.equal((await updateControl(root,s=>s.agent_ms)),200);await beforeActivation(root);assert.equal((await updateControl(root,s=>s.activations)),2);await accountUsage(root,{id:'provider-one',source:'fixture',tokens:10});await assert.rejects(accountUsage(root,{id:'provider-one',source:'fixture',tokens:10}),/already accounted/);await assert.rejects(beforeRequest(root),/paused/);
 console.log('Infrastructure contracts passed: checkpoint/journal recovery, stale locks, private backup, low disk, manifest drift, cohort uniqueness/isolation, capability preflight, redirect guards, partial transfers, service circuit breaker and spending limits.');
}finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
