import assert from 'node:assert/strict';
import { fixture, parse } from '../tools/local-evaluation.mjs';
import { keyboardIdentity, keyboardErrorStatus, validateMessageText, parseByteBody, KEYBOARD_FOUNDATION_VERSION } from '../keyboard_foundation.js';

assert.equal(keyboardErrorStatus('Active keyboard session limit reached.'), 429);
assert.equal(keyboardErrorStatus('Message limit reached (1200 UTF-8 bytes).'), 413);
assert.deepEqual(validateMessageText('café\t\r\n🌱  '), { body: 'café\t\r\n🌱  ', bytes: 14 });
assert.throws(() => validateMessageText('x'.repeat(1201)), RangeError);
assert.equal(parseByteBody(Uint8Array.of(0xf0,0x9f)).valid, false);
assert.equal(parseByteBody(Uint8Array.of(0)).valid, false);
assert.equal(parseByteBody(new TextEncoder().encode('🌱')).body, '🌱');
assert.equal(keyboardIdentity(new URL('https://relay.invalid/predictive-keyboard/html/word-links/state/test?view=prefix')).interface, 'prefix');

const f = await fixture();
const html = async route => { const res = await f.request(route, { html:true }); return {...res,...parse(res.text,res.url)}; };
const link = (p, predicate) => { const found=p.links.find(typeof predicate==='string'? l=>l.text===predicate:predicate); assert.ok(found,'missing supplied link'); return found.url; };
try {
  const registry=(await f.request('/methods.json')).body;
  for (const method of registry.methods.filter(m=>m.group==='keyboard')) {
    const p=await html(method.href);
    assert.equal(p.headers.get('x-relay-keyboard'),method.backend.interface);
    assert.equal(p.headers.get('x-relay-keyboard-backend'),KEYBOARD_FOUNDATION_VERSION);
    assert.equal(p.headers.get('x-relay-keyboard-adapter'),method.backend.adapter);
  }
  // Prefix's shared action namespace must retain its renderer through conflicts and recovery.
  const root=await html('/predictive-keyboard/html/prefix-keyboard/');
  const child=await html(link(root,l=>l.text==='You'&&/\/step\//.test(l.url)));
  assert.equal(child.headers.get('x-relay-keyboard'),'prefix');
  const alternate=await html(link(root,l=>l.text==='I'&&/\/step\//.test(l.url)));
  const review=await html(link(child,'Review message'));
  const conflict=await html(link(alternate,'Review message'));
  assert.equal(conflict.status,409);
  const recovered=await html(link(conflict,'Return to the original draft review'));
  assert.equal(recovered.headers.get('x-relay-keyboard'),'prefix');
  assert.equal(link(review,'Publish this message publicly'),link(recovered,'Publish this message publicly'));
  // A target hidden after review must not be published to through either adapter.
  const seed=(await f.request('/quick/one-shot?'+new URLSearchParams({message:'Shared publication target', confirm:'publish-public-message', request_id:crypto.randomUUID()}))).body;
  const textRoot=await html('/predictive-keyboard/html/chunk-keyboard-3/?reply_to='+seed.message_id);
  const textChild=await html(link(textRoot,l=>/\/step\/[^/]+\/key\/a\//.test(l.url)));
  const textReview=await html(link(textChild,'Review message'));
  let token=await html('/compose/token/o200k/reply/'+seed.message_id);
  token=await html(link(token,'Start an o200k token composer reply'));
  token=await html(link(token,'Browse exact UTF-8 bytes'));
  token=await html(link(token,l=>l['aria-label']==='Browse bytes 60 through 6f'));
  token=await html(link(token,l=>/\/branch\/[^/]+\/b61\//.test(l.url)));
  const tokenReview=await html(link(token,'Review this exact branch'));
  const armed=await html(link(tokenReview,'Arm publication'));
  await f.sql("INSERT INTO message_moderation (message_id,state,reason,updated_at,updated_by) VALUES (?,'hidden','synthetic test',?,'test')",seed.message_id,Date.now());
  assert.equal((await f.request(link(textReview,'Publish this message publicly'))).status,410);
  assert.equal((await f.request(link(armed,'Publish this message publicly'),{html:true})).status,410);
  await f.sql('DELETE FROM message_moderation WHERE message_id=?',seed.message_id);
  const first=await html(link(armed,'Publish this message publicly'));
  const replay=await html(link(armed,'Publish this message publicly'));
  assert.equal(link(first,l=>/\/message\/IARC-M-/.test(l.url)),link(replay,l=>/\/message\/IARC-M-/.test(l.url)));
  assert.ok(first.links.some(l=>l.url.endsWith('/compose/token/o200k/')),'receipt retains the o200k interface');
  const published=(await f.request(link(first,l=>/\/message\/IARC-M-/.test(l.url)))).body;
  assert.equal(published.body,'a'); assert.equal(published.reply_to,seed.message_id);
  console.log('Keyboard foundation: renderer identity, recovered Prefix review, shared publication boundary and Token receipt metadata passed.');
} finally { await f.close(); }
