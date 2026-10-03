import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fixture,parse} from '../tools/local-evaluation.mjs';
import {frameWordAddition} from '../frame_suggestions.js';
assert.equal(frameWordAddition('Keep  Hel','Hello','complete'),'Keep  Hello');
assert.equal(frameWordAddition('NASA','world','next','NASA'),'NASA world');
assert.equal(frameWordAddition('odd','unrelated','complete'),null);
assert.equal(frameWordAddition('Keep\n','word','next','Keep\n'),'Keep\nword');
const f=await fixture();
const get=async url=>{const r=await f.request(url,{html:true});assert.equal(r.status,200,r.text.slice(-400));return {...r,...parse(r.text,r.url)};};
const choose=(p,name)=>{const l=p.links.find(l=>l.text===name||l['aria-label']===name);assert.ok(l,'Missing '+name);return l.url;};
try{
 const samples=[];let p=await get('/predictive-keyboard/html/chunk-keyboard-3/');
 for(const name of ['initial','co','con']){
  if(name!=='initial')p=await get(choose(p,'Set START to '+name));
  const prefix='/predictive-keyboard/html/chunk-keyboard-3/';
  const expanded=p.text.replaceAll('href="../',`href="${prefix}`);
  assert.ok(JSON.stringify(parse(expanded,p.url).links.map(l=>l.url))===JSON.stringify(p.links.map(l=>l.url)),'compact routes preserve every resolved URL');
  assert.ok(p.text.includes('START'));
  const nextWords=p.links.filter(l=>l['aria-label']?.startsWith('Add top word ')).map(l=>l['aria-label'].slice(13));
  const candidates=p.links.filter(l=>l['aria-label']?.startsWith('Add ')&&!l['aria-label'].startsWith('Add top word ')).map(l=>l['aria-label'].slice(4));
  assert.ok(!nextWords.some(w=>candidates.includes(w)),'no duplicate contextual/candidate choice');
  samples.push({name,bytes:Buffer.byteLength(p.text),links:p.links.length,path_encoding_saved_bytes:Buffer.byteLength(expanded)-Buffer.byteLength(p.text)});
 }
 // Non-default insertion/case choices must survive read-only filtering.
 p=await get(choose(p,'Append exact spelling'));
 p=await get(choose(p,'Uppercase'));
 p=await get(choose(p,'Restart search'));
 p=await get(choose(p,'Set START to co'));
 assert.ok(p.links.some(l=>l['aria-label']?.startsWith('Add ')&&l['aria-label']===l['aria-label'].toUpperCase().replace('ADD ','Add ')),'uppercase is retained');
 assert.match(p.text,/Append exact spelling · Uppercase/);
 console.log('Chunk page samples: '+JSON.stringify(samples));
 await writeFile('/private/tmp/relay-phase3-after.json',JSON.stringify(samples));
 p=await get('/predictive-keyboard/html/frame-keyboard/');
 p=await get(choose(p,'Other · Write a sentence from exact characters'));
 assert.match(p.text,/Word suggestions/);
 p=await get(choose(p,'Compose exact text'));
 for(const ch of 'Hel')p=await get(choose(p,ch));
 const complete=p.links.find(l=>l.text.startsWith('Complete current word: '));assert.ok(complete,'typed prefix has supplied completions');
 const original=p.draft;const completed=await get(complete.url);
 assert.ok(completed.draft.startsWith(original)&&completed.draft.length>original.length,'completion preserves typed prefix');
 assert.match(completed.text,/ASCII, punctuation, whitespace/,'suggestion stays in literal lane');
 assert.equal((await get(complete.url)).draft,completed.draft,'same immutable replay');
 const back=await get(choose(completed,'Return to frame'));
 const undo=await get(choose(back,'Undo last change'));assert.equal(undo.draft,original);
 const next=undo.links.find(l=>l.text.startsWith('Add next word: '));assert.ok(next);
 const added=await get(next.url);assert.ok(added.draft.startsWith(original+' '),'next word preserves existing typed text with separator');
 assert.equal((await f.request('/methods/2.0.3.json')).body.registry_version,'2.0.3');
 assert.equal((await f.request('/poll')).body.returned_count,0,'repair tests never publish');
 console.log('Frame supplied completions, separate next words, literal-lane return, immutable replay and undo passed.');
}finally{await f.close();}
