// Global circuit breaker and explicit staged spending limits, kept with private runs.
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {atomicJson,lockDirectory,diskGuard,loadState} from './storage.mjs';
export const DEFAULT_LIMITS={max_slots:6,max_concurrency:1,max_http_attempts:600,max_activations:600,max_agent_ms:60*60*1000,max_model_tokens:1000000,max_model_cost:25,service_failure_threshold:2,max_service_retries_per_run:2};
export async function updateControl(root,change){
 const dir=path.join(root,'.control');await mkdir(dir,{recursive:true,mode:0o700});const unlock=await lockDirectory(dir);
 try{let s;try{s=JSON.parse(await readFile(path.join(dir,'state.json')));}catch(e){if(e.code!=='ENOENT')throw e;s={limits:{...DEFAULT_LIMITS},http_attempts:0,activations:0,agent_ms:0,model_tokens:0,model_cost:0,service_errors:0,dispatched:[],stage:'preflight',preflight:{}};}
 const result=await change(s);await atomicJson(path.join(dir,'state.json'),s);return result??s;
 }finally{await unlock();}
}
export async function reserveDispatch(root,config){return updateControl(root,async s=>{
 if(s.paused)throw Error('Dispatch paused: '+s.paused);
 if(!['small-pilot','expanded'].includes(s.stage))throw Error('Dispatch requires passed preflight and explicit small-pilot authorization');
 if(s.manifest_sha256&&s.manifest_sha256!==config.manifest_sha256)throw Error('Different cohort: use separate private run storage');
 if(s.dispatched.some(r=>r.run===config.run||r.method===config.method_id&&r.task===config.task_id))throw Error('Slot already reserved; retain its outcome');
 if(s.dispatched.length>=s.limits.max_slots)throw Error('Declared cohort slot spending limit reached');
 let active=0;for(const r of s.dispatched){let state;try{state=await loadState(path.join(root,r.run));}catch{}if(!state?.finished)active++;}
 if(active>=s.limits.max_concurrency)throw Error('Declared concurrency limit reached; close prior slot first');
 if(s.stage==='small-pilot'&&s.pilot_target_ids&&!s.pilot_target_ids.includes(config.task_id))throw Error('Target requires reviewed expansion');
 const p=s.preflight[config.method_id];if(p?.status!=='compatible')throw Error('Method/profile has no compatible preflight: '+config.method_id);
 if(p.manifest_sha256!==config.manifest_sha256)throw Error('Preflight belongs to different frozen conditions');
 if(s.dispatched.length>=s.limits.max_slots)throw Error('Declared cohort slot spending limit reached');
 s.dispatched.push({run:config.run,method:config.method_id,task:config.task_id,at:Date.now()});return true;
 });}
export async function beforeRequest(root,{activation=false,serviceRetries=0}={}){
 await diskGuard(root);return updateControl(root,s=>{
 if(s.paused)throw Error('Benchmark paused: '+s.paused);
 for(const [counter,limit] of [['http_attempts','max_http_attempts'],['activations','max_activations'],['agent_ms','max_agent_ms'],['model_tokens','max_model_tokens'],['model_cost','max_model_cost']])if(s[counter]>=s.limits[limit])throw Error('Declared cohort spending limit reached: '+limit);
 if(serviceRetries>s.limits.max_service_retries_per_run)throw Error('Bounded service retry allowance reached');
 s.http_attempts++;if(activation)s.activations++;
 });
}
export async function serviceResult(root,{status,transport=false,run}){return updateControl(root,s=>{
 if(transport||status===429||status>=500){s.service_errors++;s.last_service_error={run,status,transport,at:Date.now()};if(s.service_errors>=s.limits.service_failure_threshold)s.paused='Repeated service/transport failures; inspect and run a successful operation probe before resuming';}
 // A lightweight successful response does not erase a resource-error burst.
 });}
export async function accountUsage(root,usage){return updateControl(root,s=>{
 if(usage.id){s.usage_ids??=[];if(s.usage_ids.includes(usage.id))throw Error('Usage already accounted');s.usage_ids.push(usage.id);}
 for(const [key,field] of [['agent_ms','elapsed_ms'],['model_tokens','tokens'],['model_cost','cost']])if(usage[field]!==undefined){if(!Number.isFinite(usage[field])||usage[field]<0)throw Error('Invalid measured usage');s[key]+=usage[field];}
 s.usage_records??=[];s.usage_records.push({id:usage.id||null,run:usage.run||null,source:usage.source||null,tokens:usage.tokens??null,cost:usage.cost??null});
 s.usage_available=usage.tokens!==undefined||s.usage_available||false;
 for(const [key,limit] of [['agent_ms','max_agent_ms'],['model_tokens','max_model_tokens'],['model_cost','max_model_cost']])if(s[key]>=s.limits[limit])s.paused='Declared spending limit reached: '+limit;
 });}

export async function beforeActivation(root){await diskGuard(root);return updateControl(root,s=>{if(s.paused)throw Error('Benchmark paused: '+s.paused);if(s.activations>=s.limits.max_activations)throw Error('Declared cohort activation limit reached');s.activations++;});}
export async function accountRunTime(root,run,total){return updateControl(root,s=>{s.run_time_ms??={};const prior=s.run_time_ms[run]||0;s.agent_ms+=Math.max(0,total-prior);s.run_time_ms[run]=Math.max(total,prior);if(s.agent_ms>=s.limits.max_agent_ms)s.paused='Declared spending limit reached: max_agent_ms';});}
