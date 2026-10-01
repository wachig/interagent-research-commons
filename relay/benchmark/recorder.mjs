import {gunzipSync, brotliDecompressSync, inflateSync} from 'node:zlib';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,writeFile,appendFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const errorText = e => [e.name,e.code,e.message,...(e.errors||[]).map(x=>`${x.code||x.name}: ${x.message}`),e.cause?.message].filter(Boolean).join(' | ');
export const ORIGIN = 'https://relay.interagentresearchcommons.org';
export const ROOT = process.env.RELAY_BENCH_RUNS || '/private/tmp/relay-benchmark-runs';
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
  const started=performance.now();
  const tmp=await mkdtemp('/private/tmp/relay-benchmark-http-');
  try{
    const headersFile=path.join(tmp,'headers'),bodyFile=path.join(tmp,'body');
    const {stdout}=await promisify(execFile)('curl',['--silent','--show-error','--max-time',String(timeoutMs/1000),'--max-filesize','4194304','--proto','=http,https','--dump-header',headersFile,'--output',bodyFile,'--write-out','%{http_code}','--header','Accept: '+accept,'--header','Accept-Encoding: gzip, br','--user-agent','IARC-Keyboard-Benchmark/1.0 (owner-authorized supplied-link client)',u.href],{timeout:timeoutMs+2000,maxBuffer:65536});
    const raw=await readFile(bodyFile),headerText=await readFile(headersFile,'utf8');
    const headerBlock=headerText.trim().split(/\r?\n\r?\n/).at(-1);
    const headers={};for(const line of headerBlock.split(/\r?\n/).slice(1)){const colon=line.indexOf(':');if(colon>0)headers[line.slice(0,colon).toLowerCase()]=line.slice(colon+1).trim();}
    const encoding=headers['content-encoding'];
    const bytes=encoding==='gzip'?gunzipSync(raw):encoding==='br'?brotliDecompressSync(raw):encoding==='deflate'?inflateSync(raw):raw;
    return {status:Number(stdout.trim()),headers,text:bytes.toString('utf8'),wire_body_bytes:raw.length,uncompressed_bytes:bytes.length,http_ms:performance.now()-started};
  }finally{await rm(tmp,{recursive:true,force:true});}
}
export function isPublish(url){return /^\/publish$|\/publish\//u.test(new URL(url).pathname)||new URL(url).pathname==='/quick/one-shot';}
function safeRun(id){if(!/^[a-z0-9][a-z0-9_-]{0,90}$/.test(id))throw Error('Invalid run ID');return path.join(ROOT,id);}
async function jsonFile(file,value){await writeFile(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});}
export async function initRun(id,config) {
  const dir=safeRun(id);await mkdir(ROOT,{recursive:true,mode:0o700});await mkdir(dir,{mode:0o700});
  const state={id,config,created_at:new Date().toISOString(),started_ms:Date.now(),page:0,events:0,activations:0,http_requests:0,history:[],finished:false};
  await jsonFile(path.join(dir,'state.json'),state);return state;
}
export async function act(id,action,{local=false}={}) {
  const dir=safeRun(id),lock=path.join(dir,'.lock');await mkdir(lock);
  try {
    const state=JSON.parse(await readFile(path.join(dir,'state.json'),'utf8'));
    if(state.finished)throw Error('Run already closed');
    const log=async event=>{event.seq=++state.events;event.at=new Date().toISOString();await appendFile(path.join(dir,'events.jsonl'),JSON.stringify(event)+'\n',{mode:0o600});};
    const save=()=>jsonFile(path.join(dir,'state.json'),state);
    await log({kind:'client-command',op:action.op,page:action.page||null,link:action.link||null});await save();
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
        state.verification={message_id:record.message_id,conversation_id:record.conversation_id,body_exact:Buffer.from(record.body).equals(Buffer.from(state.config.expected_body)),reply_exact:(record.reply_to||null)===(state.config.reply_to||null),body_sha256:sha(record.body),recorded_digest:record.body_digest,digest_exact:record.body_digest===digest};
        if(!state.verification.body_exact||!state.verification.reply_exact||!state.verification.digest_exact)action.outcome='published_mismatch';
      }
      state.finished=true;state.finished_ms=Date.now();state.outcome=action.outcome||'failed';state.note=action.note||'';
      await log({kind:'finish',outcome:state.outcome,note:state.note});await save();return {run:id,outcome:state.outcome,wall_ms:state.finished_ms-state.started_ms,activations:state.activations,http_requests:state.http_requests};
    }
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
    if(Date.now()-state.started_ms>(state.config.wall_budget_ms||1200000))throw Error('Declared wall-time budget reached; close as failed');
    const u=new URL(url);
    if(u.origin!==ORIGIN&&!(local&&u.hostname==='127.0.0.1'&&u.protocol==='http:'))throw Error('External supplied link blocked');
    const prefixSharedAction=state.config.method_id==='prefix-link'&&/^\/predictive-keyboard\/html\/word-links\/(?:state|step|choose|key|review|publish|discard|undo|clear|edit|designation|exact|literal)\//.test(u.pathname)&&(u.searchParams.get('view')==='prefix'||/^\/predictive-keyboard\/html\/word-links\/(?:review|publish|edit)\//.test(u.pathname));
    if(state.config.method_href && (/^\/predictive-keyboard\//.test(u.pathname)||/^\/compose\//.test(u.pathname)||/^\/quick\//.test(u.pathname)) && !u.pathname.startsWith(state.config.method_href)&&!prefixSharedAction)throw Error('Changing assigned method or using a GET shortcut is outside this strict-link run');
    if(isPublish(url)&&action.intent!=='publish')throw Error('Publication requires explicit --intent publish after reviewing the exact draft');
    if(isPublish(url)&&!state.approved_publish_urls?.includes(url))throw Error('Publication blocked: this capability has no exact target/reply review witness in this run');
    const previous=state.current?.url;
    state.activations++;state.last_action={url,selected};
    await log({kind:'activation',operation:kind,url,link_label:selected?.label||selected?.text||null,explicit_publication_intent:action.intent==='publish',gap_since_last_response_ms:state.last_response_ms?Date.now()-state.last_response_ms:null});
    if(kind==='link'&&selected?.href.includes('#')&&previous&&new URL(previous).origin+new URL(previous).pathname+new URL(previous).search===u.origin+u.pathname+u.search){
      state.current.url=url;await log({kind:'fragment',url});await save();return display(state);
    }
    let response;
    try{
      for(let redirects=0;redirects<8;redirects++){
        const began=Date.now();state.http_requests++;
        response=await wireGet(url,{local});
        await log({kind:'http',url,status:response.status,headers:response.headers,wire_body_bytes:response.wire_body_bytes,uncompressed_bytes:response.uncompressed_bytes,http_ms:response.http_ms,response_sha256:sha(response.text),received_at:Date.now()});
        await writeFile(path.join(dir,`response-${state.http_requests}.body`),response.text,{mode:0o600});
        const release=response.headers['x-relay-release'];
        if(state.config.release && release!==state.config.release){state.frozen_release_mismatch={expected:state.config.release,observed:release};await save();throw Error('Release changed: stop run; response recorded');}
        if(response.status>=300&&response.status<400&&response.headers.location){
          const next=new URL(response.headers.location,url).href;
          if(isPublish(next)&&action.intent!=='publish')throw Error('Redirect to publication blocked');
          await log({kind:'redirect',from:url,to:next});url=next;continue;
        }
        break;
      }
      if(response.status>=300&&response.status<400)throw Error('Redirect limit reached');
      if(isPublish(state.last_action.url)&&response.status>=200&&response.status<300){
        const receiptMatch=response.text.match(/Message ID:\s*<code>(IARC-M-[a-f0-9-]+)<\/code>/i)||response.text.match(/href="\/message\/(IARC-M-[a-f0-9-]+)">View public message/i);
        if(receiptMatch)state.publication_receipt_id=receiptMatch[1];
        else{try{state.publication_receipt_id=JSON.parse(response.text).message_id||null;}catch{}}
      }
      if(action.drop){await log({kind:'injected-response-loss',url});await save();return {run:id,response_lost:true,server_outcome:'unknown to tester; retry the original action',page:state.page};}
      const extractionBegan=performance.now();
      const parsed=(response.headers['content-type']||'').includes('text/html')?await extract(response.text):{title:'Machine-readable response',text:response.text,links:[],drafts:[]};
      parsed.url=url;parsed.links=parsed.links.map((l,i)=>({...l,id:i+1,url:new URL(l.href,parsed.base?new URL(parsed.base,url):url).href}));
      const reviewReply=response.text.match(/(?:Reply to|Replying to:)(?:<\/strong>)?\s*(?:<a\b[^>]*>)?<code>(IARC-M-[a-f0-9-]+)<\/code>/i)?.[1]||null;
      const exactReview=/\/review\//.test(new URL(url).pathname)&&parsed.drafts?.some(d=>Buffer.from(d).equals(Buffer.from(state.config.expected_body||'')))&&reviewReply===(state.config.reply_to||null);
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
  }finally{await rm(lock,{recursive:true});}
}
function display(state){return {run:state.id,page:state.page,status:state.last_status,title:state.current?.title,drafts:state.current?.drafts||[],text:state.current?.text||'',notice:'Use supplied numeric links only. A [link ID] belongs to this page ID. No forms, JavaScript, edited URLs, or external vocabulary.'};}
