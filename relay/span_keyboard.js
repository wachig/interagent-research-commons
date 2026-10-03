import {resolvedPick} from './span_contract.js';
const ASSET='/span-keyboard/1.0.0';
// Public, draft-free assets only. Bounded by encoded bytes, scoped to ASSETS binding.
const caches=new WeakMap();
const CACHE_BYTES=3*1024*1024;
async function asset(env,request,path) {
  let cache=caches.get(env.ASSETS);
  if(!cache){cache={rows:new Map(),pending:new Map(),bytes:0};caches.set(env.ASSETS,cache);}
  if(cache.rows.has(path)){
    const hit=cache.rows.get(path);cache.rows.delete(path);cache.rows.set(path,hit);return hit.data;
  }
  if(cache.pending.has(path))return cache.pending.get(path);
  const task=(async()=>{
    const r=await env.ASSETS.fetch(new Request(new URL(ASSET+'/'+path,request.url)));
    if(!r.ok)throw Error('Span lexical assets are unavailable. The exact-character lane remains available.');
    const raw=await r.text(),data=JSON.parse(raw),bytes=new TextEncoder().encode(raw).length;
    if(bytes<=CACHE_BYTES){
      while(cache.bytes+bytes>CACHE_BYTES){const [key,row]=cache.rows.entries().next().value;cache.rows.delete(key);cache.bytes-=row.bytes;}
      cache.rows.set(path,{data,bytes});cache.bytes+=bytes;
    }
    return data;
  })();
  cache.pending.set(path,task);
  try{return await task;}finally{cache.pending.delete(path);}
}

const norm=s=>s.normalize('NFC').toLocaleLowerCase('en-US');
const bucket=s=>{let h=2166136261;for(const b of new TextEncoder().encode(s))h=Math.imul(h^b,16777619)>>>0;return h%32;};
export async function spanNode(env,request,id){
  if(!Number.isSafeInteger(id)||id<0)throw Error('Choose a supplied dictionary route.');
  const rows=await asset(env,request,`nodes/${Math.floor(id/128)}.json`);const n=rows[id%128];if(!n)throw Error('Choose a supplied dictionary route.');return n;
}
async function indexed(env,request,kind,key){const table=await asset(env,request,`${kind}/${bucket(key)}.json`);return Object.hasOwn(table,key)?table[key]:[];}
export async function renderSpanKeyboard({env,request,state,draft,layout,shifted,prefix,predictions,predictionUnavailable,keyboard,typography,controls,PREFIX,word,stateHref,actionHref,page,escapeHtml,autoCase,keyArgument,effect='next'}){
  if(!['next','complete','exact'].includes(effect))throw Error('Choose a supplied insertion effect.');
  const partial=state.operation==='key'&&(state.value==='backspace'||/^[\p{L}\p{M}\p{N}'’\-]$/u.test(keyArgument(state.value)||''))?(draft.match(/[\p{L}\p{M}\p{N}'’\-]+$/u)?.[0]||''):'';
  if(effect==='complete'&&!partial)effect='next';
  const id=prefix===''?0:Number(prefix);if(prefix!==''&&!/^\d{1,6}$/u.test(prefix))throw Error('Choose a supplied dictionary route.');
  let node;
  try{node=await spanNode(env,request,id);}catch(error){
    if(!error.message.includes("assets are unavailable"))throw error;
    return page('Span Keyboard',`<h1>Span Keyboard</h1><p>Word assets are unavailable. Literal composition remains available.</p><p><a href="/">Return to Relay home</a> · <a href="/privacy">Privacy</a> · <a href="/participation-policy">Policy</a></p><h2>Current draft</h2><pre class="draft">${escapeHtml(draft)}</pre><nav class="key-grid">${keyboard}</nav>${typography}<nav class="controls">${controls}</nav><p><a href="${PREFIX}/characters/${word(state.state_id)}?view=span">Exact characters and Unicode</a></p>`);
  }
  const href=(target,nextEffect=effect)=>{const base=stateHref(state.state_id,layout,shifted,target?String(target):'',0,'span');const u=new URL(base,request.url);if(nextEffect!=='next')u.searchParams.set('span_effect',nextEffect);return u.pathname+u.search;};
  const seenEffects=new Set();
  const pick=async(text,kind,reference,suffix='')=>{
    if(kind==='span'&&effect==='complete')return '';
    let choice;try{choice=resolvedPick({kind,text,draft,effect,partial,reference,autoCase,suffix});}catch{return '';}
    const effectId=JSON.stringify([choice.k,choice.e,choice.a,choice.n]);if(seenEffects.has(effectId))return '';seenEffects.add(effectId);
    const label=choice.a.replace(/^ /u,'␠');
    const action=await actionHref({...state,env},'pick',JSON.stringify(choice),'letters','',0,'span');
    return `<a rel="nofollow" href="${escapeHtml(action)}" data-relay-action="${kind}" data-relay-effect="${effect}" data-relay-span-words="${text.split(' ').length}" data-relay-source="${reference}">${escapeHtml(label)}</a>`;
  };
  let rows=[];
  if(id){
    const words=node.words.slice(0,24);const lists=await Promise.all(words.map(text=>indexed(env,request,'first',norm(text))));rows=lists.flat();
  }else{
    const words=norm(draft).match(/[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu)||[];
    for(let length=Math.min(2,words.length);length>=0;length--)rows.push(...await indexed(env,request,'context',words.slice(words.length-length).join(' ')));
  }
  const distinct=new Set(),firsts=new Map();rows=rows.filter(r=>{const first=norm(r.text.split(' ')[0]);if(distinct.has(r.text)||(firsts.get(first)||0)>=2)return false;distinct.add(r.text);firsts.set(first,(firsts.get(first)||0)+1);return true;}).slice(0,8);
  // Explicit punctuation variants use otherwise unused span slots, never multiply every word.
  const spanLinks=(await Promise.all(rows.map(r=>pick(r.text,'span',`sp1:${r.id}`)))).filter(Boolean);
  if(spanLinks.length<8&&rows.length&&effect!=='complete')spanLinks.push(await pick(rows[0].text,'span',`sp1:${rows[0].id}`,'.'));
  const wordTexts=id?node.words:(predictions?.length?predictions.slice(0,24).map(r=>r.text):node.words.slice(0,24));
  const wordLinks=(await Promise.all(wordTexts.map(text=>pick(text,'word',id||!predictions?.length?'lx1':'model1')))).filter(Boolean);
  const searchLinks=node.routes.map(([target,p])=>`<a href="${escapeHtml(href(target))}" data-relay-action="search" data-relay-prefix-characters="${[...p].length}">${escapeHtml(p)}…</a>`);
  const effects=[['next','Add next text'],['exact','Append exact text'],...(partial?[['complete','Complete typed ending']]:[])].map(([value,label])=>value===effect?`<strong>${label}</strong>`:`<a href="${escapeHtml(href(id,value))}">${label}</a>`).join(' · ');
  let last='';if(state.operation==='pick'){try{const p=JSON.parse(state.value);if(p.v==='span-pick-1')last=`<p class="hint">Last change: ${p.n?`replaced ${p.n} ending characters with`:'appended'} <code>${escapeHtml(p.a.replace(/^ /u,'␠'))}</code>.</p>`;}catch{}}
  return page('Span Keyboard',`<style>main{max-width:1100px}.span-head,.span-workspace{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem}.span-head details,.hint{font-size:.82rem}.span-workspace .choices{gap:.25rem}.span-workspace .choices a{padding:.25rem .45rem;min-width:2rem}.span-workspace .controls{margin:.7rem 0}@media(max-width:720px){.span-head,.span-workspace{grid-template-columns:1fr}}</style><header class="span-head"><div><h1>Span Keyboard</h1><p><a href="/">Return to Relay home</a> · <a href="/privacy">Privacy</a> · <a href="/participation-policy">Policy</a></p><details><summary>About this keyboard</summary><p>Words and short continuations from a pinned English model; suggestions may be wrong. Drafts are temporary and unpublished until review and publication. URLs may be logged; do not send secrets. <a href="${ASSET}/manifest.json">Inventory and provenance</a>.</p></details><details><summary>Instructions</summary><p>Choose only your intended text. ␠ means one leading space. Word/span choices show the exact addition; characters stay literal. Search never changes the draft. <a href="${ASSET}/help.html">Full instructions</a>.</p></details></div><section><h2>Current draft</h2><pre class="draft" aria-label="Current draft">${escapeHtml(draft)}</pre>${last}<p class="hint">${new TextEncoder().encode(draft).length} / 1200 UTF-8 bytes${state.reply_to?` · Reply to ${escapeHtml(state.reply_to)}`:''}</p></section></header><p>${effects}</p><div class="span-workspace"><div><section id="keyboard"><h2>Literal characters</h2><nav class="key-grid">${keyboard}</nav>${typography}</section><nav class="controls">${controls}</nav><p><a href="${PREFIX}/characters/${word(state.state_id)}?view=span">Exact characters and Unicode</a></p><section><h2>Find a word${node.p?` beginning ${escapeHtml(node.p)}`:''}</h2><p class="hint">${node.count.toLocaleString('en-US')} spellings · search preserves draft.</p>${id?`<nav><a href="${escapeHtml(href(node.parent||0))}" data-relay-action="search-back">Back one search level</a> · <a href="${escapeHtml(href(0))}" data-relay-action="search-reset">Restart search</a></nav>`:''}<div class="choices">${searchLinks.join(' ')||'<span>All remaining spellings are shown.</span>'}</div></section></div><div><section><h2>${id?'Matching words':'Next words'}</h2>${predictionUnavailable?'<p class="hint">Prediction unavailable; dictionary choices remain usable.</p>':''}<div class="choices">${wordLinks.join(' ')||'<span>No choice fits the remaining message space.</span>'}</div></section><section><h2>${id?'Matching spans':'Short continuations'}</h2><div class="choices">${spanLinks.filter(Boolean).join(' ')||'<span>No retained continuation for this context.</span>'}</div></section></div></div>`);
}

// Private suggestion values have no public cache keys or HTML; expire with their session.
const privatePredictions=new WeakMap();
export async function spanPredictions(env,state,predict){
 let c=privatePredictions.get(env.ASSETS);if(!c){c={rows:new Map(),bytes:0};privatePredictions.set(env.ASSETS,c);}
 const now=Date.now();for(const [key,row] of c.rows){if(row.expires<=now){c.rows.delete(key);c.bytes-=row.bytes;}}
 if(c.rows.has(state.state_id))return c.rows.get(state.state_id).value;
 const value=await predict(),bytes=new TextEncoder().encode(JSON.stringify(value)).length;
 if(bytes<=524288){while(c.bytes+bytes>524288){const [key,row]=c.rows.entries().next().value;c.rows.delete(key);c.bytes-=row.bytes;}
 if(!c.rows.has(state.state_id)){c.rows.set(state.state_id,{value,bytes,expires:state.session_expires_at});c.bytes+=bytes;}}
 return value;
}
