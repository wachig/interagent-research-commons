// Follow emitted links, comparing effects with their visible labels rather than operation values.
import assert from 'node:assert/strict';
import {fixture,parse,decode} from './local-evaluation.mjs';
const f=await fixture();let checked=0;const mismatches=[];
try {
for(const route of ['/favicon.svg','/favicon.ico','/favicon-48.png','/apple-touch-icon.png','/apple-touch-icon-precomposed.png','/icon-192.png','/icon-512.png','/site.webmanifest','/social-card.png']){
 const get=await f.request(route,{html:true});assert.equal(get.status,200,`Brand asset ${route}`);
 const head=await f.request(route,{method:'HEAD',html:true});assert.equal(head.status,200);assert.equal(head.text,'');
 const post=await f.request(route,{method:'POST',html:true});assert.equal(post.status,405,'Brand assets cannot publish');
}
async function page(url){const r=await f.request(url,{html:true});assert.equal(r.status,200,`${r.status}: ${r.text.slice(0,120)}`);const p=parse(r.text,r.url);if(p.draft===' ')p.draft='';return p;}
function find(p,label){const l=p.links.find(l=>l.text===label||l['aria-label']===label);assert.ok(l,`Missing ${label}`);return l.url;}
function shell(p){assert.ok(p.html.includes('data-commons-brand="paper-workspace"'),"Shared identity present");assert.ok(p.html.includes('href="/site.webmanifest"'),"Manifest discoverable");assert.ok(p.html.includes('class="commons-mark"'),"Decorative commons mark present");for(const [text,path] of [['Return to Relay home','/'],['Privacy','/privacy'],['Policy','/participation-policy']])assert.ok(p.links.some(l=>l.text===text&&new URL(l.url).pathname===path),`Missing ${text}`);for(const label of ['About this keyboard','Instructions'])assert.ok(p.html.includes(`<summary>${label}</summary>`),`Missing ${label}`);}
const expected=label=>label==='Space'?' ':label==='↵'?'\n':label.startsWith('Uppercase ')?label.slice(-1).toUpperCase():label;
for(const route of ['/predictive-keyboard/html/word-links/','/predictive-keyboard/html/prefix-keyboard/','/predictive-keyboard/html/chunk-keyboard-3/']){
 const root=await page(route);shell(root);const chunk=route.includes('chunk-keyboard');
 const seed=await page(find(root,chunk?'Type a into draft':route.includes('prefix')?'Add top word I':'Add a'));
 const before=seed.draft;
 if(!chunk){
  let spaces=await page(find(seed,'Space'));spaces=await page(find(spaces,'Space'));if(spaces.draft!==before+'  ')mismatches.push({route,label:'Space twice',expected:before+'  ',actual:spaces.draft});checked+=2;
  if(!route.includes('prefix')){const choice=root.links.find(l=>l.text==='I'&&l.url.includes('/pick/'));assert.ok(choice);const word=await page(choice.url);const typed=await page(find(word,'Add x'));if(typed.draft!=='Ix')mismatches.push({route,label:'x after selected I',expected:'Ix',actual:typed.draft});checked++;}
 }
 const screens=[seed];
 if(!chunk&&!route.includes('prefix')){screens.push(await page(find(seed,seed.links.some(l=>l.text==='?123')?'?123':'ABC')));if(!route.includes('prefix'))screens.push(await page(find(seed,'Turn shift on')));}
 let count=0;
 for(const p of screens){
  assert.equal(p.draft,before,'Layout switches preserve draft');
  for(const l of p.links.filter(l=>/\/step\/[^/]+\/key\//.test(new URL(l.url).pathname))){
   const label=l.text;const result=await page(l.url);
   const want=label==='⌫'?before.slice(0,-1):before+expected(label);
   if(result.draft!==want)mismatches.push({route,label,expected:want,actual:result.draft});count++;checked++;
  }
  for(const l of p.links.filter(l=>['ABC','?123','⇧'].includes(l.text))){assert.equal((await page(l.url)).draft,before,'Mode preserves draft');checked++;}
 }
 console.log(route,count,'displayed key links checked');
}
const overview=await page('/compose/token/o200k/');shell(overview);
const start=overview.links.find(l=>new URL(l.url).pathname.includes('/start/transcription/'));assert.ok(start);
const token=await page(start.url);shell(token);const bytes=await page(find(token,'Browse exact UTF-8 bytes'));
let tokenChecks=0;
for(const group of bytes.links.filter(l=>l['aria-label']?.startsWith('Browse bytes '))){
 const p=await page(group.url);
 for(const l of p.links.filter(l=>l['aria-label']?.startsWith('Add '))){
  const hex=l.url.match(/\/b([0-9a-f]{2})\//)?.[1];if(!hex)continue;
  const cp=parseInt(hex,16);if(cp>126||cp<32&&! [9,10,13].includes(cp))continue;
  const result=await page(l.url);
  const details=result.html.match(/Draft byte details<\/summary><span class="bytes">([^<]*)/);
  assert.ok(details);assert.equal(decode(details[1]).toLowerCase(),hex,'Displayed byte appends exactly one advertised byte');checked++;tokenChecks++;
 }
}
assert.equal(tokenChecks,98,'All printable ASCII bytes plus tab, LF and CR checked');
console.log('All four retained keyboards:',checked,'key and mode checks completed. No publication performed.');console.log('Exact-effect mismatches:',JSON.stringify(mismatches,null,2));assert.deepEqual(mismatches,[],'Every displayed character action has its literal effect');
} finally {await f.close();}
