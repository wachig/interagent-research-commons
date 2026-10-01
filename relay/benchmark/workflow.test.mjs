// Exercise export/checklist commands offline with synthetic private data.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {atomicJson,saveState} from './storage.mjs';
import {hash} from './manifest.mjs';
const root=await mkdtemp('/private/tmp/relay-workflow-'),out=root+'/cohort',runs=root+'/runs';await mkdir(out);await mkdir(runs);
const run=promisify(execFile),env={...process.env,RELAY_BENCH_RUNS:runs};
const secret='private exact body and bearer /publish/cap-SECRET';
const parent='IARC-M-11111111-1111-1111-1111-111111111111';
const plan={methods:['chunk-word'],targets:[{id:'T',body:secret}],pilot_target_ids:['T'],profile:'strict',model:'gpt-6-luna',reasoning_effort:'high',run_prefix:'test-'};
const freeze={schema_version:2,benchmark:'workflow-fixture',cohort:'synthetic',release:'fixture',plan};
const manifestHash=hash(JSON.stringify(freeze));await atomicJson(out+'/freeze.json',freeze);
try{
 await mkdir(runs+'/test-t-chunk-word');
 await saveState(runs+'/test-t-chunk-word',{id:'test-t-chunk-word',events:0,activations:1,http_requests:1,started_ms:10,finished_ms:20,finished:true,outcome:'completed',note:'secret-broker-key /publish/cap-SECRET',config:{benchmark:freeze.benchmark,cohort:freeze.cohort,manifest_sha256:manifestHash,release:'fixture',method_id:'chunk-word',task_id:'T',scored:true,expected_body:secret,profile:plan.profile,model:plan.model,reasoning_effort:plan.reasoning_effort},verification:{message_id:parent,conversation_id:parent.replace('IARC-M-','IARC-C-'),body_exact:true,reply_exact:true,digest_exact:true,designation_exact:true,conversation_exact:true},current:{url:'https://relay.interagentresearchcommons.org/publish/cap-SECRET',text:secret}});
 await atomicJson(runs+'/broker.json',{key:'secret-broker-key'});await mkdir(runs+'/.control');await atomicJson(runs+'/.control/state.json',{model_tokens:123,model_cost:0.5,usage_available:true,usage_records:[{run:'test-t-chunk-word',tokens:123,cost:0.5,source:'private provider source'}]});
 await run(process.execPath,['relay/benchmark/report.mjs',out],{env});await run(process.execPath,['relay/benchmark/compare.mjs',out],{env});await run(process.execPath,['relay/benchmark/cohort.mjs',out],{env});
 const exportText=await readFile(out+'/runs.json','utf8'),report=JSON.parse(exportText),comparison=JSON.parse(await readFile(out+'/comparison.json'));
 assert.equal(comparison.complete,true);assert.equal(comparison.planned,1);assert.equal(report.runs[0].provider_tokens,123);assert.equal(report.runs[0].provider_cost,0.5);
 assert.ok(!exportText.includes(secret));assert.ok(!exportText.includes('cap-SECRET'));assert.ok(!exportText.includes('secret-broker-key'));assert.ok(!exportText.includes('private provider source'));
 const historical=root+'/historical';await mkdir(historical);await atomicJson(historical+'/freeze.json',{schema_version:1});
 await assert.rejects(run(process.execPath,['relay/benchmark/report.mjs',historical],{env}),/Historical exports/);
 await assert.rejects(run(process.execPath,['relay/benchmark/compare.mjs',historical],{env}),/Historical cohort/);
 // An existing freeze directory must be rejected before any upstream request.
 await assert.rejects(run(process.execPath,['relay/benchmark/freeze.mjs','--output',out,'--plan','relay/benchmark/plan-next.json','--reply-parent','docs/relay-benchmark-2026-10-01/reply-parent.json'],{env}),/EEXIST/);
 console.log('Offline workflow passed: cohort export/scoring/checklist, provider facts, private-data exclusion, historical read-only guards and freeze overwrite refusal.');
}finally{await rm(root,{recursive:true,force:true});}
