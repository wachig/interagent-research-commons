// New-cohort checklist only: no agents or upstream requests.
import {readFile} from 'node:fs/promises';
import {ROOT} from './recorder.mjs';
import {loadManifest} from './manifest.mjs';
import {loadState} from './storage.mjs';
const dir=process.argv[2];if(!dir)throw Error('Required cohort directory');const f=await loadManifest(dir);
if(f.schema_version!==2)throw Error('Historical cohort is read-only');
let saved=[];try{saved=JSON.parse(await readFile(dir+'/runs.json')).runs;}catch{}
const rows=[];
for(let i=0;i<f.plan.targets.length;i++)for(let j=0;j<f.plan.methods.length;j++){
 const method=f.plan.methods[(i+j)%f.plan.methods.length],task=f.plan.targets[i],run=f.plan.run_prefix+task.id.toLowerCase()+'-'+method;
 let state=saved.find(r=>r.run===run);try{state=await loadState(ROOT+'/'+run);}catch{}
 rows.push({run,method,task:task.id,body:task.body,reply:!!task.reply,stage:f.plan.pilot_target_ids.includes(task.id)?'small-pilot':'expanded',state:!state?'not_prepared':state.finished?state.outcome:state.page?'in_progress':'prepared_not_started',activations:state?.activations||0});
}
console.log(JSON.stringify({cohort:f.cohort,counts:rows.reduce((a,r)=>(a[r.state]=(a[r.state]||0)+1,a),{}),runs:rows},null,2));
