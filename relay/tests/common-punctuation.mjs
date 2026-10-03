import assert from 'node:assert/strict';
import {fixture,parse} from '../tools/local-evaluation.mjs';
import {COMMON_PUNCTUATION} from '../common_punctuation.js';
import {compactWordArgument,expandWordArgument} from '../keyboard_foundation.js';
import {recoverableExecution} from '../execution_recovery.js';
const logged=[];const originalError=console.error;console.error=s=>logged.push(JSON.parse(s));
try{
 const request=new Request('https://relay.invalid/predictive-keyboard/html/word-links/review/supplied-state?view=prefix');
 const failed=await recoverableExecution(request,async()=>{throw new Error('private text and capability must never be logged');});
 assert.equal(failed.status,503);assert.equal(failed.headers.get('Retry-After'),'3');
 const recovery=await failed.text();assert.match(recovery,/Retry this draft review/);assert.ok(!recovery.includes('Publish this message publicly'));assert.ok(!JSON.stringify(logged).includes('private text'));
 let reads=0;const recovered=await recoverableExecution(request,async()=>{reads++;return new Response('original review',{status:200});});assert.equal(await recovered.text(),'original review');assert.equal(reads,1,'No automatic replay');
 const admin=await recoverableExecution(new Request('https://relay.invalid/admin/api/keyboard-usage'),async()=>new Response('upstream exception',{status:500}));assert.equal(admin.status,503);assert.equal((await admin.json()).status,503);
 await assert.rejects(recoverableExecution(new Request('https://relay.invalid/publish?cap=private'),async()=>{throw Error('publication response lost');}));
}finally{console.error=originalError;}
const old=JSON.stringify({text:'preserves',case:'auto',wrapper:'none',suffix:'',effect:'next'});
assert.deepEqual(expandWordArgument(compactWordArgument(old)),JSON.parse(old));
assert.ok(compactWordArgument(old).length<old.length);
assert.equal(compactWordArgument(JSON.stringify({text:'x',case:'auto',wrapper:'quote',suffix:'!',effect:'exact'})),JSON.stringify({text:'x',case:'auto',wrapper:'quote',suffix:'!',effect:'exact'}));
assert.throws(()=>expandWordArgument('["w1","x","auto"]'));
const f=await fixture();
const page=async url=>{const r=await f.request(url,{html:true});assert.equal(r.status,200,r.text.replace(/<[^>]*>/g,' ').slice(-700));return {...r,...parse(r.text,r.url)};};
const href=(p,fn)=>{const l=p.links.find(typeof fn==='string'?l=>l.text===fn:fn);assert.ok(l,'Missing displayed choice '+fn);return l.url;};
try {
 const bootstrap=(await f.request('/service.json')).body;
 const registry=(await f.request(bootstrap.method_registry.version_href)).body;
 assert.equal(registry.registry_version,bootstrap.method_registry.revision,'Bootstrap resolves its declared version');
 assert.equal((await f.request('/methods/2.0.1.json')).body.registry_version,'2.0.1','Historical registry retained');
 for(const method of (await f.request('/methods.json')).body.methods.filter(m=>m.group==='keyboard')) {
  let p=await page(method.href);
  if(method.id==='token-link')p=await page(href(p,l=>l.url.includes('/start/generation/')));
  if(method.id==='frame'){p=await page(href(p,l=>l.url.includes('/start/')&&l.text.includes('Write a sentence')));p=await page(href(p,'Compose exact text'));}
  let wanted='';
  for(const [cp] of COMMON_PUNCTUATION){const ch=String.fromCodePoint(cp);p=await page(href(p,l=>l.text===ch));wanted+=ch;assert.equal(p.draft,wanted,method.id+' literal single-activation punctuation');}
  if(method.id==='frame')p=await page(href(p,l=>l.text.startsWith('Return to')&&l.url.includes('/state/')));
  const reviewHref=href(p,method.id==='token-link'?'Review this exact branch':'Review message');
  const review=await page(reviewHref);assert.equal(review.draft,wanted);
  if(method.id!=='token-link'){
   for(let i=0;i<4;i++){const retry=await page(reviewHref);assert.equal(retry.draft,wanted);assert.equal(href(retry,'Publish this message publicly'),href(review,'Publish this message publicly'),'Retry recovers the same review');}
   p=await page(href(review,'Cancel this review and continue editing'));
  }
  console.log(method.id+': seven literal typography additions and reviewed exact equality passed');
 }
 // Original object-encoded signed routes remain compatible after compact emitters ship.
 const root=await page('/predictive-keyboard/html/chunk-keyboard-3/');
 const legacy=(await import('../token_composer.js'));
 const modern=href(root,l=>l['aria-label']==='Add top word You');const u=new URL(modern);
 const parts=u.pathname.split('/');const state=legacy.decodeCommonWordRouteToken(parts[parts.indexOf('step')+1]);
 const signature=await legacy.signCommonWordRoute({RELAY_CAPABILITY_SECRET:'local-evaluation-only-never-deploy-00000000000000'},'keyboard-action',state,'pick',JSON.stringify({text:'you',case:'auto',wrapper:'none',suffix:'',effect:'next'}));
 parts[parts.indexOf('pick')+1]=encodeURIComponent(JSON.stringify({text:'you',case:'auto',wrapper:'none',suffix:'',effect:'next'}));parts[parts.indexOf('pick')+2]=legacy.encodeCommonWordRouteToken(signature);u.pathname=parts.join('/');u.searchParams.delete('__ru');
 assert.equal((await page(u.href)).draft,'You');
 console.log('Legacy signed word links remain valid.');
}finally{await f.close();}
