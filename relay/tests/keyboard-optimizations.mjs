import assert from 'node:assert/strict';
import {fixture,parse,decode} from '../tools/local-evaluation.mjs';
import {extract} from '../benchmark/recorder.mjs';
import {parseByteBody} from '../keyboard_foundation.js';
import {collectPredictionResults} from '../prediction_results.js';
// Resource ownership is checked on success and exceptions, independently of the model.
assert.equal(parseByteBody(new TextEncoder().encode("\uFEFFliteral")).body,"\uFEFFliteral");
let releases=0;
const rows={size:()=>2,get:i=>({prediction:i?'"world"':'hello',probability:.2}),delete:()=>releases++};
assert.equal(collectPredictionResults(rows,2).map(c=>c.text).join(' '),'hello world');
assert.throws(()=>collectPredictionResults({...rows,get:()=>{throw Error('native read failed')}},2));assert.equal(releases,2);
const f=await fixture();let requests=0;const outcomes=[];
async function page(route){requests++;const r=await f.request(route,{html:true});assert.equal(r.status,200,r.text.replace(/<[^>]*>/g,'').slice(-600));return {...r,...parse(r.text,r.url)};}
const choice=(p,fn)=>{const l=p.links.find(typeof fn==='string'?l=>l.text===fn:fn);assert.ok(l,'Missing supplied link');return l.url;};
async function textGlyph(p,cp){const label=cp===9?'Tab':cp===10?'Line feed':cp===13?'Carriage return':cp===32?'Space':`U+${cp.toString(16).toUpperCase().padStart(4,'0')}`;let l=p.links.find(l=>l['aria-label']==='Append '+label);if(!l){p=await page(choice(p,'Exact characters and Unicode'));if(cp>=128){const hex=cp.toString(16).padStart(6,'0');for(const size of [2,3,4])p=await page(choice(p,l=>new URL(l.url).pathname.endsWith('/'+hex.slice(0,size))));}l=p.links.find(l=>l['aria-label']==='Append '+label);}assert.ok(l);return page(l.url);}
try{
 const seed=(await f.request('/quick/one-shot?'+new URLSearchParams({message:'Synthetic optimization reply target',confirm:'publish-public-message',request_id:crypto.randomUUID()}))).body;
 const wanted='Relay: café 🌱\tA  \n';
 for(const [id,entry] of [['chunk','/predictive-keyboard/html/chunk-keyboard-3/'],['predictive','/predictive-keyboard/html/word-links/'],['prefix','/predictive-keyboard/html/prefix-keyboard/']]){
  let p=await page(entry+'?reply_to='+seed.message_id);p=await page(choice(p,'Exact characters and Unicode'));
  for(const ch of wanted){p=await textGlyph(p,ch.codePointAt(0));if(ch==='🌱'){const range=new URL(p.url).searchParams.get('range');const original=p.draft;const erase=await page(choice(p,'Backspace'));assert.equal(erase.draft,[...original].slice(0,-1).join(''));assert.equal(new URL(erase.url).searchParams.get('range'),range);p=await page(choice(erase,'Undo last addition'));assert.equal(p.draft,original);}}assert.equal(p.draft,wanted);assert.equal(p.headers.get('x-relay-keyboard'),id);
  // Corrections stay inside the exact lane, including its Unicode range and identity.
  const beforeCorrection=p.draft;
  const erased=await page(choice(p,'Backspace'));assert.equal(erased.draft,beforeCorrection.slice(0,-1));assert.equal(erased.headers.get('x-relay-keyboard'),id);
  const restored=await page(choice(erased,'Undo last addition'));assert.equal(restored.draft,beforeCorrection);p=restored;
  const review=await page(choice(p,'Review message'));const pub=choice(review,'Publish this message publicly');const receipt=(await f.request(pub)).body;assert.equal((await f.request(pub)).body.message_id,receipt.message_id);
  const record=(await f.request('/message/'+receipt.message_id)).body;assert.equal(record.body,wanted);assert.equal(record.reply_to,seed.message_id);assert.equal(record.conversation_id,seed.conversation_id);
  outcomes.push(id+' literal Unicode/formatting publication and receipt replay');
 }
 let p=await page('/compose/token/o200k/reply/'+seed.message_id);p=await page(choice(p,'Start an o200k token composer reply'));p=await page(choice(p,'Browse exact UTF-8 bytes'));
 const ascii='abc  \t\nZ';const start=requests;
 for(const ch of ascii){const label=ch===' '?'Space':ch==='\t'?'Tab':ch==='\n'?'LF':ch;p=await page(choice(p,l=>l['aria-label']==='Append '+label));}
 assert.equal(requests-start,8,'Each ASCII character costs one supplied link activation after entering the lane');assert.equal(p.draft,ascii);
 for(const byte of new TextEncoder().encode('é🌱')){const group=(byte>>4).toString(16);let l=p.links.find(l=>new URL(l.url).pathname.includes(`/b${byte.toString(16)}/`));if(!l){p=await page(choice(p,l=>l['aria-label']===`Browse bytes ${group}0 through ${group}f`));l=p.links.find(l=>new URL(l.url).pathname.includes(`/b${byte.toString(16)}/`));}assert.ok(l);p=await page(l.url);}
 assert.equal(p.draft,ascii+'é🌱');const review=await page(choice(p,'Review this exact branch'));assert.deepEqual((await extract(review.text)).drafts,[ascii+'é🌱']);
 const armed=await page(choice(review,'Arm publication'));const pub=choice(armed,'Publish this message publicly');const first=await page(pub);const replay=await page(pub);assert.equal(choice(first,l=>/\/message\/IARC-M-/.test(l.url)),choice(replay,l=>/\/message\/IARC-M-/.test(l.url)));
 const body=(await f.request(choice(first,l=>/\/message\/IARC-M-/.test(l.url)))).body;assert.equal(body.body,ascii+'é🌱');assert.equal(body.reply_to,seed.message_id);outcomes.push('Token literal ASCII and UTF-8 publication; one activation per ASCII character');
 // Search fragments must never masquerade as message drafts to the existing extractor.
 p=await page('/compose/token/o200k/');p=await page(choice(p,'Start blank draft'));p=await page(choice(p,l=>/\/browse\/prefix\/[^/]+$/.test(new URL(l.url).pathname)));p=await page(choice(p,l=>new URL(l.url).pathname.endsWith('/group/letter')));p=await page(choice(p,l=>/^[“"]?r[”"]?$/.test(l.text)));
 assert.equal((await extract(p.text)).drafts.length,1);outcomes.push('Token search prefix is separate from current draft');
 const jumps=await page(choice(p,l=>/^Browse all .* jumps$/.test(l.text)&&new URL(l.url).pathname.endsWith('/jumps/3')));assert.equal(jumps.links.filter(l=>l.class==='choice').length,64,'Jump pages are bounded');const jumpNext=await page(choice(jumps,'Next jump page'));assert.equal(new URL(choice(jumpNext,'Previous jump page')).searchParams.get('page'),'0');assert.equal(jumpNext.draft,jumps.draft);outcomes.push('Token jump pages bounded and draft preserved');
 // Candidate rendering is bounded without dropping spelling coverage.
 let root=await page('/predictive-keyboard/html/chunk-keyboard-3/');p=await page(choice(root,l=>l['aria-label']==='Set START to co'));p=await page(choice(p,l=>l['aria-label']==='Set START to con'));
 assert.ok(p.links.filter(l=>l['aria-label']?.startsWith('Add ')&&!l['aria-label']?.startsWith('Add top word ')&&new URL(l.url).pathname.includes('/pick/')).length<=40);
 const next=await page(choice(p,'Next candidate page'));assert.ok(new URL(choice(next,'Previous candidate page')).searchParams.get('start')==='con');outcomes.push('Chunk candidate pages bounded and filters preserved');
 // A new prefix-result word must preserve an explicitly typed ending.
 for(const entry of ['/predictive-keyboard/html/word-links/','/predictive-keyboard/html/prefix-keyboard/']) {
   let typed=await page(entry);typed=await page(choice(typed,'Exact characters and Unicode'));
   for(const ch of 'needs') typed=await textGlyph(typed,ch.codePointAt(0));
   typed=await page(choice(typed,'Return to word choices'));
   const nextLabels=typed.links.filter(l=>l['aria-label']?.startsWith('Add top word ')).map(l=>l['aria-label']);
   const spaced=await page(choice(typed,l=>/\/key\/space\//.test(l.url)));
   assert.deepEqual(spaced.links.filter(l=>l['aria-label']?.startsWith('Add top word ')).map(l=>l['aria-label']),nextLabels,'Next suggestions use the same completed-word context with or without a stored trailing space');
   if(!entry.includes('prefix-keyboard')) {
     const button=typed.text.match(/name="pick" value="([^"]+)"/u);assert.ok(button);
     const form=typed.text.match(/<form method="get" action="([^"]+)" class="compose-form"/u);assert.ok(form);
     const selected=decode(button[1]);const candidate=selected.split(':').slice(1,-1).join(':');
     const next=new URL(decode(form[1]),typed.url);next.searchParams.set('pick',selected);next.searchParams.set('effect','next');next.searchParams.set('case','as-is');
     assert.equal((await page(next)).draft,'needs '+candidate);
     next.searchParams.set('effect','complete');assert.equal((await page(next)).draft,candidate);
     next.searchParams.set('effect','exact');assert.equal((await page(next)).draft,'needs'+candidate);
   }

   if(entry.includes('prefix-keyboard')) {
     // GET forms are a separate capability; submit the displayed form's START input.
     const route=new URL(typed.url);route.searchParams.set('start_w','wo');route.searchParams.set('end_r','rk');typed=await page(route);
   } else {
     typed=await page(choice(typed,l=>l.text==='w'&&new URL(l.url).searchParams.get('prefix')==='w'));
     typed=await page(choice(typed,l=>new URL(l.url).searchParams.get('prefix')==='wo'));
     for(const prefix of ['wor','work']) { if(typed.links.some(l=>l.text==='Add work'&&new URL(l.url).pathname.includes('/pick/'))) break; typed=await page(choice(typed,l=>new URL(l.url).searchParams.get('prefix')===prefix)); }
   }
   const workLink=typed.links.find(l=>['work','Add work'].includes(l.text)&&new URL(l.url).pathname.includes('/pick/'));assert.ok(workLink,JSON.stringify({entry,choices:typed.links.filter(l=>l['aria-label']?.startsWith('Add ')).map(l=>l['aria-label'])}));const added=await page(workLink.url);assert.equal(added.draft,'needs work');
 }
 outcomes.push('Predictive and Prefix browsing preserve typed endings');
 // The whole-word Token lane is an intersection of genuine tokens and sourced spelling.
 let words=await page('/compose/token/o200k/');words=await page(choice(words,'Start blank draft'));
 words=await page(choice(words,l=>/\/browse\/prefix\/[^/]+$/.test(new URL(l.url).pathname)));
 words=await page(choice(words,l=>new URL(l.url).pathname.endsWith('/group/letter')));
 words=await page(choice(words,l=>/^[“"]?t[”"]?$/.test(l.text)));
 words=await page(choice(words,l=>new URL(l.url).pathname.endsWith('/dGU')));
 assert.match(words.text,/Whole-word token choices/);assert.match(words.text,/SUBTLEX-US usage order/);
 const full=await page(choice(words,l=>l['aria-label']==='Add tell to the draft'));assert.equal(full.draft,'tell');
 outcomes.push('Token whole-word acceleration appends genuine token bytes');
 // Repeated model-backed requests exercise result disposal in a warm isolate.
 root=await page('/predictive-keyboard/html/word-links/');assert.ok(root.links.some(l=>l['aria-label']?.startsWith('Add top word ')),'Predictive exposes direct word suggestions');const typed=choice(root,l=>/\/key\/a\//.test(l.url));
 for(let i=0;i<100;i++){const warm=await page(typed);assert.equal(warm.draft,'a');}outcomes.push('100 warm model-backed requests completed without an HTTP failure');
 console.log('Keyboard optimization contracts passed: '+outcomes.join('; '));
}finally{await f.close();}
