// Server-observed request facts. No client script, draft text, URLs, or IP storage.
import {captureUsageState} from './keyboard_usage_context.js';
import {keyboardIdentity, KEYBOARD_FOUNDATION_VERSION} from './keyboard_foundation.js';
export const KEYBOARD_USAGE_VERSION = 'relay-keyboard-usage/2.0.0';
export const USAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const METHODS = {chunk:'chunk-word',predictive:'predictive-word',prefix:'prefix-link',span:'span','short-word':'short-word',token:'token-link',frame:'frame'};
const encoder = new TextEncoder();
export const MAX_CHOICES_PER_DAY = 10000;
export const MAX_REQUESTS_PER_DAY = 3000;
const MAX_EVENTS_PER_RUN = 5000;
export async function usageHash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function canonical(url) { const u=new URL(url); u.hash=''; u.searchParams.delete('__ru'); return u.href; }
export function usageAction(url,label='') {
  const p=url.pathname;
  if(/^Undo\b/i.test(label))return 'undo';
  if(/Backspace/i.test(label)||/\/key\/backspace\//.test(p))return 'backspace';
  if(/Clear draft/i.test(label)||/\/clear\//.test(p))return 'clear';
  if(/\/publish(?:\/|$)/.test(p))return 'publication';
  if(/\/arm\//.test(p))return 'arm';
  if(/\/review\//.test(p))return 'review';
  if(/\/discard\//.test(p))return 'discard';
  if(/\/step\/[^/]+\/(?:key|exact)\//.test(p)||/\/branch\//.test(p))return 'character-or-token';
  if(/\/step\/[^/]+\/pick\//.test(p)||/\/choose\//.test(p))return 'word-or-span';
  if(/\/action\//.test(p)){
    try{const op=JSON.parse(url.searchParams.get('op')||'{}');if(op.type==='backspace')return 'backspace';if(op.type==='append'&&Array.from(op.value||'').length===1)return 'character';if(op.type==='change-frame')return 'change-frame';if(op.type==='convert')return 'convert-to-text';}catch{}
    return 'frame-action';
  }
  if(/\/start(?:\/|$)/.test(p))return 'start';
  if(/\/message\//.test(p))return 'public-record-read';
  if(/\/state\//.test(p)&&url.search)return 'filter-or-mode';
  if(/\/(?:browse|characters|words|literal|exact)\//.test(p))return 'browse';
  return 'page-read';
}
function sectionName(text) {
  if(/top words|next words/i.test(text))return 'top-words';
  if(/candidate/i.test(text))return 'candidates';
  if(/short words|two.*three|2.*3.*words/i.test(text))return 'short-words';
  if(/\bSTART\b/.test(text))return 'start-chunks';
  if(/\bINSIDE\b/.test(text))return 'inside-chunks';
  if(/\bEND\b/.test(text))return 'end-chunks';
  if(/frame|slot/i.test(text))return 'frames-and-slots';
  if(/phrase|continuation|span/i.test(text))return 'continuations';
  if(/token/i.test(text))return 'tokens';
  if(/character|symbol|punctuation|number|unicode|byte/i.test(text))return 'exact-characters';
  return 'other';
}
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const plain=s=>decode(s.replace(/<[^>]*>/g,''));
// Attribution is authenticated transport metadata, never an action capability.
// Bind it to the unchanged target URL and run; store only the selected event.
const SECTIONS=['other','top-words','candidates','short-words','start-chunks','inside-chunks','end-chunks','frames-and-slots','continuations','tokens','exact-characters'];
const TRACKED_PRESENTATION=new Set(['word-or-span','frame-action','change-frame','convert-to-text','undo','backspace','clear','review','arm','publication','discard']);
const ACTIONS=['undo','backspace','clear','publication','arm','review','discard','character-or-token','word-or-span','character','change-frame','convert-to-text','frame-action','start','filter-or-mode','browse','page-read'];
let usageSecret,usageKey;
async function signingKey(env) {
  const secret=env.RELAY_CAPABILITY_SECRET;
  if(typeof secret!=='string'||secret.length<32)throw Error('Usage signing unavailable');
  if(secret!==usageSecret){usageKey=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);usageSecret=secret;}
  return usageKey;
}
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
async function tag(env,url,runId,expires,section,rank,action) {
  const bytes=new Uint8Array(56),view=new DataView(bytes.buffer);
  bytes.set(runId.match(/../g).map(x=>parseInt(x,16)));
  view.setUint32(32,Math.floor(expires/1000));bytes[36]=SECTIONS.indexOf(section);bytes[37]=ACTIONS.indexOf(action);view.setUint16(38,rank);
  const payload=base64(bytes.subarray(0,40));
  const mac=new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),encoder.encode('relay-usage-v2\0'+canonical(url)+'\0'+payload)));
  bytes.set(mac.subarray(0,16),40);return base64(bytes);
}
async function selectedAttribution(env,url) {
  const values=url.searchParams.getAll('__ru');if(values.length!==1||!/^[A-Za-z0-9_-]{75}$/.test(values[0]))return null;
  const bytes=Uint8Array.from(atob(values[0].replaceAll('-','+').replaceAll('_','/')+'='),c=>c.charCodeAt(0));
  const view=new DataView(bytes.buffer),expires=view.getUint32(32)*1000;
  if(expires<=Date.now()||bytes[36]>=SECTIONS.length||bytes[37]>=ACTIONS.length)return null;
  const mac=new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),encoder.encode('relay-usage-v2\0'+canonical(url.href)+'\0'+base64(bytes.subarray(0,40)))));
  let different=0;for(let i=0;i<16;i++)different|=mac[i]^bytes[40+i];if(different)return null;
  return {run_id:[...bytes.subarray(0,32)].map(x=>x.toString(16).padStart(2,'0')).join(''),section:SECTIONS[bytes[36]],action:ACTIONS[bytes[37]],choice_rank:view.getUint16(38)};
}
async function decorateChoices(env,html,base,runId,expires) {
  const baseTag=html.match(/<base\b[^>]*href="([^"]+)"/i)?.[1];
  const resolutionBase=baseTag?new URL(decode(baseTag),base).href:base;
  let section='other',rank=0,offset=0,result='';
  for(const m of html.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>|<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if(m[1]!==undefined){section=sectionName(plain(m[1]));rank=0;continue;}
    const href=m[2].match(/\bhref="([^"]+)"/i)?.[1];if(!href)continue;
    const u=new URL(decode(href),resolutionBase);if(u.origin!==new URL(base).origin)continue;
    rank++;
    if(u.hash||(!keyboardIdentity(u)&&u.pathname!=='/publish')||rank>65535)continue;
    const action=usageAction(u,plain(m[3]));if(!TRACKED_PRESENTATION.has(action))continue;
    u.searchParams.set('__ru',await tag(env,u.href,runId,expires,section,rank,action));
    const value=u.pathname+u.search+u.hash;
    const replacement=m[0].replace(/\bhref="[^"]+"/i,'href="'+value.replaceAll('&','&amp;').replaceAll('"','&quot;')+'"');
    result+=html.slice(offset,m.index)+replacement;offset=m.index+m[0].length;
  }
  return result+html.slice(offset);
}
export function stripUsageTransport(request) {
  const url=new URL(request.url);if(!url.searchParams.has('__ru'))return request;
  url.searchParams.delete('__ru');return new Request(url.href,request);
}
export function newUsageContext(request) {
  return request.method==='GET'?{url:new URL(request.url),started:performance.now()}:null;
}
// Associate failed/filter requests before the handler can reject or retire a state.
export async function prepareUsageContext(env, decodeState) {
  const c=env.KEYBOARD_USAGE;if(!c)return;
  const identity=keyboardIdentity(c.url);if(!METHODS[identity?.interface])return;
  const token=identity.interface==='token';
  if(token&&!c.url.pathname.startsWith('/compose/token/o200k/'))return;
  const match=c.url.pathname.match(token?/\/(?:state|branch|review|arm|search|apply)\/([^/]+)/: /\/(?:state|step|choose|review|discard|characters|words|action|form)\/([^/]+)/) || (token?c.url.pathname.match(/\/browse\/(?:prefix|o200k|words|bytes)\/([^/]+)/):null);
  const id=match?decodeState(match[1]):null;if(!id)return;
  const row=token?await env.RELAY_DB.prepare('SELECT st.*,s.expires_at AS session_expires_at FROM token_composer_states st JOIN token_composer_sessions s USING (session_id) WHERE st.state_id=?').bind(id).first():await env.RELAY_DB.prepare('SELECT st.*,s.expires_at AS session_expires_at FROM html_keyboard_states st JOIN html_keyboard_sessions s USING (session_id) WHERE st.state_id=?').bind(id).first();
  captureUsageState(env,row,token?row?.body_length??null:null);
}
export async function recordKeyboardUsage(env,request,response) {
  const c=env.KEYBOARD_USAGE;if(!c)return null;
  if(env.RELAY_DB.binding?.telemetryAllowed?.()===false)return {status:"budget-paused",runId:c.sessionId?await usageHash("usage-run-v1\0"+c.sessionId):null};
  const elapsed=performance.now()-c.started;
  let identity=keyboardIdentity(c.url);
  if(identity?.interface==='token'&&!c.url.pathname.startsWith('/compose/token/o200k/'))identity=null;
  const relevant=identity||c.sessionId||c.url.pathname==='/publish'||/^\/message\/IARC-M-/.test(c.url.pathname);
  if(!relevant)return null;
  const now=Date.now(),fp=await usageHash('usage-link-v1\0'+canonical(c.url.href));
  let issued=await selectedAttribution(env,c.url);
  const capturedRun=c.sessionId?await usageHash('usage-run-v1\0'+c.sessionId):null;
  if(issued&&capturedRun&&issued.run_id!==capturedRun)issued=null;
  if(!issued)issued=await env.RELAY_DB.prepare('SELECT c.run_id,c.section,c.choice_rank,c.action,r.method_id,r.adapter,r.session_expires_at,r.expires_at FROM keyboard_usage_choices c JOIN keyboard_usage_runs r USING (run_id) WHERE c.fingerprint=? AND c.expires_at>? AND r.expires_at>?').bind(fp,now,now).first();
  let runId=c.sessionId?await usageHash('usage-run-v1\0'+c.sessionId):issued?.run_id||null;
  let existing=runId?await env.RELAY_DB.prepare('SELECT * FROM keyboard_usage_runs WHERE run_id=? AND expires_at>?').bind(runId,now).first():null;
  const messageMatch=c.url.pathname.match(/^\/message\/(IARC-M-[a-f0-9-]+)(?:\/view)?$/i);
  if(!runId&&messageMatch){existing=await env.RELAY_DB.prepare('SELECT * FROM keyboard_usage_runs WHERE message_id=? AND expires_at>?').bind(messageMatch[1],now).first();runId=existing?.run_id||null;}
  const method=existing?.method_id||issued?.method_id||METHODS[identity?.interface];
  if(!method)return null; // Historical and unrelated resources are outside this seven-method series.
  const day=Math.floor(now/86400000)*86400000;
  await env.RELAY_DB.prepare('INSERT OR IGNORE INTO keyboard_usage_daily (day,expires_at) VALUES (?,?)').bind(day,day+USAGE_RETENTION_MS).run();
  const budget=await env.RELAY_DB.prepare('UPDATE keyboard_usage_daily SET request_count=request_count+1 WHERE day=? AND request_count<3000 RETURNING request_count').bind(day).first();
  if(!budget){if(runId)await env.RELAY_DB.prepare('UPDATE keyboard_usage_runs SET truncated=1 WHERE run_id=?').bind(runId).run();return {runId,status:'partial'};}
  const adapter=existing?.adapter||identity?.adapter||issued?.adapter||'unknown';
  let text=await response.clone().text();
  if(runId&&response.ok&&/^<!doctype/i.test(text)) {
    text=await decorateChoices(env,text,c.url.href,runId,existing?.expires_at||now+USAGE_RETENTION_MS);
    const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('ETag');
    response=new Response(text,{status:response.status,statusText:response.statusText,headers});
  }
  const bytes=encoder.encode(text).length;
  const links=(text.match(/<a\b[^>]*\bhref=/gi)||[]).length;
  const draft=text.match(/<pre\b[^>]*class="draft"[^>]*>([\s\S]*?)<\/pre>/i);
  if(draft&&c.afterBytes==null)c.afterBytes=encoder.encode(decode(draft[1])).length;
  const receipt=text.match(/Message ID:\s*<code>(IARC-M-[a-f0-9-]+)<\/code>/i)||text.match(/href="\/message\/(IARC-M-[a-f0-9-]+)">View public message/i);
  const publishing=usageAction(c.url)==='publication';
  let publishedId=response.ok&&publishing?(c.publishedId||receipt?.[1]||null):null;
  if(!publishedId&&c.url.pathname==='/publish'&&response.ok){try{publishedId=JSON.parse(text).message_id||null;}catch{}}
  const stage=publishedId?'published':response.ok&&/\/arm\//.test(c.url.pathname)?'armed':response.ok&&/\/review\//.test(c.url.pathname)?'reviewed':c.afterBytes>0?'composing':'started';
  const action=issued?.action||usageAction(c.url);
  let capped=false;
  if(runId){
    const expires=existing?.expires_at||now+USAGE_RETENTION_MS;
    // Backfill each historical run once. New runs never scan their event history.
    const legacyCount=existing&&existing.event_count==null?Number((await env.RELAY_DB.prepare('SELECT COUNT(*) AS count FROM keyboard_usage_events WHERE run_id=?').bind(runId).first()).count):0;
    if(!existing)await env.RELAY_DB.prepare('INSERT OR IGNORE INTO keyboard_usage_runs (run_id,method_id,adapter,backend_version,release_id,created_at,last_request_at,expires_at,session_expires_at,furthest_stage,published_at,message_id,event_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)').bind(runId,method,adapter,KEYBOARD_FOUNDATION_VERSION,env.CF_VERSION_METADATA?.id||'local',now,now,expires,c.sessionExpires||issued?.session_expires_at||null,stage,publishedId?now:null,publishedId).run();
    const updated=await env.RELAY_DB.prepare("UPDATE keyboard_usage_runs SET event_count=COALESCE(event_count,?)+1,last_request_at=?,session_expires_at=COALESCE(?,session_expires_at),furthest_stage=CASE WHEN ? IS NOT NULL OR furthest_stage='published' THEN 'published' WHEN ?='armed' OR furthest_stage='armed' THEN 'armed' WHEN ?='reviewed' OR furthest_stage='reviewed' THEN 'reviewed' WHEN ?='composing' THEN 'composing' ELSE furthest_stage END,published_at=COALESCE(published_at,?),message_id=COALESCE(message_id,?) WHERE run_id=? AND COALESCE(event_count,?)<? RETURNING event_count").bind(legacyCount,now,c.sessionExpires||issued?.session_expires_at||null,publishedId,stage,stage,stage,publishedId?now:null,publishedId,runId,legacyCount,MAX_EVENTS_PER_RUN).first();
    capped=!updated;
    if(capped)await env.RELAY_DB.prepare('UPDATE keyboard_usage_runs SET truncated=1 WHERE run_id=?').bind(runId).run();

  }
  if(!capped){
    const expires=existing?.expires_at||now+USAGE_RETENTION_MS;
    const repeat=runId?await env.RELAY_DB.prepare('SELECT event_id FROM keyboard_usage_events WHERE run_id=? AND fingerprint=? LIMIT 1').bind(runId,fp).first():null;
    await env.RELAY_DB.prepare('INSERT INTO keyboard_usage_events (event_id,run_id,method_id,created_at,expires_at,action,section,choice_rank,status,response_bytes,links_presented,server_ms,draft_bytes,delta_bytes,repeat_request,fingerprint,state_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),runId,method,now,expires,action,issued?.section||null,issued?.choice_rank||null,response.status,bytes,links,elapsed,c.afterBytes??null,c.beforeBytes!=null&&c.afterBytes!=null?c.afterBytes-c.beforeBytes:null,repeat?1:0,fp,c.stateId?await usageHash('usage-state-v1\0'+c.stateId):null).run();
  }
  return {runId,status:capped?'partial':'recorded',response};
}
export async function usageExport(env,url) {
  const now=Date.now();
  const params=url.searchParams;const limit=Number(params.get('limit')||200);
  if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error('limit must be 1 through 500');
  const cursor=params.get('before')||String(now+1);if(!/^\d{1,16}$/.test(cursor))throw new Error('before must be a millisecond timestamp');
  const beforeId=params.get('before_id')||'~';if(!/^[a-zA-Z0-9~_-]{1,64}$/.test(beforeId))throw new Error('Invalid cursor identifier');
  const run=params.get('run')||null;if(run&&!/^[a-f0-9]{64}$/.test(run))throw new Error('Invalid run identifier');
  const runCursor=Number(params.get('runs_before')||now+1);const runBeforeId=params.get('runs_before_id')||'~';
  if(!Number.isSafeInteger(runCursor)||runCursor<0||!/^[a-f0-9~]{1,64}$/.test(runBeforeId))throw new Error('Invalid run cursor');
  const runs=await env.RELAY_DB.prepare('SELECT *,CASE WHEN published_at IS NOT NULL THEN \'published\' WHEN session_expires_at<=? THEN \'expired-without-publication\' ELSE \'active-or-unobserved\' END AS observed_outcome FROM keyboard_usage_runs WHERE expires_at>? AND (created_at<? OR (created_at=? AND run_id<?)) AND (? IS NULL OR run_id=?) ORDER BY created_at DESC,run_id DESC LIMIT 501').bind(now,now,runCursor,runCursor,runBeforeId,run,run).all();
  const events=await env.RELAY_DB.prepare('SELECT event_id,run_id,method_id,created_at,expires_at,action,section,choice_rank,status,response_bytes,links_presented,server_ms,draft_bytes,delta_bytes,repeat_request FROM keyboard_usage_events WHERE expires_at>? AND (created_at<? OR (created_at=? AND event_id<?)) AND (? IS NULL OR run_id=?) ORDER BY created_at DESC,event_id DESC LIMIT ?').bind(now,Number(cursor),Number(cursor),beforeId,run,run,limit+1).all();
  const rows=events.results||[],more=rows.length>limit;const page=rows.slice(0,limit);
  const runRows=runs.results||[],runPage=runRows.slice(0,500);
  const daily=await env.RELAY_DB.prepare('SELECT day,request_count,choice_count FROM keyboard_usage_daily WHERE expires_at>? ORDER BY day DESC').bind(now).all();
  const storageDaily=(await env.RELAY_DB.prepare('SELECT day,rows_read,rows_written,telemetry_paused_at FROM relay_storage_daily WHERE day>? ORDER BY day DESC').bind(Math.floor(now/86400000)*86400000-USAGE_RETENTION_MS).all()).results||[];
  for(const row of runPage)row.budget_possible_gap=storageDaily.some(d=>d.telemetry_paused_at&&d.telemetry_paused_at>=row.created_at&&d.telemetry_paused_at<=(row.session_expires_at||row.expires_at)&&(!row.published_at||row.published_at>=d.telemetry_paused_at));
  return {storage_daily:storageDaily,storage_statistics:env.RELAY_DB.binding?.storageStatistics?.()||null,daily_caps:{requests:MAX_REQUESTS_PER_DAY,issued_choices:0},daily_usage:daily.results||[],schema_version:KEYBOARD_USAGE_VERSION,retention_days:30,generated_at:now,runs:runPage,runs_next_before:runRows.length>500?runPage.at(-1).created_at:null,runs_next_before_id:runRows.length>500?runPage.at(-1).run_id:null,events:page,next_before:more?page.at(-1).created_at:null,next_before_id:more?page.at(-1).event_id:null,runs_list_limit:500,attribution:'Authenticated supplied-link metadata; no new per-choice rows. Legacy rows remain until their original expiry.',limitations:['Requests observed by Relay, not human or agent intent.','No model tokens, client thinking time, fragment-only activations, or compressed wire-byte measurement.','Uncompressed response bytes exclude headers and TLS. Server time includes routing/rendering and excludes analytics writes.','Choice rank is ordinal among links within the emitted heading section, not model confidence. Presentation attribution covers word/span/frame choices and review/correction/publication controls; character and filter requests retain action counts without per-key rank metadata.','Repeated URLs may be retries or revisits. A published outcome does not establish an external transcription target match.','Runs/events have safety caps; truncated flags and budget_possible_gap must be checked. Budget-paused requests are absent from event history.']};
}
