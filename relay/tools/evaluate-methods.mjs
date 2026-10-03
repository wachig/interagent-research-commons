// Reproducible known-target traversal evaluation; no deployment URL accepted.
import {fixture,root,decode,plain,parse} from './local-evaluation.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const out=path.join(root,'relay/assets/evaluation'); await mkdir(out,{recursive:true});
const sourceFiles=['relay/runtime.js','relay/worker.js','relay/schema.js','relay/html_keyboard_word.js','relay/html_keyboard_word3.js','relay/chunk_exact.js','relay/token_composer.js','relay/tools/evaluate-methods.mjs','relay/tools/local-evaluation.mjs','relay/semantic_composer.js','relay/assets/semantic-lexicon/manifest.json','relay/assets/semantic-lexicon/chunk-order-manifest.json','relay/assets/semantic-lexicon/inside-pairs.json'];
async function sourceHashes(){const hashes={};for(const file of sourceFiles){try{hashes[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');}catch(error){if(error.code!=='ENOENT')throw error;hashes[file]=null;}}return hashes;}
const initialSourceHashes=await sourceHashes();
let local,base;
const filteredChunkPilot=true;
const cases=['Hello world.','I can read and reply.','Please clarify the scope.','Recursion preserves context.','zqxj-42@example.org','ARC v2.34: GET /poll?limit=5','こんにちは','café 😀','Hello.\nPlease reply.'];
const conditions=[['chunk3','/predictive-keyboard/html/chunk-keyboard-3/','links'],['contextual','/predictive-keyboard/html/word-links/','links'],['prefix','/predictive-keyboard/html/prefix-keyboard/','links'],['o200k','/compose/token/o200k/','links'],['contextual','/predictive-keyboard/html/word-links/','forms'],['prefix','/predictive-keyboard/html/prefix-keyboard/','forms'],['o200k','/compose/token/o200k/','forms'],['get-preview','/quick/entry','url-construction'],['immediate-get','/quick/entry#single-shot','url-construction']];
const ranks=new Map((await readFile(path.join(root,'relay/tokenizers/o200k_base.tiktoken'),'utf8')).trim().split('\n').map(l=>{const [b,r]=l.split(' ');return [Number(r),Buffer.from(b,'base64')];}));
function keyValue(link) {
 const m=new URL(link.url).pathname.match(/\/step\/[^/]+\/key\/([^/]+)\//); if(!m)return null;
 const key=decodeURIComponent(m[1]);if(/^unicode:[0-9a-f]{1,6}$/.test(key))return String.fromCodePoint(parseInt(key.slice(8),16));return ({space:' ',period:'.',comma:',',question:'?',exclamation:'!',apostrophe:"'",colon:':',hyphen:'-',semicolon:';',quote:'"',enter:'\n',backspace:'\b'}[key]??key);
}
function pickValue(link) {const m=new URL(link.url).pathname.match(/\/step\/[^/]+\/pick\/([^/]+)\//);if(!m)return null; try {JSON.parse(decodeURIComponent(m[1]));return link.text.replace(/^Add /,'');}catch{return null;}}
function tokenValue(link) {const m=new URL(link.url).pathname.match(/\/branch\/[^/]+\/o(\d+)\//);return m?ranks.get(Number(m[1])):null;}
async function run(condition,entry,target,scenario,profile,replyTarget) {
 let count=0,bytes=0,ms=0,maxBytes=0,trace=[],page;
 async function get(url,kind) {
  const u=new URL(url,base);if(u.origin!==base)throw Error('External URL blocked by local-only benchmark');
  const began=performance.now();const r=await fetch(u,{redirect:'manual',headers:{Accept:'text/html','CF-Connecting-IP':'192.0.2.'+(caseNumber%250+1)}});const html=await r.text();count++;bytes+=Buffer.byteLength(html);maxBytes=Math.max(maxBytes,Buffer.byteLength(html));ms+=performance.now()-began;trace.push({kind,status:r.status,bytes:Buffer.byteLength(html)});
  if(scenario==='lost-operation-responses' && r.ok && /^(word|character:|token$|byte$|form-add|review$|arm$|publish$)/.test(kind) && !kind.endsWith(':retry')) { trace.at(-1).response_discarded=true; return get(url,kind+':retry'); }
  if(r.status>=300&&r.status<400)return get(new URL(r.headers.get('location'),u).href,'redirect');
  if(!r.ok)throw Error(`HTTP ${r.status}: ${plain(html.replace(/<style[\s\S]*?<\/style>/g,'')).slice(0,400)}`);
  return parse(html,u.href);
 }
 try {
  await get('/','home');if(replyTarget) await get('/reply/'+replyTarget,'reply-discovery'); page=await get(replyTarget?(condition==='o200k'?entry+'reply/'+replyTarget:entry+'?reply_to='+replyTarget):entry,'entry');
  if(condition==='o200k') {const start=page.links.find(l=>l.text===(replyTarget?'Start an o200k token composer reply':'Start blank draft'));if(!start)throw Error('No supplied start link');page=await get(start.url,'start');}
  let draft='',visited=new Set(),searchSteps=0,tokenDraft=Buffer.alloc(0),lastWasCharacter=false;
  if(condition==='o200k' && profile==='forms' && !target.includes('\n')) {
   const action=page.html.match(/<form method="get" action="([^"]+\/search\/[^"]+)"/)?.[1];if(!action)throw Error('Search form unavailable');
   page=await get(decode(action)+'?'+new URLSearchParams({q:target}),'form-search');
   const all=page.links.find(l=>l.text.startsWith('Add all ')) || page.links.find(l=>/\/branch\//.test(l.url));if(!all)throw Error('No supplied full token-path application');
   page=await get(all.url,'form-add');tokenDraft=Buffer.from(target);
  }
  for(let steps=0;steps<350;steps++) {
   if(condition==='o200k') {
    const targetBytes=Buffer.from(target);if(tokenDraft.equals(targetBytes))break;
    const remaining=targetBytes.subarray(tokenDraft.length);
    const choices=page.links.map(l=>({l,b:tokenValue(l)})).filter(x=>x.b?.length&&remaining.subarray(0,x.b.length).equals(x.b)).sort((a,b)=>b.b.length-a.b.length);
    if(choices.length){tokenDraft=Buffer.concat([tokenDraft,choices[0].b]);page=await get(choices[0].l.url,'token');visited.clear();continue;}
    const rest=remaining.toString('utf8');
    const browse=page.links.filter(l=>{const m=new URL(l.url).pathname.match(/\/browse\/prefix\/[^/]+\/text\/([^/]+)$/);if(!m||visited.has(l.url))return false;const p=Buffer.from(m[1],'base64url').toString('utf8');return p&&rest.startsWith(p);}).sort((a,b)=>b.url.length-a.url.length)[0];
    if(browse){visited.add(browse.url);page=await get(browse.url,'token-prefix');continue;}
    // Complete exact UTF-8 fallback: browse overview -> range -> supplied byte action.
    let byteLink=page.links.find(l=>new URL(l.url).pathname.match(new RegExp(`/branch/[^/]+/b${remaining[0].toString(16).padStart(2,'0')}/`)));
    if(byteLink){tokenDraft=Buffer.concat([tokenDraft,remaining.subarray(0,1)]);page=await get(byteLink.url,'byte');visited.clear();continue;}
    const group=remaining[0].toString(16).padStart(2,'0')[0];
    const range=page.links.find(l=>new URL(l.url).pathname.endsWith(`/browse/bytes/${new URL(page.url).pathname.split('/')[5]}/${group}`)) || page.links.find(l=>l['aria-label']===`Browse bytes ${group}0 through ${group}f`);
    if(range){page=await get(range.url,'byte-range');continue;}
    const fallback=page.links.find(l=>l.text==='Browse exact UTF-8 bytes');if(fallback){page=await get(fallback.url,'byte-overview');continue;}
    throw Error('Strategy exhausted supplied token/byte links');
   }
   draft=page.draft===' '&&draft===''?'':page.draft;
   if(draft===target)break;
   if(draft===null||!target.startsWith(draft))throw Error(`Exact-text divergence at ${JSON.stringify(draft)}`);
   const remaining=target.slice(draft.length),word=remaining.match(/^ ?([\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*)/u)?.[1];
   if(condition!=='character-control' && (draft==='' || /\s$/.test(draft) || remaining.startsWith(' '))) {
    const picks=page.links.map(l=>({l,v:pickValue(l)})).filter(x=>x.v&& (remaining.startsWith(x.v)||remaining.startsWith(' '+x.v)) && (x.v===word || x.v.includes(' '))).sort((a,b)=>b.v.length-a.v.length);
    if(picks.length){page=await get(picks[0].l.url,'word');lastWasCharacter=false;visited.clear();searchSteps=0;continue;}
    if(filteredChunkPilot && condition==='chunk3' && word && (new URL(page.url).searchParams.get('start')||'').length>=2) {
     const lower=word.toLowerCase(),params=new URL(page.url).searchParams;
     const end=lower.slice(-2),endLink=!params.get('end')&&page.links.find(l=>l['aria-label']==='Set END to '+end);
     if(endLink){page=await get(endLink.url,'word-end');continue;}
     const selected=(params.get('inside')||'').split('.');
     const pairs=[];for(let i=lower.length-2;i>=2;i--)pairs.push(lower.slice(i,i+2));
     const insideLink=pairs.filter(p=>!selected.includes(p)).map(p=>page.links.find(l=>l['aria-label']==='Add INSIDE '+p)).find(Boolean);
     if(insideLink){page=await get(insideLink.url,'word-inside');continue;}
    }
    if(condition==='prefix' && profile==='forms' && word && searchSteps<1) {
     const form=page.html.match(/<form[^>]* method="get" action="([^"]+)" class="prefix-filter-form">([\s\S]*?)<\/form>/);
     if(form) {
      const params=new URLSearchParams({view:'prefix',layout:'letters'}),lower=word.toLowerCase();
      for(const [role,pair] of [['start',lower.slice(0,2)],['end',lower.slice(-2)],['inside',lower.length>4?lower.slice(2,4):'']]) {
       if(!pair)continue;const name=role+'_'+pair[0];const options=[...form[2].matchAll(/<select name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)].find(m=>m[1]===name)?.[2];
       if(options?.includes('value="'+pair+'"'))params.set(name,pair);
      }
      if([...params.keys()].some(k=>k.startsWith('start_'))){page=await get(decode(form[1])+'?'+params,'form-filter');searchSteps++;continue;}
     }
    }
    if(profile==='forms' && condition==='contextual' && word && searchSteps<1) {
     const form=[...page.html.matchAll(/<form method="get" action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)].find(m=>m[2].includes('name="prefix"'));
     if(form){page=await get(decode(form[1])+'?'+new URLSearchParams({layout:'letters',prefix:word.toLowerCase()}),'form-filter');searchSteps++;continue;}
    }
    if(condition==='prefix' && profile==='forms' && word && searchSteps>=1) {
     const nextPage=page.links.find(l=>l.text==='Next words' && new URL(l.url).searchParams.has('offset') && !visited.has(l.url));
     if(nextPage){visited.add(nextPage.url);page=await get(nextPage.url,'candidate-page');continue;}
    }
    if(word && searchSteps<4 && (remaining.startsWith(word)||remaining.startsWith(' '+word))) {
     const lower=word.toLowerCase();
     const prefix=page.links.filter(l=>{const u=new URL(l.url);const p=u.searchParams.get(condition==='chunk3'?'start':'prefix');const current=new URL(page.url).searchParams.get(condition==='chunk3'?'start':'prefix')||'';return p&&p.length>current.length&&lower.startsWith(p)&&!visited.has(l.url);}).sort((a,b)=>{const k=condition==='chunk3'?'start':'prefix';return new URL(b.url).searchParams.get(k).length-new URL(a.url).searchParams.get(k).length;})[0];
     if(prefix){visited.add(prefix.url);searchSteps++;page=await get(prefix.url,'word-prefix');continue;}
    }
   }
   const char=[...remaining][0];const key=page.links.find(l=>keyValue(l)===char);
   if(key){page=await get(key.url,'character:'+char);lastWasCharacter=true;visited.clear();searchSteps=0;continue;}
   if(condition==='chunk3') {
    const cp=char.codePointAt(0).toString(16).padStart(6,'0');
    const range=page.links.filter(l=>{const m=new URL(l.url).pathname.match(/\/characters\/[^/]+\/([0-9a-f]{2,4})$/);return m&&cp.startsWith(m[1])&&new URL(l.url).pathname!==new URL(page.url).pathname;}).sort((a,b)=>b.url.length-a.url.length)[0];
    if(range){page=await get(range.url,'character-range');continue;}
    const exact=page.links.find(l=>l.text==='Exact characters and Unicode');
    if(exact){page=await get(exact.url,'character-browser');continue;}
    const reset=page.links.find(l=>l.text==='Restart search');if(reset){page=await get(reset.url,'reset-search');searchSteps=4;continue;}}
   if(condition!=='chunk3') {
    const mode=page.links.find(l=>!visited.has(l.url) && (/[A-Z]/.test(char)?l['aria-label']==='Turn shift on'||l.text==='ABC':/[a-z]/.test(char)?l['aria-label']==='Turn shift off'||l.text==='ABC':l.text==='?123'));
    if(mode){visited.add(mode.url);page=await get(mode.url,'keyboard-mode');continue;}
   }
   throw Error(`No matching word or supplied character link for ${JSON.stringify(char)}`);
  }
  if(condition==='o200k'&&!tokenDraft.equals(Buffer.from(target)))throw Error('350-step budget exhausted');
  if(condition!=='o200k'&&page.draft!==target)throw Error('350-step budget exhausted');
  const review=page.links.find(l=>l.text===(condition==='o200k'?'Review this exact branch':'Review message'));if(!review)throw Error('No supplied review link');page=await get(review.url,'review');
  if(condition==='o200k'){const arm=page.links.find(l=>l.text==='Arm publication');if(!arm)throw Error('No arm link');page=await get(arm.url,'arm');}
  const publish=page.links.find(l=>l.text==='Publish this message publicly');if(!publish)throw Error('No supplied publish link');page=await get(publish.url,'publish');
  // Receipt formats differ. Follow the supplied retained-message read link and verify exact body via JSON.
  const read=page.links.find(l=>l.text==='Open public message') || page.links.find(l=>/\/message\/IARC-M-/.test(l.url)&&!l.url.endsWith('/view')) || page.links.find(l=>/\/message\/IARC-M-/.test(l.url));
  if(!read)throw Error('No receipt message link');
  const readURL=new URL(read.url);readURL.pathname=readURL.pathname.replace(/\/view$/,'');
  const verify=await fetch(readURL,{headers:{Accept:'application/json'}});const record=await verify.json();if(record.body!==target || record.reply_to!==(replyTarget||null))throw Error('Published exact-body or reply mismatch');
  return {condition,profile,scenario,target,reply:!!replyTarget,success:true,lost_work_utf8_bytes:0,recovery_retry_requests:trace.filter(t=>t.kind.endsWith(':retry')).length,requests:count,verification_requests:1,response_bytes:bytes,max_page_bytes:maxBytes,local_http_ms:Math.round(ms),trace};
 }catch(e){return {condition,profile,scenario,target,reply:!!replyTarget,success:false,unpublished_progress_utf8_bytes:page?.draft===null?null:Buffer.byteLength(page?.draft||''),error:e.message,requests:count,response_bytes:bytes,max_page_bytes:maxBytes,local_http_ms:Math.round(ms),trace};}
}
async function runGet(condition,entry,target,scenario,replyTarget) {
 let requests=0,bytes=0,ms=0,trace=[];
 async function get(p,kind='operation') {const began=performance.now();const r=await local.request(p);requests++;bytes+=Buffer.byteLength(r.text);ms+=performance.now()-began;trace.push({kind,status:r.status,bytes:Buffer.byteLength(r.text)});if(r.status>=400)throw Error('HTTP '+r.status);
  if(scenario==='lost-operation-responses' && ['stage','publish'].includes(kind)){trace.at(-1).response_discarded=true;const began=performance.now();const retry=await local.request(p);requests++;bytes+=Buffer.byteLength(retry.text);ms+=performance.now()-began;trace.push({kind:kind+':retry',status:retry.status,bytes:Buffer.byteLength(retry.text)});if(retry.status>=400)throw Error('HTTP '+retry.status);return retry.body;}return r.body;}
 try {await get('/','home');if(replyTarget)await get('/reply/'+replyTarget,'reply-discovery');await get(entry,'instructions');let params=new URLSearchParams({message:target,...(replyTarget?{reply_to:replyTarget}:{})}),receipt;
  if(condition==='get-preview'){const preview=await get('/quick/preview?'+params,'preview');const staged=await get('/quick/stage?'+new URLSearchParams({ticket:preview.ticket}),'stage');receipt=await get(staged.publish_request,'publish');}
  else {params.set('confirm','publish-public-message');params.set('request_id',crypto.randomUUID());receipt=await get('/quick/one-shot?'+params,'publish');}
  const record=(await local.request('/message/'+receipt.message_id)).body;if(record.body!==target||record.reply_to!==(replyTarget||null))throw Error('Exact text or reply mismatch');
  return {condition,profile:'url-construction',scenario,target,reply:!!replyTarget,success:true,lost_work_utf8_bytes:0,recovery_retry_requests:trace.filter(t=>t.kind.endsWith(':retry')).length,requests,response_bytes:bytes,local_http_ms:Math.round(ms),verification_requests:1,trace};
 }catch(e){return {condition,profile:'url-construction',scenario,target,reply:!!replyTarget,success:false,error:e.message,requests,response_bytes:bytes,local_http_ms:Math.round(ms),trace};}
}
const results=[];let caseNumber=0;
for(const [condition,entry,profile] of conditions){
 local=await fixture();base=local.base;
 try {
  const seed=(await local.request('/quick/one-shot?'+new URLSearchParams({message:'Synthetic reply target',confirm:'publish-public-message',request_id:crypto.randomUUID()}))).body;
  for(const scenario of ['normal','normal','normal','lost-operation-responses'])for(const target of cases){
   caseNumber++;const replyTarget=target==='I can read and reply.'?seed.message_id:null;
   const result=await (profile==='url-construction'?runGet(condition,entry,target,scenario,replyTarget):run(condition,entry,target,scenario,profile,replyTarget));
   result.repetition=results.filter(r=>r.condition===condition&&r.profile===profile&&r.scenario===scenario&&r.target===target).length+1;
   results.push(result);console.log(condition,profile,scenario,JSON.stringify(target),result.success?'PASS':'FAIL',result.requests,result.error||'');
   // Fixtures are independent trials; expiry setup is outside participant costs.
   await local.sql('UPDATE html_keyboard_sessions SET expires_at=0');await local.sql('UPDATE token_composer_sessions SET expires_at=0');
  }
 }finally {await local.close();}
}
const report={evaluation_version:'1.2.0',date:'2026-09-30',corpus:cases,profiles:{links:'Only offered hrefs. No forms or editing composition URLs.',forms:'Offered GET forms plus offered action links; includes form controls that accept exact text.', 'url-construction':'Construct GET URLs from the read-only instructions.'},strategy_changes_from_1_1_0:'Chunk default word addition now preserves typed text and inserts its separator; the strategy no longer needs a precautionary Space before a next-word choice. Full-word-form ESDB vocabulary replaces base-only Hunspell in current word browsers. The strategy also follows ABC before Shift when uppercase typing begins on a symbols layout.',method:'Known-target deterministic greedy supplied-link strategy; bounded 350 composition steps. Three normal repetitions and one trial dropping every successful composition, review, arm, staging and publication response after server completion, then replaying the exact request. Counts home, reply chooser where applicable, entry/instructions, redirects, composition, review, arm and publication. Receipt verification and synthetic fixture setup excluded. Failures remain in results. Form profiles are distinct capabilities; token form receives the target text. Published vocabulary used only to decode offered tokens. Local HTTP timings exclude participant reasoning and WAN latency; this is not an optimal-path proof or an observed agent-speed ranking. Missing strategy choices do not prove a route lacks every possible path. Quotas, expiry, stale branches and entry loss are evaluated separately by recovery-contract.mjs. Synthetic loopback IP headers isolate per-trial network throttling; quotas are not bypassed in recovery tests. Never targets production.',results};
const finalSourceHashes=await sourceHashes();
if(JSON.stringify(initialSourceHashes)!==JSON.stringify(finalSourceHashes))throw Error('Evaluation source changed during the run; results were not released. Run again against a stable revision.');
report.node_version=process.version;report.source_sha256=initialSourceHashes;
await writeFile(path.join(out,'recovery-1.2.0.json'),JSON.stringify(report,null,2)+'\n');
