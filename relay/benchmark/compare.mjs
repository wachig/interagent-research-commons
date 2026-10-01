import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {selectCohort,loadManifest} from './manifest.mjs';
import {atomicJson} from './storage.mjs';
const verified=r=>r.outcome==='completed'&&['body_exact','reply_exact','digest_exact','conversation_exact','designation_exact'].every(k=>r.verification?.[k]===true);
const median=xs=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
export function comparisonFor(report,freeze){
 const {rows:scored,slots,missing}=selectCohort(report,freeze),finished=scored.filter(r=>r.finished),plan=freeze.plan;
 const methods=plan.methods.map(method=>{
  const rs=scored.filter(r=>r.method===method),complete=rs.filter(verified),costsComplete=rs.every(r=>r.costs_complete!==false&&!r.recovery_provenance);
  return {method,attempts:rs.length,closed:rs.filter(r=>r.finished).length,exact_completed:complete.length,failed:rs.filter(r=>r.finished&&r.outcome!=='infrastructure_interruption'&&!verified(r)).length,interrupted:rs.filter(r=>r.outcome==='infrastructure_interruption').length,costs_complete:costsComplete,spent_totals_are_lower_bounds:!costsComplete,completion_fraction_closed:rs.filter(r=>r.finished).length?complete.length/rs.filter(r=>r.finished).length:null,failure_categories:Object.fromEntries([...new Set(rs.filter(r=>!verified(r)).map(r=>r.failure_category||r.failure_adjudication?.category||'unclassified'))].map(k=>[k,rs.filter(r=>!verified(r)&&(r.failure_category||r.failure_adjudication?.category||'unclassified')===k).length])),median_completed_activations:median(complete.map(r=>r.activations)),median_completed_entry_to_finish_ms:median(complete.map(r=>r.entry_to_finish_ms)),spent_activations_all_attempts:rs.reduce((n,r)=>n+(r.activations||0),0),spent_http_all_attempts:rs.reduce((n,r)=>n+(r.http_attempts||0),0)};
 });
 const pairs=[];for(let i=0;i<plan.methods.length;i++)for(let j=i+1;j<plan.methods.length;j++){
  const a=plan.methods[i],b=plan.methods[j],cases=plan.targets.map(t=>{
   const x=scored.find(r=>r.task===t.id&&r.method===a&&verified(r)),y=scored.find(r=>r.task===t.id&&r.method===b&&verified(r));
   return x&&y?{task:t.id,class:t.class,a_activations:x.activations,b_activations:y.activations,activation_delta_a_minus_b:x.activations-y.activations,a_ms:x.entry_to_finish_ms,b_ms:y.entry_to_finish_ms,a_wire_bytes:x.wire_body_bytes,b_wire_bytes:y.wire_body_bytes,a_extracted_tokens:x.extracted_tokens_o200k,b_extracted_tokens:y.extracted_tokens_o200k}:null;
  }).filter(Boolean);pairs.push({a,b,completed_pairs:cases.length,cases});
 }
 return {benchmark:freeze.benchmark,cohort:freeze.cohort,manifest_sha256:freeze.manifest_sha256,generated_at:new Date().toISOString(),attempted_all_planned_slots:missing.length===0,all_attempts_closed:missing.length===0&&finished.length===slots.length,missing_slots:missing,not_attempted:missing.length,planned:slots.length,closed:finished.length,complete:missing.length===0&&finished.length===slots.length&&!finished.some(r=>r.outcome==='infrastructure_interruption'),methods,pairs,limitations:report.limitations};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const dir=process.argv[2];if(!dir)throw Error('Required cohort directory; historical results are never overwritten by default');
 const freeze=await loadManifest(dir);if(freeze.schema_version!==2)throw Error('Historical cohort is read-only');
 const report=JSON.parse(await readFile(dir+'/runs.json'));const comparison=comparisonFor(report,freeze);
 await atomicJson(dir+'/comparison.json',comparison);console.log(JSON.stringify({closed:comparison.closed,planned:comparison.planned,missing:comparison.missing_slots}));
}
