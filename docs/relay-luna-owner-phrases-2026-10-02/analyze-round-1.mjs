import {readFile,writeFile} from 'node:fs/promises';
import {loadManifest} from '../../relay/benchmark/manifest.mjs';
import {comparisonFor} from '../../relay/benchmark/compare.mjs';
const dir=import.meta.dirname;
const report=JSON.parse(await readFile(dir+'/runs.json'));
const freeze=await loadManifest(dir);
const ids=new Set(freeze.plan.pilot_target_ids);
const first={...freeze,plan:{...freeze.plan,targets:freeze.plan.targets.filter(t=>ids.has(t.id))}};
const scoped={...report,runs:report.runs.filter(r=>ids.has(r.task))};
const comparison=comparisonFor(scoped,first);
comparison.scope='Required first round: P01-P10 only; analytical view of unchanged frozen manifest';
comparison.full_frozen_plan_planned=140;
comparison.optional_second_round_executed=report.runs.some(r=>!ids.has(r.task));
const sensitivity={...first,plan:{...first.plan,targets:first.plan.targets.filter(t=>t.id!=='P01')}};
comparison.prompt_sensitivity_without_P01=comparisonFor({...scoped,runs:scoped.runs.filter(r=>r.task!=='P01')},sensitivity);
const median=xs=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
for(const m of comparison.methods){
 const rs=scoped.runs.filter(r=>r.method===m.method&&r.finished),ok=rs.filter(r=>r.outcome==='completed');
 m.median_completed_http_requests=median(ok.map(r=>r.http_attempts));
 m.median_completed_wire_bytes=median(ok.map(r=>r.wire_body_bytes));
 m.median_completed_extracted_tokens=median(ok.map(r=>r.extracted_tokens_o200k));
 m.total_recorded_client_errors=rs.reduce((n,r)=>n+r.recorded_client_errors,0);
 m.total_blocked_navigation_commands=rs.reduce((n,r)=>n+r.blocked_navigation_commands,0);
}
comparison.character_groups=[];
for(const [group,predicate] of [['ASCII-only',t=>/^[\x00-\x7f]*$/.test(t.body)],['curly-apostrophe-U2019',t=>t.body.includes('’')]]){
 const targets=first.plan.targets.filter(predicate),taskIds=new Set(targets.map(t=>t.id));
 comparison.character_groups.push({group,target_ids:[...taskIds],...comparisonFor({...scoped,runs:scoped.runs.filter(r=>taskIds.has(r.task))},{...first,plan:{...first.plan,targets}})});
}
const consistentTargets=first.plan.targets.filter(t=>!['P01','P02'].includes(t.id));
const consistentIds=new Set(consistentTargets.map(t=>t.id));
comparison.P03_P10_consistent_prompt_view={scope:'Analytical sensitivity view: excludes early P01 prompt variants and P02 generic reminder; Token permission-context addition remains explicitly disclosed.',...comparisonFor({...scoped,runs:scoped.runs.filter(r=>consistentIds.has(r.task))},{...first,plan:{...first.plan,targets:consistentTargets}})};
await writeFile(dir+'/round-1-comparison.json',JSON.stringify(comparison,null,2)+'\n');
console.log(JSON.stringify({closed:comparison.closed,planned:comparison.planned,complete:comparison.complete,methods:comparison.methods.map(m=>({method:m.method,closed:m.closed,completed:m.exact_completed,median_activations:m.median_completed_activations,spent:m.spent_activations_all_attempts}))}));
