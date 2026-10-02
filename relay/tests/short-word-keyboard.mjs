import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fixture,parse} from '../tools/local-evaluation.mjs';
import inventory from '../short_words-1.0.0.json' with {type:'json'};
import {SHORT_WORD_SET,withoutShortWords} from '../short_word_keyboard.js';
const original=await readFile(new URL('../short_words-1.0.0.json',import.meta.url),'utf8');
execFileSync('python3',['relay/semantic/build-short-words.py']);
assert.equal(await readFile(new URL('../short_words-1.0.0.json',import.meta.url),'utf8'),original,'The inventory reproduces byte-for-byte');
assert.equal(SHORT_WORD_SET.size,100);assert.ok(inventory.words.every(w=>/^[a-z]{2,3}$/u.test(w)));assert.ok(SHORT_WORD_SET.has('hi'));
assert.deepEqual(withoutShortWords([{text:'THE'},{text:'research'},{text:'You'}]),[{text:'research'}]);
const f=await fixture();
const page=async route=>{const r=await f.request(route,{html:true});assert.equal(r.status,200,r.text.slice(-700));return {...r,...parse(r.text,r.url)};};
const link=(p,predicate)=>{const found=p.links.find(typeof predicate==='string'?l=>l.text===predicate:predicate);assert.ok(found,'missing supplied link');return found.url;};
const key=(p,k)=>link(p,l=>new URL(l.url).pathname.includes(`/key/${encodeURIComponent(k)}/`)||new URL(l.url).pathname.includes(`/key/${encodeURIComponent("next-letter:"+k)}/`));
try{
 const seed=(await f.request('/quick/one-shot?'+new URLSearchParams({message:'Synthetic short-word reply parent',confirm:'publish-public-message',request_id:crypto.randomUUID()}))).body;
 const root=await page('/predictive-keyboard/html/short-word-keyboard/?reply_to='+seed.message_id);
 assert.equal(root.headers.get('x-relay-keyboard'),'short-word');assert.equal(root.links.filter(l=>l['aria-label']?.startsWith('Add short word ')).length,100);
 assert.ok(!root.links.some(l=>l['aria-label']==='Backspace'),'Empty Backspace is visibly disabled');
 assert.ok(!root.links.some(l=>l.text==='Review message'));
 const assertFiltered=p=>{for(const l of p.links.filter(l=>l['aria-label']?.startsWith('Add top word ')||l['aria-label']?.startsWith('Complete candidate ')))assert.ok(!SHORT_WORD_SET.has(l.text.toLowerCase()));};assertFiltered(root);
 let p=await page(key(root,'t'));p=await page(link(p,l=>l['aria-label']==='Complete short word The'));assert.equal(p.draft,'The');
 p=await page(key(p,'backspace'));assert.equal(p.draft,'Th');p=await page(link(p,'Undo last addition'));assert.equal(p.draft,'The');
 const selected=p;
 const nextLetter=key(selected,'c');let spaced=await page(nextLetter);assert.equal(spaced.draft,'The c');assert.equal((await page(nextLetter)).draft,'The c','Retry reuses the same boundary');
 spaced=await page(key(spaced,'a'));assert.equal(spaced.draft,'The ca');spaced=await page(link(spaced,l=>l['aria-label']==='Complete short word can'));assert.equal(spaced.draft,'The can');
 let edited=await page(key(selected,'backspace'));edited=await page(key(edited,'e'));assert.equal(edited.draft,'The','Backspace permits literal word editing');
 let punct=await page(key(selected,'comma'));assert.equal(punct.draft,'The,');
 let explicit=await page(key(selected,'space'));explicit=await page(key(explicit,'c'));assert.equal(explicit.draft,'The c','Explicit Space is not duplicated');
 let exact=await page(link(selected,'Exact characters and Unicode'));exact=await page(link(exact,l=>l['aria-label']==='Append U+0063'));assert.equal(exact.draft,'Thec','Exact lane remains literal');
 const cleared=await page(link(p,'Clear draft'));assert.equal(cleared.draft,'');assert.equal(cleared.headers.get('x-relay-keyboard'),'short-word');assert.equal((await page(link(cleared,'Undo last addition'))).draft,'The');
 let marked=await page(link(root,l=>l['aria-label']==='?123'));marked=await page(key(marked,'@'));marked=await page(link(marked,l=>l['aria-label']==='Add short word the'));assert.equal(marked.draft,'@the');
 p=root;for(const ch of 'rel')p=await page(key(p,ch));assertFiltered(p);
 for(let i=0;i<10&&!p.links.some(l=>l['aria-label']==='Complete candidate Relay');i++)p=await page(link(p,'Next candidate page'));
 const complete=await page(link(p,l=>l['aria-label']==='Complete candidate Relay'));assert.equal(complete.draft,'Relay');
 p=await page(key(root,'c'));const next=await page(link(p,'Next candidate page'));assertFiltered(next);assert.equal(next.draft,'c');assert.equal(next.links.filter(l=>l['aria-label']?.startsWith('Complete candidate ')).length,20);
 p=await page(key(complete,'space'));for(const ch of 'nee')p=await page(key(p,ch));p=await page(key(p,'backspace'));assert.equal(p.draft,'Relay ne');p=await page(link(p,l=>l['aria-label']==='Complete candidate needs'));assert.equal(p.draft,'Relay needs');
 p=await page(link(root,'Exact characters and Unicode'));const wanted='Relay: café 🌱\tA  \n';
 for(const ch of wanted){const cp=ch.codePointAt(0);const label=cp===9?'Tab':cp===10?'Line feed':cp===32?'Space':`U+${cp.toString(16).toUpperCase().padStart(4,'0')}`;
 if(!p.links.some(l=>l['aria-label']==='Append '+label)){p=await page(link(p,'Exact characters and Unicode'));if(cp>=128){const hex=cp.toString(16).padStart(6,'0');for(const length of [2,3,4])p=await page(link(p,l=>new URL(l.url).pathname.endsWith('/'+hex.slice(0,length))));}}
 p=await page(link(p,l=>l['aria-label']==='Append '+label));assert.equal(p.headers.get('x-relay-keyboard'),'short-word');}
 assert.equal(p.draft,wanted);const reviewed=await page(link(p,'Review message'));const pub=link(reviewed,'Publish this message publicly');const receipt=(await f.request(pub)).body;assert.equal((await f.request(pub)).body.message_id,receipt.message_id);const record=(await f.request('/message/'+receipt.message_id)).body;assert.equal(record.body,wanted);assert.equal(record.reply_to,seed.message_id);assert.equal(record.conversation_id,seed.conversation_id);
 // Existing key layouts gain actual one-character Backspace, not word undo.
 for(const entry of ['/predictive-keyboard/html/word-links/','/predictive-keyboard/html/prefix-keyboard/','/predictive-keyboard/html/chunk-keyboard-3/']){
 let q=await page(entry);q=await page(link(q,'Exact characters and Unicode'));for(const cp of [97,0x1f331]){
 if(cp>127){q=await page(link(q,'Exact characters and Unicode'));for(const prefix of ['01','01f','01f3'])q=await page(link(q,l=>new URL(l.url).pathname.endsWith('/'+prefix)));}
 q=await page(link(q,l=>l['aria-label']==='Append '+(cp===97?'U+0061':'U+1F331')));}
 q=await page(link(q,'Return to word choices'));q=await page(link(q,l=>/backspace\//.test(l.url)));assert.equal(q.draft,'a');assert.ok(q.links.some(l=>l.text==='Undo last addition'));assert.ok(q.links.some(l=>l.text==='Clear draft'));assert.ok(q.links.some(l=>l.text==='Review message'));
 }
 console.log('Short Word: reproducible inventory; distinct suggestions; typed completion; paging; shared correction; literal Unicode reply/publication and replay passed.');
}finally{await f.close();}
