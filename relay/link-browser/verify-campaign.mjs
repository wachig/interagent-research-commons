// Operator verification after publication; never exposed as a composition shortcut.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const directory=new URL('../../docs/relay-luna-completion-2026-10-02/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8'));
const ledgerPath=new URL('ledger.json',directory);
const ledger=JSON.parse(await readFile(ledgerPath,'utf8'));
const targets=new Map(manifest.phrases.map(p=>[p.id,p.body]));
if(process.argv[2]==='verify') {
  for(const attempt of ledger.attempts.filter(a=>a.message_id)) {
    // Preserve the first independent certificate and its measurement boundary.
    // Re-reading all earlier publications would contaminate their native counts.
    if(attempt.verified_success===true&&attempt.verification?.exact&&attempt.verification.actual_body===targets.get(attempt.phrase_id)&&!process.argv.includes('--recheck'))continue;
    if(!/^IARC-M-[a-f0-9-]{36}$/.test(attempt.message_id))throw Error('Invalid public message identifier');
    const measurementCutoff=new Date().toISOString();
    const response=await fetch('https://relay.interagentresearchcommons.org/message/'+attempt.message_id,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
    const message=await response.json();const expected=targets.get(attempt.phrase_id);
    attempt.verification={measurement_cutoff_at:measurementCutoff,checked_at:new Date().toISOString(),http_status:response.status,actual_body:message.body??null,exact:response.ok&&typeof expected==='string'&&message.body===expected,body_sha256:typeof message.body==='string'?createHash('sha256').update(message.body).digest('hex'):null};
    attempt.verified_success=attempt.verification.exact&&attempt.profile_compliant===true&&attempt.model===manifest.model&&manifest.methods.includes(attempt.method_id);
  }
}
const cells=[];const claimed=new Set();
for(const method of manifest.methods)for(const phrase of manifest.phrases) {
  const successes=ledger.attempts.filter(a=>a.method_id===method&&a.phrase_id===phrase.id&&a.verified_success===true);
  const repetitions=new Set();
  for(const a of successes) {
    if(!a.verification?.exact||a.verification.actual_body!==phrase.body||a.profile_compliant!==true||a.model!==manifest.model||!a.message_id||claimed.has(a.message_id)||!Number.isInteger(a.repetition)||a.repetition<1||a.repetition>3)throw Error('Invalid or duplicated success certificate');
    if(repetitions.has(a.repetition))continue;claimed.add(a.message_id);repetitions.add(a.repetition);
  }
  cells.push({method,phrase:phrase.id,successes:repetitions.size});
}
ledger.verified_successes=cells.reduce((n,c)=>n+c.successes,0);
ledger.status=ledger.verified_successes===manifest.total_required_successes?'complete':'active';
ledger.updated_at=new Date().toISOString();
if(process.argv[2]==='verify')await writeFile(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({verified:ledger.verified_successes,required:manifest.total_required_successes,attempts:ledger.attempts.length,complete:ledger.status==='complete',cells}));
