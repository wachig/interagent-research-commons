// Reconcile fault retries from already recorded responses, without network traffic.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {ROOT,extract,sha} from './recorder.mjs';
let audited=0;
for(const name of await readdir(ROOT)){
 let s;try{s=JSON.parse(await readFile(ROOT+'/'+name+'/state.json'))}catch{continue;}
 if(s.config.profile!=='deterministic-engineering-recovery')continue;
 const events=(await readFile(ROOT+'/'+name+'/events.jsonl','utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
 const dropped=events.find(e=>e.kind==='injected-response-loss');if(!dropped)continue;
 const http=events.filter(e=>e.kind==='http');const before=http.filter(e=>e.seq<dropped.seq).at(-1);
 const retry=events.find(e=>e.kind==='activation'&&e.operation==='retry'&&e.seq>dropped.seq);
 const after=retry&&http.find(e=>e.seq>retry.seq);
 if(!before||!after)continue;
 const a=await extract(await readFile(ROOT+'/'+name+'/response-'+(http.indexOf(before)+1)+'.body','utf8'));
 const b=await extract(await readFile(ROOT+'/'+name+'/response-'+(http.indexOf(after)+1)+'.body','utf8'));
 s.recovery_facts||={};
 if(s.config.task_id.includes('lost-add')){
  const witness=p=>p.links.find(l=>/^Review (?:message|this exact branch)$/.test(l.text))?.href;
  s.recovery_facts.retry_addition_same_review_link=!!witness(a)&&witness(a)===witness(b);
  s.recovery_facts.lost_addition_draft_exact=a.drafts.includes(s.config.expected_body);
  s.recovery_facts.retried_addition_draft_exact=b.drafts.includes(s.config.expected_body);
 }else{
  const receipt=p=>p.text.match(/IARC-M-[a-f0-9-]+/)?.[0];
  s.recovery_facts.lost_publication_receipt_id=receipt(a)||null;
  s.recovery_facts.retried_publication_receipt_id=receipt(b)||null;
  s.recovery_facts.retry_publication_same_receipt=!!receipt(a)&&receipt(a)===receipt(b);
 }
 await writeFile(ROOT+'/'+name+'/state.json',JSON.stringify(s,null,2)+'\n',{mode:0o600});audited++;
}
console.log(JSON.stringify({audited,network_requests:0}));
