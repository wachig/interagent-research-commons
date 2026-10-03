import assert from 'node:assert/strict';
import {fixture,parse} from '../tools/local-evaluation.mjs';
import {permittedScalar,exactKeyText,unicodeChoices,exactWordEffect} from '../chunk_exact.js';
import {writeFile} from 'node:fs/promises';

let scalars=0,maxSuppliedURL=0;
for(const plane of unicodeChoices())for(const group of unicodeChoices(plane))for(const block of unicodeChoices(group))for(const cp of unicodeChoices(block)){
  assert.ok(permittedScalar(cp));
  assert.equal(exactKeyText(`unicode:${cp.toString(16)}`).codePointAt(0),cp);
  scalars++;
}
assert.equal(scalars,1_112_034,'Every permitted scalar occurs in exactly one supplied range');
for(let cp=0;cp<=0x10ffff;cp++)assert.equal(exactKeyText(`unicode:${cp.toString(16)}`)!==undefined,permittedScalar(cp));
assert.throws(()=>unicodeChoices('11'));
assert.equal(exactKeyText('unicode:110000'),undefined);
assert.equal(exactKeyText('unicode:d800'),undefined);
assert.equal(exactWordEffect('@','', 'the').added,'the');
assert.equal(exactWordEffect('@rea','rea','read','complete').added,'read');
assert.equal(exactWordEffect('rea','rea','read','next').added,' read');
assert.equal(exactWordEffect('@rea','rea','read','exact').removed,'');

const f=await fixture();const checks=[];const prefix='/predictive-keyboard/html/chunk-keyboard-3';
try{
async function page(route){const r=await f.request(route,{html:true});assert.equal(r.status,200,r.text.slice(0,100));const parsed=parse(r.text,r.url);for(const l of parsed.links){maxSuppliedURL=Math.max(maxSuppliedURL,l.url.length);assert.ok(l.url.length<=8000,"Supplied URLs remain within the service bound");}return parsed;}
function link(p,name){const l=p.links.find(l=>l['aria-label']===name||l.text===name);assert.ok(l,`Missing ${name}`);return l.url;}
async function follow(p,name){return page(link(p,name));}
function draft(p){return p.draft===' '?'':p.draft;}
async function glyph(p,cp){p=await follow(p,'Exact characters and Unicode');if(cp>=128){const hex=cp.toString(16).padStart(6,'0');for(const size of [2,3,4]){const l=p.links.find(l=>new URL(l.url).pathname.endsWith('/'+hex.slice(0,size)));assert.ok(l);p=await page(l.url);}}
  const label=cp===9?'Tab':cp===10?'Line feed':cp===13?'Carriage return':cp===32?'Space':`U+${cp.toString(16).toUpperCase().padStart(4,'0')}`;
  return follow(p,'Append '+label);
}
const seed=(await f.request('/quick/one-shot?'+new URLSearchParams({message:'Synthetic exact-character reply target',confirm:'publish-public-message',request_id:crypto.randomUUID()}))).body;
const root=await page(prefix+'/?reply_to='+seed.message_id);
let p=await follow(root,'Add top word I');p=await follow(p,'Type x into draft');assert.equal(draft(p),'Ix');checks.push('Literal character after a selected word inserts no separator');
p=await follow(root,'Type a into draft');p=await follow(p,'Space');p=await follow(p,'Space');assert.equal(draft(p),'a  ');checks.push('Repeated spaces remain distinct');
p=await follow(root,'@');const top=p.links.find(l=>l['aria-label']?.startsWith('Add top word '));assert.ok(top);const selected=JSON.parse(decodeURIComponent(new URL(top.url).pathname.split('/pick/')[1].split('/')[0]));p=await page(top.url);assert.equal(draft(p),'@'+(Array.isArray(selected)?selected[1]:selected.text));checks.push('Default next-word selection after @ inserts no separator or automatic capital');
p=await follow(root,'Type r into draft');p=await follow(p,'Type e into draft');p=await follow(p,'Type a into draft');const typed=p;
p=await follow(typed,'Complete current word');p=await follow(p,'Set START to re');p=await follow(p,'Add read');assert.equal(draft(p),'read');checks.push('Explicit completion replaces only the typed word');
p=await follow(typed,'Set START to re');p=await follow(p,'Add read');assert.equal(draft(p),'rea read');checks.push('Default next-word insertion leaves the typed word intact without a Space action');
p=await follow(typed,'Append exact spelling');p=await follow(p,'Set START to re');p=await follow(p,'Add read');assert.equal(draft(p),'rearead');checks.push('Exact spelling appends without replacement or spacing');
p=await follow(root,'Uppercase');p=await follow(p,'Set START to re');p=await follow(p,'Add READ');assert.equal(draft(p),'READ');checks.push('Explicit word case survives search refinement');
const accented=root.links.find(l=>l['aria-label']==='Type é into draft');assert.ok(accented);assert.equal(draft(await page(accented.url)),'é');checks.push('Accented letter headings use permitted literal scalar actions');
const filtered=await follow(root,'Set START to bo');assert.ok(!filtered.links.some(l=>l['aria-label']==='Set START to re'));assert.ok(filtered.links.some(l=>l.text==='Exact characters and Unicode'));assert.equal(draft(filtered),'');checks.push('START remains one selected prefix; optional exact keyboard remains reachable');
const before=(await f.sql('SELECT COUNT(*) AS n FROM html_keyboard_states'))[0].n;
const chars=await follow(filtered,'Exact characters and Unicode');assert.equal(draft(chars),'');await follow(chars,'U+000000–U+00FFFF');const after=(await f.sql('SELECT COUNT(*) AS n FROM html_keyboard_states'))[0].n;assert.equal(before,after);assert.equal((await f.request(new URL(chars.url).pathname,{method:'HEAD'})).status,200);checks.push('Unicode browsing and HEAD are read-only');
const wanted='I=é😀 e\u0301\t\r\n[ok]\\{}|~`';p=root;for(const ch of wanted)p=await glyph(p,ch.codePointAt(0));assert.equal(draft(p),wanted);checks.push('ASCII symbols, uppercase, combining marks, emoji and exact whitespace preserve bytes');
const repeated=p.links.find(l=>l.text==='Exact characters and Unicode');assert.ok(repeated);
const review=await follow(p,'Review message');const pub=link(review,'Publish this message publicly');const receipt=await f.request(pub);assert.equal(receipt.status,201);const retry=await f.request(pub);assert.equal(retry.status,200);assert.equal(retry.body.message_id,receipt.body.message_id);const record=(await f.request('/message/'+receipt.body.message_id)).body;assert.equal(record.body,wanted);assert.equal(record.reply_to,seed.message_id);assert.equal(record.conversation_id,seed.conversation_id);checks.push('Exact publication, reply relationship and receipt retry survive Unicode composition');
const limit=await page(prefix+'/');const stateId=(await f.sql('SELECT state_id FROM html_keyboard_states WHERE parent_state_id IS NULL ORDER BY created_at DESC LIMIT 1'))[0].state_id;
await f.sql('UPDATE html_keyboard_states SET snapshot=? WHERE state_id=?','x'.repeat(1199),stateId);
p=await glyph(limit,0x61);assert.equal(new TextEncoder().encode(draft(p)).length,1200);const overflow=await f.request(link(p,'Append U+0062'),{html:true});assert.equal(overflow.status,413);checks.push('Exactly 1200 UTF-8 bytes accepted; overflow rejected without publication');
await f.sql('UPDATE html_keyboard_sessions SET expires_at=0');assert.equal((await f.request(link(p,'Exact characters and Unicode'),{html:true})).status,410);checks.push('Expired drafts cannot be renewed through Unicode browsing');
console.log(`Chunk exact-character tests passed: ${scalars} scalars and ${checks.length} integration checks.`);
await writeFile(new URL('../assets/evaluation/chunk-exact-1.1.0.json',import.meta.url),JSON.stringify({evaluation_version:'chunk-exact-1.1.0',date:'2026-09-30',maximum_supplied_url_characters_in_integration_checks:maxSuppliedURL,permitted_scalar_values_exhaustively_checked:scalars,checks,coverage:'Finite permitted Unicode scalar browser plus literal append induction. A fresh nonempty message of at most 1200 UTF-8 bytes needs at most 1201 saved states including the root. Unicode range reads create no states or composer events. Each non-ASCII scalar needs at most five participant requests including browser entry and append; ASCII characters need at most two with the optional exact keyboard, or one where already offered. For a fresh worst-case 1200-byte message, at most 3000 character/browse requests plus review and publish; existing branches consume capacity. This proves representational and state/URL bounds, not completion under arbitrary latency, quota contention, response loss or expiry. The 30-minute session and publication draft deadlines still apply.'},null,2)+'\n');
}finally{await f.close()}
