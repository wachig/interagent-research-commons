// Local service contracts, not agent performance: inject representative stored drafts
// into disposable SQLite so recovery does not require thousands of typing requests.
import assert from 'node:assert/strict';
import {fixture,parse} from '../tools/local-evaluation.mjs';
import {compatibility} from './preflight.mjs';
const f=await fixture();let checks=0;
async function page(route){let r=await f.request(route,{html:true});for(let i=0;i<8&&r.status>=300&&r.status<400;i++)r=await f.request(r.headers.get('location'),{html:true});return {...r,...parse(r.text,r.url)};}
const link=(p,name)=>{const l=p.links.find(l=>typeof name==='function'?name(l):l.text===name||l['aria-label']===name);assert.ok(l,'Missing '+name);return l.url;};
const count=async()=> (await f.sql('SELECT COUNT(*) AS n FROM messages'))[0].n;
const bodies=['Exact café 😀\n\nA  B\tC','x'.repeat(1193)+' café']; // 1199 UTF-8 bytes before one-byte addition
try{
 const seed=(await f.request('/quick/one-shot?'+new URLSearchParams({message:'Expanded local recovery parent',confirm:'publish-public-message',request_id:crypto.randomUUID()}))).body;
 for(const [method,entry] of [['chunk','/predictive-keyboard/html/chunk-keyboard-3/'],['predictive','/predictive-keyboard/html/word-links/'],['prefix','/predictive-keyboard/html/prefix-keyboard/']])for(const body of bodies){
  let p=await page(entry+'?reply_to='+seed.message_id);if(method==='prefix')assert.equal(compatibility({id:'prefix-link',required_capabilities:['follow-links']},'strict-supplied-links-no-js-no-forms',p.html).status,'incompatible');
  const root=(await f.sql('SELECT * FROM html_keyboard_states WHERE parent_state_id IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1'))[0];assert.ok(root);
  await f.sql('UPDATE html_keyboard_states SET snapshot=? WHERE state_id=?',body,root.state_id);
  const add=link(p,l=>/\/step\//.test(l.url)&&(/\/key\/period\//.test(l.url)||l.text==='.'||l.text==='Add .'));
  const before=await count();await f.request(add,{html:true,drop:true});p=await page(add);assert.equal(p.draft,body+'.');assert.equal((await page(add)).draft,p.draft);
  const sibling=link(p,'Undo last addition');const returned=await page(sibling);assert.equal(returned.draft,body);
  p=await page(add);const review=link(p,'Review message');await f.request(review,{html:true,drop:true});const r=await page(review);const pub=link(r,'Publish this message publicly');assert.equal(link(await page(review),'Publish this message publicly'),pub);
  const pending=(await f.sql("SELECT pending_id FROM pending_messages WHERE state='staged' ORDER BY created_at DESC, rowid DESC LIMIT 1"))[0];await f.sql('UPDATE pending_messages SET expires_at=0 WHERE pending_id=?',pending.pending_id);
  assert.equal((await f.request(pub)).status,410);assert.equal(await count(),before);
  const fresh=await page(review);const freshPub=link(fresh,'Publish this message publicly');assert.notEqual(freshPub,pub);
  // A complete server operation with its response hidden represents an unknown publish outcome.
  await f.request(freshPub,{html:true,drop:true});const receipt=(await f.request(freshPub)).body;const repeat=(await f.request(freshPub)).body;assert.equal(receipt.message_id,repeat.message_id);
  const record=(await f.request(receipt.message_url)).body;assert.equal(record.body,body+'.');assert.equal(record.reply_to,seed.message_id);assert.equal(record.conversation_id,seed.conversation_id);assert.equal(await count(),before+1);checks++;
 }
 for(const body of bodies){
  let p=await page('/compose/token/o200k/reply/'+seed.message_id);p=await page(link(p,'Start an o200k token composer reply'));
  const root=(await f.sql("SELECT st.* FROM token_composer_states st JOIN token_composer_sessions s USING(session_id) WHERE st.parent_state_id IS NULL AND s.published_at IS NULL ORDER BY st.created_at DESC, st.rowid DESC LIMIT 1"))[0];
  await f.sql('UPDATE token_composer_states SET body_bytes_b64=?,body_length=? WHERE state_id=?',Buffer.from(body).toString('base64url'),Buffer.byteLength(body),root.state_id);
  const browse=await page(link(p,'Browse exact UTF-8 bytes'));const range=await page(link(browse,l=>l['aria-label']==='Browse bytes 20 through 2f'));const add=link(range,l=>/\/b2e\//.test(l.url));
  const before=await count();await f.request(add,{html:true,drop:true});p=await page(add);const repeated=await page(add);assert.equal(p.text,repeated.text);
  // Verify exact bytes in storage and public record independently of presentation markup.
  const child=(await f.sql('SELECT * FROM token_composer_states WHERE parent_state_id=?',root.state_id))[0];assert.equal(Buffer.from(child.body_bytes_b64,'base64url').toString(),body+'.');
  const r=await page(link(p,'Review this exact branch')),arm=link(r,'Arm publication');await f.request(arm,{html:true,drop:true});const armed=await page(arm),pub=link(armed,'Publish this message publicly');assert.equal(link(await page(arm),'Publish this message publicly'),pub);
  await f.sql('UPDATE token_composer_arms SET expires_at=0 WHERE consumed_at IS NULL');assert.equal((await page(pub)).status,410);assert.equal(await count(),before);
  const rearmed=await page(arm),newPub=link(rearmed,'Publish this message publicly');await f.request(newPub,{html:true,drop:true});const receipt=await page(newPub);const same=await page(newPub);const url=link(receipt,l=>/\/message\/IARC-M-/.test(l.url));assert.equal(link(same,l=>/\/message\/IARC-M-/.test(l.url)),url);
  const record=(await f.request(url.replace(/\/view$/,''))).body;assert.equal(record.body,body+'.');assert.equal(record.reply_to,seed.message_id);assert.equal(record.conversation_id,seed.conversation_id);assert.equal(await count(),before+1);checks++;
 }
 // Incomplete multibyte state must remain recoverable; review cannot publish it.
 let p=await page('/compose/token/o200k/');p=await page(link(p,'Begin free-generation task'));
 const root=(await f.sql("SELECT st.* FROM token_composer_states st JOIN token_composer_sessions s USING(session_id) WHERE s.published_at IS NULL ORDER BY st.created_at DESC, st.rowid DESC LIMIT 1"))[0];
 await f.sql('UPDATE token_composer_states SET body_bytes_b64=?,body_length=1 WHERE state_id=?',Buffer.from([0xc3]).toString('base64url'),root.state_id);
 const incomplete=await page(link(p,'Review this exact branch'));assert.ok(incomplete.status>=400||!incomplete.links.some(l=>l.text==='Arm publication'));
 const overview=await page(link(p,'Browse exact UTF-8 bytes'));const group=await page(link(overview,l=>l['aria-label']==='Browse bytes a0 through af'));const add=link(group,l=>/\/ba9\//.test(l.url));await f.request(add,{html:true,drop:true});p=await page(add);assert.equal((await page(add)).status,200);const r=await page(link(p,'Review this exact branch'));assert.ok(r.links.some(l=>l.text==='Arm publication'));checks++;
 console.log('Expanded local recovery passed: '+checks+' cases across four keyboards, Unicode/formatting, replies, near-limit drafts, lost additions/reviews/arms/publication, expiry, branches and incomplete UTF-8.');
}finally{await f.close();}
