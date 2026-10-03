import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fixture,parse} from '../tools/local-evaluation.mjs';
import {resolvedPick,consumeResolvedPick} from '../span_contract.js';
import {isPresentableSpan,isPresentablePhrase} from '../phrase_safety.js';
import {keyboardIdentity} from '../keyboard_foundation.js';
import {spanPredictions} from '../span_keyboard.js';
const dir=new URL('../assets/span-keyboard/1.0.0/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',dir)));
const nodes=[],spans=[];
for(const [name,info] of Object.entries(manifest.files)){
 const b=await readFile(new URL(name,dir));assert.equal(createHash('sha256').update(b).digest('hex'),info.sha256);assert.equal(b.length,info.bytes);
 if(!name.endsWith('.json'))continue;
 const data=JSON.parse(b);if(name.startsWith('nodes/'))nodes.push(...data);if(name.startsWith('spans/'))spans.push(...data);
}
// File names sort lexically in the manifest; recover IDs by parent/prefix graph and bucket indices.
for(let i=0;i<Math.ceil(manifest.node_count/128);i++)nodes.splice(i*128,128,...JSON.parse(await readFile(new URL(`nodes/${i}.json`,dir))));
const lexdir=new URL('../assets/semantic-lexicon/',import.meta.url);const lex=JSON.parse(await readFile(new URL('manifest.json',lexdir)));
const expected=new Set();for(const shard of lex.shards)for(const w of JSON.parse(await readFile(new URL(shard.path,lexdir))))expected.add(w);
const reachable=new Set(),found=new Set(),stack=[0];while(stack.length){const id=stack.pop();if(reachable.has(id))continue;reachable.add(id);const n=nodes[id];for(const w of n.words)found.add(w);assert.ok(n.routes.length<=48);for(const [child,p] of n.routes){assert.equal(nodes[child].p,p);assert.ok(p.startsWith(n.p)&&[...p].length>[...n.p].length);stack.push(child);}}
assert.equal(reachable.size,manifest.node_count);assert.deepEqual(found,expected);assert.equal(found.size,147537);
assert.ok(spans.every(r=>isPresentableSpan(r.text)));assert.ok(spans.some(r=>r.text.split(' ').length===4));
assert.equal(isPresentableSpan('the world of cheap'),false);assert.equal(isPresentableSpan('world of cheap escorts'),false);assert.equal(isPresentablePhrase('at the same time'),false,'Historical two-word contract is unchanged');
const autoCase=(s,p)=>!p?s[0].toUpperCase()+s.slice(1):s;
const contract=resolvedPick({kind:'span',text:'could you',draft:'Please',reference:'sp1:1',autoCase});assert.equal(contract.a,' could you');assert.equal(consumeResolvedPick(JSON.stringify(contract),'Please').added,' could you');
assert.throws(()=>consumeResolvedPick(JSON.stringify(contract),'a'.repeat(1199)),/limit/);
const decomposed=resolvedPick({kind:'word',text:'cafe\u0301',draft:'@',effect:'exact',reference:'lx1',autoCase});assert.equal(consumeResolvedPick(JSON.stringify(decomposed),'@').added,'cafe\u0301');
assert.throws(()=>consumeResolvedPick(JSON.stringify({...contract,extra:true}),'Please'),/contract/);assert.throws(()=>consumeResolvedPick(JSON.stringify({...contract,v:'span-pick-2'}),'Please'),/contract/);assert.throws(()=>consumeResolvedPick(JSON.stringify({...contract,n:1}),'Please'),/remove/);
assert.equal(keyboardIdentity(new URL('https://relay.interagentresearchcommons.org/predictive-keyboard/html/word-links/state/a?view=span')).interface,'span');
const env={ASSETS:{}};let calls=0;const st={state_id:'private',session_expires_at:Date.now()+10000};const predict=async()=>{calls++;return [{text:'could'}];};await spanPredictions(env,st,predict);await spanPredictions(env,st,predict);assert.equal(calls,1);await assert.rejects(spanPredictions(env,{state_id:'other',session_expires_at:st.session_expires_at},async()=>{throw Error('predictor unavailable');}),/unavailable/);
const f=await fixture();
const timings=[];let maxLinks=0;
const page=async route=>{const start=performance.now();const r=await f.request(route,{html:true});assert.equal(r.status,200,r.text.slice(-900));const parsed=parse(r.text,r.url);maxLinks=Math.max(maxLinks,parsed.links.length);timings.push(performance.now()-start);return {...r,...parsed};};
const link=(p,test)=>{const l=p.links.find(typeof test==='string'?l=>l.text===test:test);assert.ok(l,'Missing supplied link '+test);return l.url;};
const pick=(l)=>{try{const bits=new URL(l.url).pathname.split('/');return bits.includes('pick')?JSON.parse(decodeURIComponent(bits[bits.indexOf('pick')+1])):null;}catch{return null;}};
const key=(p,k)=>link(p,l=>new URL(l.url).pathname.includes(`/key/${encodeURIComponent(k)}/`));
try{
 const parent=(await f.request('/quick/one-shot?'+new URLSearchParams({message:'Synthetic Span reply parent',confirm:'publish-public-message',request_id:crypto.randomUUID()}))).body;
 const root=await page('/predictive-keyboard/html/span-keyboard/?reply_to='+parent.message_id);
 assert.equal(root.headers.get('x-relay-keyboard'),'span');assert.ok(!/<(?:script|form|input|textarea)\b/i.test(root.text));assert.ok(root.links.length<=160);
 assert.equal((await f.request('/predictive-keyboard/html/span-keyboard/',{method:'HEAD',html:true})).status,405);
 const rootState=(await f.sql("SELECT * FROM html_keyboard_states WHERE parent_state_id IS NULL ORDER BY created_at DESC LIMIT 1"))[0];
 let p=await page(link(root,l=>l['data-relay-action']==='search'));assert.equal(p.draft,'');assert.equal((await f.sql('SELECT COUNT(*) AS n FROM html_keyboard_states WHERE session_id=?',rootState.session_id))[0].n,1,'Browsing creates no text states');assert.ok(p.links.length<=160);
 assert.equal((await page(link(p,'Restart search'))).draft,'');
 // Every issued word/span link must make exactly its declared addition; retry is idempotent.
 for(const l of root.links.filter(l=>pick(l))){const choice=pick(l);const q=await page(l.url);assert.equal(q.draft,choice.a);assert.equal(q.headers.get('x-relay-keyboard'),'span');assert.equal((await page(l.url)).draft,choice.a);}
 const selectedLink=root.links.find(l=>pick(l)?.k==='span');assert.ok(selectedLink);const selected=await page(selectedLink.url);const chosen=pick(selectedLink);
 p=await page(key(selected,'x'));assert.equal(p.draft,chosen.a+'x','Virtual characters are literal after a span');
 p=await page(key(selected,'backspace'));assert.equal(p.draft,[...chosen.a].slice(0,-1).join(''));p=await page(link(p,'Undo last addition'));assert.equal(p.draft,chosen.a);
 p=await page(link(selected,'Clear draft'));assert.equal(p.draft,'');assert.equal((await page(link(p,'Undo last addition'))).draft,chosen.a);
 let typed=root;for(const ch of 'rel')typed=await page(key(typed,ch));typed=await page(link(typed,'Complete typed ending'));

 // Follow actual visible refinements/shortcuts; choose longest target prefix still containing the word.
 p=typed;for(let i=0;i<12&&!p.links.some(l=>pick(l)?.a==='Relay');i++){
 const choices=p.links.filter(l=>l['data-relay-action']==='search').map(l=>({l,id:Number(new URL(l.url).searchParams.get('prefix'))})).filter(({id})=>'relay'.startsWith(nodes[id].p)).sort((a,b)=>nodes[b.id].p.length-nodes[a.id].p.length);assert.ok(choices.length);p=await page(choices[0].l.url);
 }
 p=await page(link(p,l=>pick(l)?.a==='Relay'));assert.equal(p.draft,'Relay');
 p=await page(link(p,'Append exact text'));const wordChoice=p.links.find(l=>pick(l)?.k==='word');assert.ok(wordChoice);const wordEffect=pick(wordChoice);const adjacency=await page(wordChoice.url);assert.equal(adjacency.draft,'Relay'+wordEffect.a);assert.ok(!wordEffect.a.startsWith(' '));
 // Dictionary words colliding with Object.prototype must remain ordinary spellings.
 let constructor=root;for(let i=0;i<12&&!constructor.links.some(l=>pick(l)?.a==='Constructor');i++){
  const choices=constructor.links.filter(l=>l['data-relay-action']==='search').map(l=>({l,id:Number(new URL(l.url).searchParams.get('prefix'))})).filter(({id})=>'constructor'.startsWith(nodes[id].p)).sort((a,b)=>nodes[b.id].p.length-nodes[a.id].p.length);assert.ok(choices.length);constructor=await page(choices[0].l.url);
 }
 assert.equal((await page(link(constructor,l=>pick(l)?.a==='Constructor'))).draft,'Constructor');
 // All root letter keys, shifted letters and symbol keys round-trip their exact literal values.
 const layouts=[root,await page(link(root,l=>l['aria-label']==='Turn shift on')),await page(link(root,l=>l['aria-label']==='?123'))];
 const names={space:' ',comma:',',period:'.',question:'?',exclamation:'!',apostrophe:"'",colon:':',semicolon:';',quote:'"',hyphen:'-',enter:'\n'};
 for(const layout of layouts)for(const l of layout.links){const parts=new URL(l.url).pathname.split('/');if(!parts.includes('key'))continue;const value=decodeURIComponent(parts[parts.indexOf('key')+1]);if(value==='backspace')continue;const q=await page(l.url);assert.equal(q.draft,names[value]??(/^unicode:[0-9a-f]+$/.test(value)?String.fromCodePoint(Number.parseInt(value.slice(8),16)):value),`Key ${value}`);}
 // Exact Unicode, case, repeated spacing, Tab and LF, then lost publication response/replay.
 p=await page(link(root,'Exact characters and Unicode'));const wanted='Relay: café cafe\u0301 🌱\tA  \n';
 for(const ch of wanted){const cp=ch.codePointAt(0),name=cp===9?'Tab':cp===10?'Line feed':cp===32?'Space':`U+${cp.toString(16).toUpperCase().padStart(4,'0')}`;
 if(!p.links.some(l=>l['aria-label']==='Append '+name)){p=await page(link(p,'Exact characters and Unicode'));const hex=cp.toString(16).padStart(6,'0');for(const n of [2,3,4])p=await page(link(p,l=>new URL(l.url).pathname.endsWith('/'+hex.slice(0,n))));}
 p=await page(link(p,l=>l['aria-label']==='Append '+name));}
 assert.equal(p.draft,wanted);const reviewed=await page(link(p,'Review message')),pub=link(reviewed,'Publish this message publicly');assert.ok([200,201].includes((await f.request(pub,{drop:true})).status));const receipt=(await f.request(pub)).body;assert.equal((await f.request(pub)).body.message_id,receipt.message_id);const record=(await f.request('/message/'+receipt.message_id)).body;assert.equal(record.body,wanted);assert.equal(record.reply_to,parent.message_id);assert.equal(record.conversation_id,parent.conversation_id);
 // Unknown versions and modified byte payloads cannot use an existing signature.
 const bad=new URL(selectedLink.url);bad.pathname=bad.pathname.replace(encodeURIComponent(JSON.stringify(chosen)).replaceAll("'",'%27'),encodeURIComponent(JSON.stringify({...chosen,a:'tampered'})));assert.equal((await f.request(bad.href,{html:true})).status,400);
 const expired=await page('/predictive-keyboard/html/span-keyboard/');const expiredStep=key(expired,'a');const newest=(await f.sql('SELECT session_id FROM html_keyboard_sessions ORDER BY created_at DESC LIMIT 1'))[0];await f.sql('UPDATE html_keyboard_sessions SET expires_at=? WHERE session_id=?',Date.now()-1,newest.session_id);const failure=await f.request(expiredStep,{html:true});assert.equal(failure.status,410);assert.ok(failure.text.includes('/predictive-keyboard/html/span-keyboard/'));
 const profile={scope:'Local Wrangler fixture transport/response timings, not agent or WAN speed. Full emitted pages; no selective extraction.',requests:timings.length,initial_root_links:root.links.length,initial_root_html_bytes:Buffer.byteLength(root.text),max_links_seen_including_unicode_browser:maxLinks,min_response_ms:Math.min(...timings),max_response_ms:Math.max(...timings),median_response_ms:[...timings].sort((a,b)=>a-b)[Math.floor(timings.length/2)]};
 if(process.env.SPAN_PROFILE_OUTPUT){const {writeFile}=await import('node:fs/promises');await writeFile(process.env.SPAN_PROFILE_OUTPUT,JSON.stringify(profile,null,2)+'\n');}
 console.log(`Span: ${found.size} exact spellings reachable; ${spans.length} spans validated; emitted keys/effects, immutable retries, search separation, correction, literal Unicode reply and lost-publication replay passed.`);
}finally{await f.close();}
