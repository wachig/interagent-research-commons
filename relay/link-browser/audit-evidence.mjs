// Read-only evidence audit. Never fetches, publishes, or repairs certificates.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function auditEvidence(ledger,manifest) {
  const targets=new Map(manifest.phrases.map(p=>[p.id,p.body]));
  const successes=ledger.attempts.filter(a=>a.verified_success);
  const problems=[],cells=new Set(),messages=new Set(),cohorts=new Map();
  for(const a of successes){
    const cell=[a.method_id,a.phrase_id,a.repetition].join('/');
    if(!manifest.methods.includes(a.method_id)||!targets.has(a.phrase_id)||a.model!==manifest.model||a.profile_compliant!==true||!a.verification?.exact||a.verification.actual_body!==targets.get(a.phrase_id)||!a.message_id)problems.push({attempt:a.attempt_id,problem:'invalid-certificate'});
    if(cells.has(cell)||messages.has(a.message_id))problems.push({attempt:a.attempt_id,problem:'duplicate-success'});
    cells.add(cell);messages.add(a.message_id);
  }
  for(const a of ledger.attempts){
    const cohort=[a.release,a.client,a.tester_contract||'unversioned'].join('/');
    const entry=cohorts.get(cohort)||{release:a.release,client:a.client,contract:a.tester_contract||'unversioned',attempts:0,successes:0};
    entry.attempts++;if(a.verified_success)entry.successes++;cohorts.set(cohort,entry);
  }
  const failures=ledger.attempts.filter(a=>!a.verified_success&&a.outcome!=='in-progress');
  const approvalFailures=failures.filter(a=>/approval/i.test(a.outcome+' '+(a.failure_category||'')));
  const legacyFull=a=>!a.native_metrics&&Number.isFinite(a.native_request_count??a.spent_run_requests)&&Number.isFinite(a.native_response_bytes)&&typeof a.native_metrics_scope==='string';
  const legacyPartial=a=>!a.native_metrics&&!legacyFull(a)&&Number.isFinite(a.native_observed_requests);
  const pending=ledger.attempts.filter(a=>!a.native_metrics&&!legacyFull(a)&&!legacyPartial(a));
  const incomplete=ledger.attempts.filter(a=>a.native_metrics&&(a.native_metrics.truncated||a.native_metrics.budget_possible_gap||a.native_metrics.export_complete===false));
  if(ledger.verified_successes!==successes.length)problems.push({problem:'saved-success-count-mismatch'});
  return {verified:successes.length,required:manifest.total_required_successes,attempts:ledger.attempts.length,certificate_problems:problems,cohorts:[...cohorts.values()],failures:{total:failures.length,approval_or_approval_output:approvalFailures.length,other_or_unclassified:failures.length-approvalFailures.length},accounting:{native_metrics_pending:pending.map(a=>a.attempt_id),legacy_flat_metrics:ledger.attempts.filter(legacyFull).length,partial_server_observations:ledger.attempts.filter(legacyPartial).map(a=>a.attempt_id),known_incomplete_native_metrics:incomplete.map(a=>a.attempt_id),scope:'Native metrics are associated server requests, not all client commands, pre-session discovery, or network attempts without a logged server response. Legacy fields retain their original stated scope. Missing metrics never mean zero cost.'},running:ledger.attempts.filter(a=>a.outcome==='in-progress').map(a=>a.attempt_id)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const directory=new URL('../../docs/relay-luna-completion-2026-10-02/',import.meta.url);
  const report=auditEvidence(JSON.parse(await readFile(new URL('ledger.json',directory))),JSON.parse(await readFile(new URL('manifest.json',directory))));
  console.log(JSON.stringify(report,null,2));if(report.certificate_problems.length)process.exitCode=1;
}
