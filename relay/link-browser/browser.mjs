// A navigation client, not a recorder. Only current supplied links can be followed.
import {readFile,writeFile,mkdir,rm,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {configureConnectionAttempts} from './connection.mjs';
configureConnectionAttempts();
export const CLIENT_VERSION='semantic-link-browser/2.10';
export const ORIGIN='https://relay.interagentresearchcommons.org';
const DIRECTORY='/private/tmp/relay-supplied-link-browser';
const TTL=9*60*1000;
const decode=s=>s.replace(/&(?:#x([a-f0-9]+)|#(\d+)|(amp|lt|gt|quot|apos|nbsp|#39));/gi,(_,hex,num,named)=>hex||num?String.fromCodePoint(parseInt(hex||num,hex?16:10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ','#39':"'"}[named.toLowerCase()]));
const plain=s=>decode(s.replace(/<[^>]*>/g,''));
const compact=s=>plain(s).replace(/\s+/g,' ').trim();
export function render(html,url,revision) {
  // Input controls, scripts and styles never become browser actions.
  const source=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  const baseHref=source.match(/<base\b[^>]*href="([^"]*)"/i)?.[1];
  const base=baseHref?new URL(decode(baseHref),url).href:url;
  const links=[];let currentHeading='Page';const sections=[];let section={heading:currentHeading,text:[],links:[]};sections.push(section);
  const draft=source.match(/<pre\b[^>]*class="draft"[^>]*>([\s\S]*?)<\/pre>/i)?.[1];
  for(const m of source.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>|<a\b([^>]*)>([\s\S]*?)<\/a>|<(p|summary)\b[^>]*>([\s\S]*?)<\/\4>/gi)) {
    if(m[1]!==undefined){currentHeading=compact(m[1]);section={heading:currentHeading,text:[],links:[]};sections.push(section);continue;}
    if(m[4]){const content=compact(m[5]);if(content)section.text.push(content); // Preserve paragraph links too.
      for(const a of m[5].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi))add(a[1],a[2]);
      continue;}
    add(m[2],m[3]);
  }
  function add(attrs,label) {
    const href=attrs.match(/\bhref="([^"]*)"/i)?.[1];if(href===undefined)return;
    let dest;try{dest=new URL(decode(href),base);}catch{return;}
    if(dest.origin!==new URL(url).origin||!['http:','https:'].includes(dest.protocol))return;
    const aria=attrs.match(/\baria-label="([^"]*)"/i)?.[1];
    const id=`${revision}.${links.length+1}`;
    links.push({id,href:dest.href,label:compact(label),aria:aria?decode(aria):null,section:section.heading});
    section.links.push({id,label:compact(label),...(aria?{aria:decode(aria)}:{})});
  }
  const title=compact(source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'Relay');
  // Public-message and confirmation pages use a plain pre instead of class=draft.
  const pre=draft===undefined?source.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/i)?.[1]:undefined;
  return {links,view:{title,draft:draft===undefined?null:plain(draft),...(pre!==undefined?{displayedText:plain(pre)}:{}),sections:sections.filter(s=>s.heading!=='Page'||s.text.length||s.links.length)}};
}
function file(id){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid browser identifier');return path.join(DIRECTORY,id+'.json');}
async function load(id){const state=JSON.parse(await readFile(file(id),'utf8'));if(state.expires<=Date.now()){await rm(file(id),{force:true});throw Error('Browser expired; supervisor must close the trial.');}return state;}
async function save(state){await writeFile(file(state.id)+'.tmp',JSON.stringify(state),{mode:0o600});await rename(file(state.id)+'.tmp',file(state.id));}
async function navigate(state,destination,fetcher=fetch) {
  let url=destination;
  const started=performance.now();
  const navigationSignal=AbortSignal.timeout(20000);
  let headersMs=0,bodyMs=0;
  for(let i=0;i<6;i++) {
    let response,html;
    try {
      response=await fetcher(url,{redirect:'manual',signal:navigationSignal,headers:{Accept:'text/html','User-Agent':'Relay-Supplied-Link-Browser/1.0'}});
    }catch(cause){
      const error=new Error('Network fetch failed; no HTTP response received. Last supplied page preserved. No automatic action retry.',{cause});
      error.failureClass='network-no-response';
      error.elapsedMs=Math.round(performance.now()-started);
      const code=cause?.cause?.code||cause?.code;
      if(typeof code==='string'&&/^(E[A-Z]+|UND_ERR_[A-Z_]+)$/.test(code))error.networkCode=code;
      throw error;
    }
    headersMs=performance.now()-started;
    if([301,302,303,307,308].includes(response.status)){
      const next=new URL(response.headers.get('location'),url);if(next.origin!==new URL(state.home).origin)throw Error('External redirect refused');await response.body?.cancel();url=next.href;continue;
    }
    try{html=await response.text();}catch(cause){
      const error=new Error(`HTTP ${response.status} response body could not be read; last supplied page preserved. No automatic action retry.`,{cause});
      error.failureClass='network-incomplete-response';throw error;
    }
    bodyMs=performance.now()-started-headersMs;
    // A server failure must not destroy the supplied draft/recovery links.
    // Retain the last successful page; the caller decides whether to replay.
    if(response.status>=500) {
      const resourceLimit=/1102|Worker exceeded resource limits/i.test(html);
      const error=Error(`HTTP ${response.status}${resourceLimit?' (Cloudflare 1102: Worker exceeded resource limits)':''}; last supplied page preserved. No automatic action retry.`);
      error.failureClass='server-http-error';throw error;
    }
    state.url=url;state.revision++;
    const rendered=(response.headers.get('content-type')||'').includes('json')?{links:[],view:{title:'JSON response',json:JSON.parse(html),sections:[]}}:render(html,url,state.revision);
    state.links=rendered.links;state.view={timing:{headersMs:Math.round(headersMs),bodyMs:Math.round(bodyMs),navigationMs:Math.round(performance.now()-started)},status:response.status,usage:response.headers.get('x-relay-usage'),...rendered.view};
    return;
  }
  throw Error('Redirect limit exceeded');
}
export async function initialize({home=ORIGIN+'/',fetcher=fetch}={}) {
  await mkdir(DIRECTORY,{recursive:true,mode:0o700});
  const state={id:randomUUID(),home,url:home,revision:0,expires:Date.now()+TTL};await navigate(state,home,fetcher);await save(state);return state.id;
}
function observedView(state){return {client:CLIENT_VERSION,...state.view,revision:state.revision,remainingSeconds:Math.max(0,Math.floor((state.expires-Date.now())/1000))};}
export async function read(id){return observedView(await load(id));}
export async function follow(id,handle,{fetcher=fetch}={}) {
  const state=await load(id);
  let candidates;
  if(typeof handle==='string')candidates=state.links.filter(l=>l.id===handle);
  else if(handle&&typeof handle==='object'&&typeof handle.name==='string'&&Object.keys(handle).every(k=>['name','section'].includes(k)))candidates=state.links.filter(l=>(l.label===handle.name||l.aria===handle.name)&&(!handle.section||l.section===handle.section));
  else throw Error('Use a supplied handle or an exact displayed link name with optional section.');
  if(!candidates.length)throw Error('Stale or unknown link handle/name; read the current page.');
  // Duplicate anchors to the same URL are equivalent; distinct effects must be disambiguated.
  if(new Set(candidates.map(l=>l.href)).size>1)throw Error('Ambiguous link name; specify its displayed section or unique aria label. Supplied choices: '+JSON.stringify(candidates.slice(0,8).map(l=>({name:l.aria||l.label,section:l.section}))));
  const previousDraft=state.view.draft;
  const link=candidates[0];
  const next=new URL(link.href),current=new URL(state.url);
  if(next.origin!==new URL(state.home).origin)throw Error('Only supplied same-origin links are permitted');
  if(next.hash&&next.pathname===current.pathname&&next.search===current.search){state.url=next.href;state.revision++;const old=state.links;state.links=old.map((l,i)=>({...l,id:`${state.revision}.${i+1}`}));for(const s of state.view.sections)s.links=s.links.map(l=>({...l,id:state.links[old.findIndex(x=>x.id===l.id)].id}));}
  else await navigate(state,link.href,fetcher);
  if(typeof previousDraft==='string'&&typeof state.view.draft==='string') {
    const before=[...previousDraft],after=[...state.view.draft];let same=0;
    while(same<before.length&&same<after.length&&before[same]===after[same])same++;
    let suffix=0;
    while(suffix<before.length-same&&suffix<after.length-same&&before[before.length-1-suffix]===after[after.length-1-suffix])suffix++;
    state.view.draftChange={commonPrefixCharacters:same,unchangedSuffixCharacters:suffix,removed:before.slice(same,before.length-suffix).join(''),added:after.slice(same,after.length-suffix).join('')};
  }
  await save(state);return observedView(state);
}
export async function close(id){await rm(file(id),{force:true});await rm(file(id)+'.tmp',{force:true});}
