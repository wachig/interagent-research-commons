// Director-only controls. Never give the random broker key or private data to public reports.
import {ROOT,ORIGIN} from './recorder.mjs';
import {verifyManifest,loadManifest,hash} from './manifest.mjs';
import {updateControl,accountUsage,beforeRequest,serviceResult} from './control.mjs';
import {backupPrivate,loadState,saveState,lockDirectory,durableAppend} from './storage.mjs';
import {preflightMethod,probePath} from './preflight.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const [command,...rest]=process.argv.slice(2),args={};for(let i=0;i<rest.length;i+=2)args[rest[i].slice(2)]=rest[i+1];
let result;
if(command==='status')result=await updateControl(ROOT,s=>s);
else if(command==='backup'){if(!args.destination)throw Error('Required --destination PRIVATE_PATH');result=await backupPrivate(ROOT,path.resolve(args.destination));}
else if(command==='observe'){
 if(!args.run||!args.file||!/^[a-z0-9][a-z0-9_-]{0,90}$/.test(args.run))throw Error('Required --run ID --file PRIVATE_OBSERVATION.json');const o=JSON.parse(await readFile(args.file));if(!o.id||!o.source)throw Error('Observation needs id/source');const dir=path.join(ROOT,args.run),unlock=await lockDirectory(dir);try{const state=await loadState(dir);state.observations??=[];if(state.observations.some(x=>x.id===o.id))throw Error('Observation already recorded');state.observations.push(o);await durableAppend(path.join(dir,'events.jsonl'),{seq:++state.events,at:new Date().toISOString(),kind:'orchestrator-observation',observation:o});await saveState(dir,state);result={recorded:true};}finally{await unlock();}
}
else if(command==='usage'){if(!args.file)throw Error('Required --file PRIVATE_MEASURED_USAGE.json');const u=JSON.parse(await readFile(args.file));if(!u.source||!u.id)throw Error('Measured usage needs unique id and source');if(u.elapsed_ms!==undefined)throw Error('Run wall time is automatic; import only provider tokens/cost');result=await accountUsage(ROOT,u);
}
else {
 if(!args.manifest)throw Error('Required --manifest COHORT_DIRECTORY');await verifyManifest(path.resolve(args.manifest));const f=await loadManifest(args.manifest);
 if(command==='preflight'){
  const registry=JSON.parse(await readFile(path.join(args.manifest,'methods.json')));
  for(const method of registry.methods.filter(m=>f.plan.methods.includes(m.id))){const probe=await preflightMethod(method,f,{onRequest:()=>beforeRequest(ROOT),onResponse:r=>serviceResult(ROOT,{...r,run:'preflight-'+method.id})});await updateControl(ROOT,s=>{s.preflight[method.id]=probe;});}
  result=await updateControl(ROOT,s=>s);
 }else if(command==='pilot')result=await updateControl(ROOT,s=>{if(s.paused)throw Error('Resolve pause first');if(s.stage!=='preflight')throw Error('Pilot already authorized');for(const method of f.plan.methods)if(s.preflight[method]?.status!=='compatible'||s.preflight[method]?.manifest_sha256!==f.manifest_sha256)throw Error('Every retained method needs compatible preflight');s.pilot_target_ids=f.plan.pilot_target_ids;s.stage='small-pilot';s.limits={...s.limits,...f.plan.spending_limits};s.cohort=f.cohort;s.manifest_sha256=f.manifest_sha256;});
 else if(command==='resume'){
  // Require a fresh probe of the composition/search operation implicated in the error, not /health.
  const url=new URL(args.operation,ORIGIN);if(!/^\/(?:predictive-keyboard|compose)\//.test(url.pathname)||! /\/(?:step|state|search|prefix|key|characters|bytes|range|branch|browse|review)\//.test(url.pathname)||/\/publish\//.test(url.pathname))throw Error('Supply the affected composition/search operation URL');
  const probe=await probePath(url.href,{release:f.release});result=await updateControl(ROOT,s=>{if(s.manifest_sha256&&s.manifest_sha256!==f.manifest_sha256)throw Error('Different cohort');if(!s.paused?.startsWith('Repeated service'))throw Error('Only a service-error pause can be resumed; budgets require a new authorized cohort');s.resume_probe={at:probe.observed_at,release:probe.release};s.paused=null;s.service_errors=0;});
 }else if(command==='expand'){
  if(!args.review)throw Error('Expansion requires --review REVIEW.json with adjudicated small-pilot evidence');const review=JSON.parse(await readFile(args.review));
  if(review.cohort!==f.cohort||review.manifest_sha256!==f.manifest_sha256||!review.infrastructure_stable||!review.comparable_evidence||!review.reason)throw Error('Expansion review is incomplete');
  const evidence=await readFile(path.join(args.manifest,'comparison.json'),'utf8');if(hash(evidence)!==review.evidence_sha256)throw Error('Review must identify the exact exported comparison');const comparison=JSON.parse(evidence);if(comparison.cohort!==f.cohort||comparison.manifest_sha256!==f.manifest_sha256||!comparison.pairs.some(p=>p.completed_pairs>0))throw Error('No comparable completed pairs for expansion');
  result=await updateControl(ROOT,async s=>{if(s.stage!=='small-pilot'||s.paused)throw Error('Small pilot must finish without a pause');const required=f.plan.methods.length*f.plan.pilot_target_ids.length;if(s.dispatched.length!==required)throw Error('Complete every small-pilot slot before expansion');
  for(const dispatched of s.dispatched){const run=await loadState(path.join(ROOT,dispatched.run));if(!run.finished)throw Error('Pilot has open slots');if(run.failure_category==='service'||run.failure_category==='transport')throw Error('Pilot service failures require a new regression cohort after repair');}
  const eligible=s.dispatched.filter(r=>!review.excluded_methods?.includes(r.method));if(!eligible.length)throw Error('No pilot evidence');s.stage='expanded';s.expansion_review=review;s.limits={...s.limits,...f.plan.expanded_spending_limits};});
 }else throw Error('Commands: status, backup, usage, observe, preflight, pilot, resume, expand');
}
console.log(JSON.stringify(result,null,2));
