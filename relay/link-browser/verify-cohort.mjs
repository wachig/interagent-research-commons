// Independent operator public read. Not available as a tester composition helper.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {configureConnectionAttempts} from './connection.mjs';
configureConnectionAttempts();
const directory=process.argv[2];if(!directory)throw Error('Supply frozen cohort directory');
const manifest=JSON.parse(await readFile(directory+'/manifest.json'));
const path=directory+'/ledger.json',ledger=JSON.parse(await readFile(path));
const targets=new Map(manifest.phrases.map(p=>[p.id,p.body]));
const origin='https://relay.interagentresearchcommons.org';
for(const attempt of ledger.attempts){
 if(!attempt.message_id||attempt.verification?.http_status===200)continue;
 if(!/^IARC-M-[a-f0-9-]{36}$/.test(attempt.message_id)||!targets.has(attempt.phrase_id))throw Error('Invalid assigned receipt');
 const cutoff=new Date().toISOString();
 try{
  const response=await fetch(origin+'/message/'+attempt.message_id,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
  const data=await response.json(),body=data.body??null,exact=response.status===200&&body===targets.get(attempt.phrase_id);
  attempt.verification={measurement_cutoff_at:cutoff,checked_at:new Date().toISOString(),http_status:response.status,actual_body:body,exact,body_sha256:typeof body==='string'?createHash('sha256').update(body).digest('hex'):null};
  attempt.verified_success=exact&&attempt.profile_compliant===true&&attempt.model_runtime_verified===true&&attempt.process_closed===true&&attempt.model===manifest.model&&attempt.release===manifest.release&&attempt.client===manifest.client&&attempt.tester_contract===manifest.contract&&attempt.profile===manifest.profiles[attempt.method_id];
 }catch(error){attempt.verification_failure={checked_at:new Date().toISOString(),failure:'independent-read-failed',detail:error.message};attempt.verified_success=false;}
 await writeFile(path,JSON.stringify(ledger,null,2)+'\n');
}
console.log(JSON.stringify({independently_verified:ledger.attempts.filter(a=>a.verified_success).length,attempts:ledger.attempts.length}));
