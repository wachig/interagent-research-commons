// Dispatch checklist only. Does not execute agents, score reruns, or make HTTP requests.
import {readFile,readdir} from 'node:fs/promises';
import {ROOT} from './recorder.mjs';
const plan=JSON.parse(await readFile(new URL('./plan.json',import.meta.url)));
const names=new Set(await readdir(ROOT));
const short={'chunk-word':'chunk','predictive-word':'predictive','prefix-link':'prefix','token-link':'token'};
const rows=[];
for(let i=0;i<plan.targets.length;i++)for(let j=0;j<plan.methods.length;j++){
 const method=plan.methods[(i+j)%plan.methods.length],task=plan.targets[i],run=(plan.run_prefix||'')+task.id.toLowerCase()+'-'+short[method];
 let state;try{state=JSON.parse(await readFile(ROOT+'/'+run+'/state.json'));}catch{}
 rows.push({run,method,task:task.id,body:task.body,reply:!!task.reply,state:!state?'not_prepared':state.finished?state.outcome:state.page?'in_progress':'prepared_not_started',activations:state?.activations||0});
}
console.log(JSON.stringify({counts:rows.reduce((a,r)=>(a[r.state]=(a[r.state]||0)+1,a),{}),next:rows.find(r=>r.state==='not_prepared'),runs:rows},null,2));
