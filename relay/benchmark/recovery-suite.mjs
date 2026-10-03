// Owner-authorized live fault probes. Deterministic choices; not observed-agent scores.
import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {initRun,act,ROOT,ORIGIN} from './recorder.mjs';
const freeze=JSON.parse(await readFile('docs/relay-benchmark-2026-10-01/freeze.json'));
const registry=JSON.parse(await readFile('docs/relay-benchmark-2026-10-01/methods.json'));
const shorts={'chunk-word':'chunk','predictive-word':'predictive','prefix-link':'prefix','token-link':'token'};
const cases=['lost-add','lost-publish','branch','expired'];
const state=async id=>JSON.parse(await readFile(ROOT+'/'+id+'/state.json'));
async function choose(id,re,extra={}){
 const s=await state(id);const l=s.current.links.find(l=>re.test(l.label||l.text));
 if(!l)throw Error('No supplied link matching '+re);
 return act(id,{op:'follow',page:s.page,link:l.id,...extra});
}
async function annotate(id,facts){const s=await state(id);s.recovery_facts={...(s.recovery_facts||{}),...facts};await writeFile(ROOT+'/'+id+'/state.json',JSON.stringify(s,null,2)+'\n',{mode:0o600});}
async function run(method,fault){
 const id='recovery-'+shorts[method.id]+'-'+fault+'-'+(process.env.RELAY_RECOVERY_REV||'v2');
 let s;try{s=await state(id)}catch{}
 if(s?.finished){console.log(id+': already closed');return;}
 if(!s){
  await initRun(id,{benchmark:freeze.benchmark,release:freeze.release,method_id:method.id,method_href:method.href,task_id:'recovery-'+fault,scored:false,expected_body:'I',reply_to:null,start_url:ORIGIN+'/',activation_budget:100,wall_budget_ms:1200000,profile:'deterministic-engineering-recovery',model:null});
  await act(id,{op:'start'});
  const home=await state(id);const link=home.current.links.find(l=>l.text===method.title);if(!link)throw Error('Assigned method absent');
  await act(id,{op:'follow',page:home.page,link:link.id});
 }
 try{
  s=await state(id);
  if(s.last_status>=400)throw Error('Service admission response HTTP '+s.last_status+': '+s.current.title);
  // The two earlier manual probes can resume from their existing observed pages.
  if(method.id==='token-link' && s.current.links.some(l=>l.text==='Start blank draft'))await choose(id,/^Start blank draft$/);
  s=await state(id);
  if(!s.current.drafts?.includes('I')){
   if(method.id==='predictive-word' && !s.current.links.some(l=>/^(?:I|Add I)$/.test(l.label||l.text)))await choose(id,/^Turn shift on$/);
   await choose(id,/^(?:Add (?:top |predicted |next )?word I|Add I to the draft|Add I|Add Uppercase i|I)$/,{...(fault==='lost-add'?{drop:true}:{})});
   if(fault==='lost-add')await act(id,{op:'retry'});
  }
  s=await state(id);if(!s.current.drafts.includes('I'))throw Error('Exact I draft absent after addition');
  await annotate(id,{addition_exact:true,retry_addition:fault==='lost-add'});
  if(fault==='branch'){
   const earlier=s.page;await choose(id,/^(?:Add \.|Add \. to the draft|\.)$/);
   const wrong=await state(id);await annotate(id,{branch_draft:wrong.current.drafts,branch_differed:!wrong.current.drafts.includes('I')});
   await act(id,{op:'back',page:earlier});
   if(!(await state(id)).current.drafts.includes('I'))throw Error('Returning to earlier branch lost original draft');
  }
  const compositionPage=(await state(id)).page;
  await choose(id,/^Review (?:message|this exact branch)$/);
  if(method.id==='token-link')await choose(id,/^Arm publication$/);
  if(fault==='expired'){
   s=await state(id);const html=await readFile(ROOT+'/'+id+'/response-'+s.http_requests+'.body','utf8');
   const expiry=html.match(/<time datetime="([^"]+)"/);if(!expiry)throw Error('Review has no supplied expiry');
   const wait=Math.max(0,Date.parse(expiry[1])-Date.now()+1500);
   await annotate(id,{expiry:expiry[1],wait_ms:wait});console.log(id+': waiting for declared expiry '+expiry[1]);
   // Process remains asynchronous; orchestrator polls bounded output and keeps working.
   await new Promise(r=>setTimeout(r,wait));
  }
  await choose(id,/^Publish (?:this )?message publicly$/,{intent:'publish',...(fault==='lost-publish'?{drop:true}:{})});
  if(fault==='lost-publish')await act(id,{op:'retry',intent:'publish'});
  s=await state(id);
  if(fault==='expired'){
   await annotate(id,{expired_status:s.last_status,publication_receipt_present:!!s.publication_receipt_id,no_publication_observed:!s.publication_receipt_id&&s.last_status>=400});
   if(s.publication_receipt_id)throw Error('Expired capability unexpectedly published');
   if(process.env.RELAY_RECOVERY_CONTINUE==='1'){
    await act(id,{op:'back',page:compositionPage});
    if(!(await state(id)).current.drafts.includes('I'))throw Error('Expired review recovery lost original draft');
    await choose(id,/^Review (?:message|this exact branch)$/);
    if(method.id==='token-link')await choose(id,/^Arm publication$/);
    await choose(id,/^Publish (?:this )?message publicly$/,{intent:'publish'});
    await choose(id,/^(?:Open|View) public message(?: IARC-M-[a-f0-9-]+)?$/);
    if((await state(id)).current.links.some(l=>l.text==='Machine-readable message record'))await choose(id,/^Machine-readable message record$/);
    await annotate(id,{recovered_expired_review_without_retyping:true});
    await act(id,{op:'finish',outcome:'completed',note:'Expired capability did not publish; returned to existing exact draft, reviewed afresh and verified intentional publication.'});
   }else await act(id,{op:'finish',outcome:'expected_no_publication',note:'Expired publication capability rejected; no publication receipt observed. Recovery continuation is a separate question.'});
  }else{
   await choose(id,/^(?:Open|View) public message(?: IARC-M-[a-f0-9-]+)?$/);
   s=await state(id);
   if(s.current.links.some(l=>l.text==='Machine-readable message record'))await choose(id,/^Machine-readable message record$/);
   await act(id,{op:'finish',outcome:'completed',note:'Separate deterministic '+fault+' recovery probe; target I.'});
  }
  console.log(id+': '+(await state(id)).outcome);
 }catch(e){await annotate(id,{probe_error:e.message});await act(id,{op:'finish',outcome:'failed',note:'Recovery probe: '+e.message});console.log(id+': failed '+e.message);}
}
const mode=process.argv[2]||'fast';
for(const fault of cases.filter(x=>mode==='expired'?x==='expired':mode==='branch'?x==='branch':x!=='expired')){
 const selected=freeze.plan.methods.filter(m=>!process.argv[3]||m===process.argv[3]);
 if(mode==='expired')await Promise.all(selected.map(id=>run(registry.methods.find(m=>m.id===id),fault)));
 else for(const methodId of selected)await run(registry.methods.find(m=>m.id===methodId),fault);
}
