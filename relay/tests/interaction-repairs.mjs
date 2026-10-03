import assert from 'node:assert/strict';
import {ordinaryAutomaticCase,repairWordCase,repairWordComma,repairSpacing,keyboardActionNames} from '../keyboard_interaction.js';
import {fixture,parse} from '../tools/local-evaluation.mjs';
assert.equal(ordinaryAutomaticCase('Should'),'should');assert.equal(ordinaryAutomaticCase('The'),'the');
for(const name of ['Alice','John','NASA','OpenAI','UnfamiliarName'])assert.equal(ordinaryAutomaticCase(name),name,'intentional name/acronym case retained');
assert.equal(repairWordCase('Where Should we meet at 3:30?',1,'lower'),'Where should we meet at 3:30?');
assert.equal(repairWordCase('A  Straße\nend',1,'upper'),'A  STRASSE\nend','case expansion preserves surrounding text');
assert.throws(()=>repairWordCase('word',2,'lower'));assert.throws(()=>repairWordCase('word',0,'arbitrary'));
assert.equal(repairWordComma('Yes but not right now.',0,'insert'),'Yes, but not right now.');
assert.equal(repairWordComma('Yes,  but\nnot right now.',0,'remove'),'Yes  but\nnot right now.');
assert.equal(repairSpacing('tofinish 🌱\tend',2,'insert'),'to finish 🌱\tend');
assert.equal(repairSpacing('a  b',1,'remove'),'a b');
assert.equal(repairSpacing('🌱x',1,'insert'),'🌱 x');
assert.throws(()=>repairSpacing('a\tb',1,'remove'));
const labelled=keyboardActionNames('<h2>Keyboard</h2><a href="/key/b">b</a><h2>Find another word</h2><a href="/state/id?prefix=b">b</a>');
assert.match(labelled,/aria-label="Keyboard: b"/);assert.match(labelled,/aria-label="Find word prefix b"/);
const f=await fixture();
const get=async href=>{const r=await f.request(href,{html:true});assert.equal(r.status,200,r.text.slice(-500));return {...r,...parse(r.text,r.url)};};
const choose=(p,name)=>{const l=p.links.find(l=>l.text===name||l['aria-label']===name);assert.ok(l,'Missing supplied '+name);return l.url;};
try{
 const current=(await f.request('/methods.json')).body;
 assert.equal(current.registry_version,'2.0.5');
 assert.equal((await f.request('/methods/2.0.2.json')).body.methods[0].backend.foundation,'relay-keyboard-foundation/1.3.0','historical backend declaration remains frozen');
 for(const method of current.methods.filter(m=>m.group==='keyboard')){
   const overview=await get(method.href);
   assert.ok(overview.links.every(l=>l['aria-label']),'all seven keyboard entry points expose accessible action names');
 }
 for(const entry of ['/predictive-keyboard/html/chunk-keyboard-3/','/predictive-keyboard/html/word-links/','/predictive-keyboard/html/prefix-keyboard/','/predictive-keyboard/html/short-word-keyboard/','/predictive-keyboard/html/span-keyboard/']){
  let p=await get(entry);p=await get(choose(p,'Exact characters and Unicode'));
  const original='Where Should we meet at 3:30?';
  for(const ch of original)p=await get(choose(p,'Append '+(ch===' '?'Space':`U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')}`)));
  p=await get(choose(p,'Repair words and punctuation'));const branch=choose(p,'Make word 2 lower: should');
  const repaired=await get(branch);assert.equal(repaired.draft,'Where should we meet at 3:30?');
  const forged=new URL(branch);forged.pathname=forged.pathname.replace('wordcase%3A1%3Alower','wordcase%3A0%3Alower');
  if(forged.pathname!==new URL(branch).pathname)assert.equal((await f.request(forged.href,{html:true})).status,400,'changed case arguments require their original signature');
  assert.equal((await get(branch)).draft,repaired.draft,'signed case repair replay returns same immutable branch');
  const panel=await get(choose(repaired,'Repair words and punctuation'));
  const comma=await get(choose(panel,'Insert comma after word 1'));assert.equal(comma.draft,'Where, should we meet at 3:30?');
  assert.equal((await get(choose(comma,'Undo last addition'))).draft,repaired.draft);
  const removePanel=await get(choose(comma,'Repair words and punctuation'));
  assert.equal((await get(choose(removePanel,'Remove comma after word 1'))).draft,repaired.draft);
  const spaces=await get(choose(panel,'Repair spacing'));
  const spaceHref=choose(spaces,'Insert space at boundary 2');
  const spaced=await get(spaceHref);assert.equal(spaced.draft,'Wh ere should we meet at 3:30?','middle insertion preserves every suffix character');
  assert.equal((await get(spaceHref)).draft,spaced.draft,'signed spacing replay returns same branch');
  assert.equal((await get(choose(spaced,'Undo last addition'))).draft,repaired.draft);
  let removeSpaces=await get(choose(await get(choose(spaced,'Repair words and punctuation')),'Repair spacing'));
  assert.equal((await get(choose(removeSpaces,'Remove space at character 3'))).draft,repaired.draft);
  const spacedReview=await get(choose(spaced,'Review message'));assert.equal(spacedReview.draft,spaced.draft);
  await get(choose(spacedReview,'Cancel this review and continue editing'));
  const changedSpace=new URL(spaceHref);changedSpace.pathname=changedSpace.pathname.replace('spacing%3A2%3Ainsert','spacing%3A1%3Ainsert');
  assert.notEqual(changedSpace.href,spaceHref);assert.equal((await f.request(changedSpace.href,{html:true})).status,400,'spacing offset cannot be changed without the original signature');
  const undo=await get(choose(repaired,'Undo last addition'));assert.equal(undo.draft,original,'undo restores exact earlier full body');
  const review=await get(choose(repaired,'Review message'));assert.equal(review.draft,repaired.draft,'review sees exact case-corrected draft');
  const cancelled=await get(choose(review,'Cancel this review and continue editing'));assert.match(cancelled.text,/preserved/);
  console.log(entry+': earlier case correction preserves suffix, replay, undo and review');
 }
 assert.equal((await f.request('/poll')).body.returned_count,0,'repair tests never publish');
}finally{await f.close();}
