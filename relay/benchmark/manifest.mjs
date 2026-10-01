import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const REPO=path.resolve(import.meta.dirname,'../..');
export function runtimeFingerprint(){
 const python=execFileSync('python3',['--version'],{encoding:'utf8'}).trim();
 const dependencies=JSON.parse(execFileSync('python3',['-c',"import sys,os,json,importlib.metadata as m; sys.path.insert(0,os.environ.get('RELAY_BENCH_TOKENIZER_PATH',os.path.join(os.getcwd(),'relay/benchmark/.private-deps'))); print(json.dumps({k:m.version(k) for k in ['tiktoken','regex','requests','charset-normalizer','idna','urllib3','certifi']}))"],{cwd:REPO,encoding:'utf8'}));
 return {node:process.version,python,dependencies};
}
export async function verifyManifest(dir,{runtime=true}={}){
 const freeze=JSON.parse(await readFile(path.join(dir,'freeze.json'),'utf8'));
 if(freeze.schema_version!==2)throw Error('Historical manifest is read-only; create a schema-2 cohort');
 for(const [file,expected] of Object.entries(freeze.sources))if(hash(await readFile(path.join(REPO,file)))!==expected)throw Error('Frozen source differs: '+file);
 for(const [route,record] of Object.entries(freeze.resources))if(hash(await readFile(path.join(dir,route.slice(1).replaceAll('/','_'))))!==record.sha256)throw Error('Frozen resource differs: '+route);
 if(hash(JSON.stringify(freeze.plan))!==freeze.plan_sha256)throw Error('Frozen plan differs');
 if(runtime&&JSON.stringify(runtimeFingerprint())!==JSON.stringify(freeze.runtime))throw Error('Frozen runtime/dependencies differ');
 return {...freeze,manifest_sha256:hash(JSON.stringify(freeze))};
}
export function plannedSlots(plan){
 if(new Set(plan.methods).size!==plan.methods.length||new Set(plan.targets.map(t=>t.id)).size!==plan.targets.length)throw Error('Duplicate planned method/target');
 return plan.methods.flatMap(method=>plan.targets.map(t=>method+'::'+t.id));
}
export function selectCohort(report,freeze){
 const rows=report.runs.filter(r=>r.scored&&r.benchmark===freeze.benchmark&&r.cohort===freeze.cohort);
 const slots=plannedSlots(freeze.plan),seen=new Set();
 for(const r of rows){const k=r.method+'::'+r.task;if(!slots.includes(k))throw Error('Unplanned scored slot: '+k);if(seen.has(k))throw Error('Duplicate scored slot: '+k);seen.add(k);
  if(freeze.schema_version===2&&(r.manifest_sha256!==freeze.manifest_sha256||r.release!==freeze.release))throw Error('Mixed frozen conditions: '+r.run);
  const target=freeze.plan.targets.find(t=>t.id===r.task);if(freeze.schema_version===2&&typeof target.body==='string'&&(r.target_sha256!==hash(target.body)||r.profile!==freeze.plan.profile||r.model!==freeze.plan.model||r.reasoning_effort!==freeze.plan.reasoning_effort||target.reply&&r.reply_to!==freeze.reply_parent?.message_id))throw Error('Target/client conditions differ: '+r.run);
 }
 return {rows,slots,missing:slots.filter(k=>!seen.has(k))};
}
export async function loadManifest(dir){const f=JSON.parse(await readFile(path.join(dir,'freeze.json')));return {...f,manifest_sha256:hash(JSON.stringify(f))};}
