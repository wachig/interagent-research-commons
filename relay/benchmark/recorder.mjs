import {gunzipSync, brotliDecompressSync, inflateSync} from 'node:zlib';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {durableAppend,saveState,loadState,lockDirectory,diskGuard} from './storage.mjs';
import {beforeRequest,beforeActivation,serviceResult,accountRunTime} from './control.mjs';
import {verifyManifest} from './manifest.mjs';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const errorText = e => [e.name,e.code,e.message,...(e.errors||[]).map(x=>`${x.code||x.name}: ${x.message}`),e.cause?.message].filter(Boolean).join(' | ');
export const ORIGIN = 'https://relay.interagentresearchcommons.org';
export const ROOT = process.env.RELAY_BENCH_RUNS || path.join(import.meta.dirname,'.private-runs');
const extractor = path.join(import.meta.dirname,'extract.py');
export async function extract(html) {
  return await new Promise((resolve,reject)=>{
    const p=spawn('python3',[extractor],{stdio:['pipe','pipe','pipe']});let output='',errors='';
    const timer=setTimeout(()=>{p.kill('SIGTERM');reject(Error('Extraction timed out after 15 seconds; response remains recorded'));},15000);
    p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>errors+=b);
    p.on('error',e=>{clearTimeout(timer);reject(e);});
    p.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw Error('Extraction failed: '+errors.slice(0,300));resolve(JSON.parse(output));}catch(e){reject(e);}});
    p.stdin.on('error',()=>{});p.stdin.end(JSON.stringify({html}));
  });
}
export async function wireGet(url,{timeoutMs=30000,accept='text/html',local=false}={}) {
  const u=new URL(url);
  if(u.origin!==ORIGIN && !(local && u.hostname==='127.0.0.1' && u.protocol==='http:'))throw Error('Destination outside approved Relay blocked');
  const started=performance.now(),tmp=await mkdtemp('/private/tmp/relay-benchmark-http-');
  const headersFile=path.join(tmp,'headers'),bodyFile=path.join(tmp,'body');
  let result,transportError;
  try{
    try{result=await promisify(execFile)('curl',['--silent','--show-error','--max-time',String(timeoutMs/1000),'--max-filesize','4194304','--proto','=http,https','--dump-header',headersFile,'--output',bodyFile,'--write-out','%{http_code}','--header','Accept: '+accept,'--header','Accept-Encoding: gzip, br','--user-agent','IARC-Keyboard-Benchmark/2.0 (owner-authorized supplied-link client)',u.href],{timeout:timeoutMs+2000,maxBuffer:65536});}catch(e){transportError=e;result={stdout:e.stdout||''};}
    const raw=await readFile(bodyFile).catch(()=>Buffer.alloc(0)),headerText=await readFile(headersFile,'utf8').catch(()=>''),headers={};
    const block=headerText.trim().split(/\r?\n\r?\n/).at(-1)||'';
    for(const line of block.split(/\r?\n/).slice(1)){const colon=line.indexOf(':');if(colon>0)headers[line.slice(0,colon).toLowerCase()]=line.slice(colon+1).trim();}
    const facts={status:Number(result.stdout.trim())||Number(block.match(/^HTTP\/\S+ (\d+)/)?.[1])||null,headers,wire_body_bytes:raw.length,http_ms:performance.now()-started,partial:Boolean(transportError)};
    if(transportError){const e=Error('Transport failed: '+errorText(transportError));e.telemetry=facts;throw e;}
    try{const encoding=headers['content-encoding'];const bytes=encoding==='gzip'?gunzipSync(raw):encoding==='br'?brotliDecompressSync(raw):encoding==='deflate'?inflateSync(raw):raw;
      return {...facts,text:bytes.toString('utf8'),uncompressed_bytes:bytes.length};
    }catch(cause){const e=Error('Response decoding failed');e.telemetry={...facts,decoding_failed:true};e.cause=cause;throw e;}
  }finally{await rm(tmp,{recursive:true,force:true});}
}
export function isPublish(url){return /^\/publish$|\/publish\//u.test(new URL(url).pathname)||new URL(url).pathname==='/quick/one-shot';}
function safeRun(id){if(!/^[a-z0-9][a-z0-9_-]{0,90}$/.test(id))throw Error('Invalid run ID');return path.join(ROOT,id);}
export async function initRun(id,config) {
  const dir=safeRun(id);await diskGuard(ROOT);await mkdir(ROOT,{recursive:true,mode:0o700});await mkdir(dir,{mode:0o700});
  const state={id,config,created_at:new Date().toISOString(),started_ms:Date.now(),page:0,events:0,activations:0,http_requests:0,history:[],finished:false};
  await saveState(dir,state);return state;
}
export async function act(id,action,{local=false}={}) {
  const dir=safeRun(id);const unlock=await lockDirectory(dir);
  try {
    const state=await loadState(dir);
    if(state.finished)throw Error('Run already closed');
    const log=async event=>{event.seq=++state.events;event.at=new Date().toISOString();await durableAppend(path.join(dir,'events.jsonl'),event);};
    const save=()=>saveState(dir,state);
    if(state.config.controlled&&state.first_activation_ms)await accountRunTime(ROOT,id,Date.now()-state.first_activation_ms);
    await log({kind:'client-command',op:action.op,page:action.page||null,link:action.link||null,received_ms:Date.now()});await save();
    if(action.op==='view')return display(state);
    if(action.op==='finish'){
      if(action.outcome==='completed'){
        let record;
        // Older calibration pages remain verifiable without another network request.
        if(!state.current.pre_blocks){
          const body=await readFile(path.join(dir,`response-${state.http_requests}.body`),'utf8');
          if(body.trimStart().startsWith('<'))state.current.pre_blocks=(await extract(body)).pre_blocks;
        }
        for(const candidate of [state.current.text,...(state.current.pre_blocks||[])]){
          try{const parsed=JSON.parse(candidate);if(parsed.message_id&&typeof parsed.body==='string'){record=parsed;break;}}catch{}
        }
        if(!record)throw Error('Completion requires following the supplied public message record link first');
        if(!record.message_id||typeof record.body!=='string'||record.visibility!=='public')throw Error('Current page is not a public message record');
        if(!state.publication_receipt_id||record.message_id!==state.publication_receipt_id)throw Error('Public record does not match this run\'s publication receipt');
        const digest=createHash('sha256').update(record.body).digest('base64url');
        state.verification={message_id:record.message_id,conversation_id:record.conversation_id,body_exact:Buffer.from(record.body).equals(Buffer.from(state.config.expected_body)),reply_exact:(record.reply_to||null)===(state.config.reply_to||null),body_sha256:sha(record.body),recorded_digest:record.body_digest,digest_exact:record.body_digest===digest,designation_exact:(record.contributor_designation??null)===(state.config.expected_designation??null),conversation_exact:state.config.reply_to?Boolean(state.config.expected_conversation_id)&&record.conversation_id===state.config.expected_conversation_id:typeof record.conversation_id==='string'&&/^IARC-C-[a-f0-9-]+$/i.test(record.conversation_id)};
        if(!['body_exact','reply_exact','digest_exact','designation_exact','conversation_exact'].every(k=>state.verification[k]))action.outcome='published_mismatch';
      }
      state.finished=true;state.finished_ms=Date.now();
      if(state.config.controlled&&state.first_activation_ms)await accountRunTime(ROOT,id,state.finished_ms-state.first_activation_ms);state.outcome=action.outcome||'failed';state.note=action.note||'';
      await log({kind:'finish',outcome:state.outcome,note:state.note});await save();return {run:id,outcome:state.outcome,wall_ms:state.finished_ms-state.started_ms,activations:state.activations,http_requests:state.http_requests};
    }
    if(state.frozen_release_mismatch||state.release_unverified_stop||state.frozen_manifest_stop)throw Error('Frozen release stop is persistent; close this run and create a new cohort');
    if(state.config.manifest_dir){const manifest=await verifyManifest(state.config.manifest_dir);if(manifest.manifest_sha256!==state.config.manifest_sha256){state.frozen_manifest_stop=true;await save();throw Error('Frozen manifest changed: close the run');}}
    let url,kind='link',selected=null;
    if(action.op==='start'){
      if(state.page||state.http_requests)throw Error('Start already attempted; use retry');
      url=state.config.start_url||ORIGIN+'/';kind='initial-navigation';
    }else if(action.op==='follow'){
      if(Number(action.page)!==state.page)throw Error('Stale page selection rejected');
      selected=state.current?.links[Number(action.link)-1];if(!selected)throw Error('Link ID absent from supplied current page');
      url=selected.url;
    }else if(action.op==='retry'){
      if(!state.last_action)throw Error('No previous request to retry');url=state.last_action.url;selected=state.last_action.selected;kind='retry';
    }else if(action.op==='back'){
      const old=state.history[Number(action.page)-1];if(!old)throw Error('No previously visited page with that ID');url=old.url;kind='history-navigation';
    }else throw Error('Unknown operation');
    if(state.activations>=(state.config.activation_budget||300))throw Error('Declared activation budget reached; close as failed');
    if(state.first_activation_ms&&Date.now()-state.first_activation_ms>(state.config.wall_budget_ms||1200000))throw Error('Declared wall-time budget reached; close as failed');
    const guard=url=>{
    const u=new URL(url);
    if(u.origin!==ORIGIN&&!(local&&u.hostname==='127.0.0.1'&&u.protocol==='http:'))throw Error('External supplied link blocked');
    const prefixSharedAction=state.config.method_id==='prefix-link'&&/^\/predictive-keyboard\/html\/word-links\/(?:state|step|choose|key|review|publish|discard|undo|clear|edit|designation|exact|literal)\//.test(u.pathname)&&(u.searchParams.get('view')==='prefix'||/^\/predictive-keyboard\/html\/word-links\/(?:review|publish|edit)\//.test(u.pathname));
    if(state.config.method_href && (/^\/predictive-keyboard\//.test(u.pathname)||/^\/compose\//.test(u.pathname)||/^\/quick\//.test(u.pathname)) && !u.pathname.startsWith(state.config.method_href)&&!prefixSharedAction)throw Error('Changing assigned method or using a GET shortcut is outside this strict-link run');
    if(isPublish(url)&&action.intent!=='publish')throw Error('Publication requires explicit --intent publish after reviewing the exact draft');
    if(isPublish(url)&&!state.approved_publish_urls?.includes(url))throw Error('Publication blocked: this capability has no exact target/reply review witness in this run');
    };
    guard(url);
    const u=new URL(url);
    const previous=state.current?.url;
    if(state.config.controlled)await beforeActivation(ROOT);
    state.first_activation_ms??=Date.now();state.activations++;state.last_action={url,selected};
    await log({kind:'activation',operation:kind,url,link_label:selected?.label||selected?.text||null,explicit_publication_intent:action.intent==='publish',gap_since_last_response_ms:state.last_response_ms?Date.now()-state.last_response_ms:null});
    if(kind==='link'&&selected?.href.includes('#')&&previous&&new URL(previous).origin+new URL(previous).pathname+new URL(previous).search===u.origin+u.pathname+u.search){
      state.current.url=url;await log({kind:'fragment',url});await save();return display(state);
    }
    await save();
    let response;
    try{
      for(let redirects=0;redirects<8;redirects++){
        guard(url);
        if(state.config.controlled)await beforeRequest(ROOT,{activation:false,serviceRetries:state.service_retries||0});
        state.http_requests++;state.pending_request={url,number:state.http_requests,at:Date.now()};await save();
        try{response=await wireGet(url,{local,timeoutMs:state.config.transport_timeout_ms||30000});}
        catch(e){state.costs_incomplete=true;if(e.telemetry)await log({kind:'transport-error',url,...e.telemetry});state.failure_category='transport';state.service_retries=(state.service_retries||0)+1;if(state.config.controlled)await serviceResult(ROOT,{transport:true,run:id});throw e;}
        delete state.pending_request;
        if(response.status===429||response.status>=500){state.failure_category='service';state.service_retries=(state.service_retries||0)+1;if(state.config.controlled)await serviceResult(ROOT,{status:response.status,run:id});}
        else if(response.status>=400)state.failure_category='interface-http-error';
        await log({kind:'http',url,status:response.status,headers:response.headers,wire_body_bytes:response.wire_body_bytes,uncompressed_bytes:response.uncompressed_bytes,http_ms:response.http_ms,response_sha256:sha(response.text),received_at:Date.now()});
        await writeFile(path.join(dir,`response-${state.http_requests}.body`),response.text,{mode:0o600});
        const release=response.headers['x-relay-release'];
        if(state.config.release && !release){if(response.status<400)state.release_unverified_stop=true;await save();throw Error(response.status>=400 ? `Unverified service error HTTP ${response.status}: response recorded; retry the same action or return to a verified page` : 'Successful response lacks release header: stop run; response recorded');}
        if(state.config.release && release!==state.config.release){state.frozen_release_mismatch={expected:state.config.release,observed:release};await save();throw Error('Release changed: stop run; response recorded');}
        if(response.status>=300&&response.status<400&&response.headers.location){
          const next=new URL(response.headers.location,url).href;
          guard(next);
          await log({kind:'redirect',from:url,to:next});url=next;continue;
        }
        break;
      }
      if(response.status>=300&&response.status<400)throw Error('Redirect limit reached');
      if((isPublish(url)||isPublish(state.last_action.url))&&response.status>=200&&response.status<300){
        const receiptMatch=response.text.match(/Message ID:\s*<code>(IARC-M-[a-f0-9-]+)<\/code>/i)||response.text.match(/href="\/message\/(IARC-M-[a-f0-9-]+)">View public message/i);
        if(receiptMatch)state.publication_receipt_id=receiptMatch[1];
        else{try{state.publication_receipt_id=JSON.parse(response.text).message_id||null;}catch{}}
      }
      if(action.drop){await log({kind:'injected-response-loss',url});await save();return {run:id,response_lost:true,server_outcome:'unknown to tester; retry the original action',page:state.page};}
      const extractionBegan=performance.now();
      const parsed=(response.headers['content-type']||'').includes('text/html')?await extract(response.text):{title:'Machine-readable response',text:response.text,links:[],drafts:[]};
      parsed.url=url;parsed.links=parsed.links.map((l,i)=>({...l,id:i+1,url:new URL(l.href,parsed.base?new URL(parsed.base,url):url).href}));
      const reviewReply=response.text.match(/(?:Reply to|Replying to:)(?:<\/strong>)?\s*(?:<a\b[^>]*>)?<code>(IARC-M-[a-f0-9-]+)<\/code>/i)?.[1]||null;
      const exactReview=response.status>=200&&response.status<300&&/\/review\//.test(new URL(url).pathname)&&parsed.drafts?.some(d=>Buffer.from(d).equals(Buffer.from(state.config.expected_body||'')))&&reviewReply===(state.config.reply_to||null);
      if(exactReview){
        state.review_witness={url,at:new Date().toISOString(),arm_urls:parsed.links.filter(l=>/\/arm\//.test(new URL(l.url).pathname)).map(l=>l.url)};
        state.approved_publish_urls=parsed.links.filter(l=>isPublish(l.url)).map(l=>l.url);
        await log({kind:'exact-review-witness',page:state.page+1});
      }else if(state.review_witness?.arm_urls.includes(state.last_action.url)){
        state.approved_publish_urls=parsed.links.filter(l=>isPublish(l.url)).map(l=>l.url);
      }
      state.page++;state.current=parsed;state.history.push({page:state.page,url});state.last_response_ms=Date.now();state.last_status=response.status;
      await log({kind:'extraction',page:state.page,chars:parsed.text.length,utf8_bytes:Buffer.byteLength(parsed.text),tokens_o200k:parsed.extracted_tokens_o200k??null,tokenizer:parsed.tokenizer_version??null,links_presented:parsed.links.length,extraction_ms:performance.now()-extractionBegan});
      await save();return display(state);
    }catch(e){await log({kind:'error',message:errorText(e)});await save();throw e;}
  }finally{await unlock();}
}
function display(state){return {run:state.id,page:state.page,status:state.last_status,failure_category:state.failure_category||null,title:state.current?.title,drafts:state.current?.drafts||[],text:state.current?.text||'',notice:'Use supplied numeric links only. A [link ID] belongs to this page ID. No forms, JavaScript, edited URLs, or external vocabulary.'};}
