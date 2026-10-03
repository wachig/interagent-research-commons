// Read-only frozen-cohort reporting. No target-aware advice reaches a tester.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function cohortReport(manifest,ledger) {
 const targets=new Map(manifest.phrases.map(p=>[p.id,p.body]));const messages=new Set();const issues=[];
 for(const a of ledger.attempts){
  const profile=manifest.profiles[a.method_id];
  if(!profile||!targets.has(a.phrase_id)||a.release!==manifest.release||a.client!==manifest.client||a.tester_contract!==manifest.contract||a.profile!==profile||a.model!==manifest.model)issues.push({attempt:a.attempt_id,problem:'condition-mismatch'});
  if(a.verified_success){
   const v=a.verification,target=targets.get(a.phrase_id);
   if(a.profile_compliant!==true||a.model_runtime_verified!==true||a.process_closed!==true||v?.http_status!==200||v.actual_body!==target||v.body_sha256!==createHash('sha256').update(target??'').digest('hex')||!v.measurement_cutoff_at||!a.message_id||messages.has(a.message_id))issues.push({attempt:a.attempt_id,problem:'invalid-or-duplicate-independent-certificate'});
   messages.add(a.message_id);
  }
 }
 const completeNative=a=>a.native_metrics?.export_complete===true&&!a.native_metrics.truncated&&!a.native_metrics.budget_possible_gap&&Number.isFinite(a.native_metrics.request_count);
 const methods=manifest.methods.map(method=>{
  const attempts=ledger.attempts.filter(a=>a.method_id===method),closed=attempts.filter(a=>a.process_closed);
  const first=manifest.phrases.map(p=>attempts.find(a=>a.phrase_id===p.id)).filter(Boolean);
  const costs=attempts.filter(completeNative);const missing=attempts.filter(a=>!completeNative(a)).map(a=>a.attempt_id);
  const known=costs.reduce((sum,a)=>sum+a.native_metrics.request_count,0);
  return {method,profile:manifest.profiles[method],attempts:attempts.length,closed_attempts:closed.length,first_attempt_successes:first.filter(a=>a.verified_success).length,first_attempt_cells:first.length,eventual_success_cells:new Set(attempts.filter(a=>a.verified_success).map(a=>a.phrase_id)).size,failed_attempts:closed.filter(a=>!a.verified_success).length,failures_by_category:closed.filter(a=>!a.verified_success).reduce((d,a)=>{const c=a.failure_category||'unclassified';d[c]=(d[c]||0)+1;return d;},{}),associated_native_requests_all_attempts:missing.length?null:known,known_associated_native_requests:known,unknown_or_incomplete_cost_attempts:missing,correction_reports:attempts.flatMap(a=>a.corrections||[]).length};
 });
 return {release:manifest.release,client:manifest.client,contract:manifest.contract,issues,methods,limitations:['A small diagnostic sample, not a general speed ranking or causal estimate.','Prefix uses supplied dropdowns; capability differences must remain explicit.','Native request totals exclude independent verification and may omit failed-fetch server work. Client HTTP attempts and UI activations remain separate.','Elapsed time includes client/model/tool/scheduling work. Input gaps are not pure model thinking.','Missing/incomplete telemetry produces an unknown total, never zero.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const dir=process.argv[2];if(!dir)throw Error('Supply a cohort directory');
 const report=cohortReport(JSON.parse(await readFile(dir+'/manifest.json')),JSON.parse(await readFile(dir+'/ledger.json')));console.log(JSON.stringify(report,null,2));if(report.issues.length)process.exitCode=1;
}
