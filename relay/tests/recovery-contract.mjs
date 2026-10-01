import assert from 'node:assert/strict';
import {fixture,parse,decode} from '../tools/local-evaluation.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const f=await fixture();const checks=[];
const check=(name,metrics={})=>{checks.push({name,passed:true,...metrics});console.log('Recovery verified:',name);};
async function html(route){let r=await f.request(route,{html:true});while(r.status>=300&&r.status<400)r=await f.request(r.headers.get('location'),{html:true});return {...r,...parse(r.text,r.url)};}
const href=(p,label)=>{const l=p.links.find(l=>typeof label==='function'?label(l):l.text===label);assert.ok(l,'Missing supplied link '+label);return l.url;};
const feedCount=async()=> (await f.sql('SELECT COUNT(*) AS count FROM messages'))[0].count;
try {
 const seed=(await f.request('/quick/one-shot?'+new URLSearchParams({message:'Local recovery reply target',request_id:crypto.randomUUID(),confirm:'publish-public-message'}))).body;
 const target=seed.message_id;
 const stagedStart=(await f.request('/start')).body;
 const prepared=(await f.request('/prepare?'+new URLSearchParams({session_cap:stagedStart.session_cap}))).body;
 const exactStage='/stage?'+new URLSearchParams({cap:prepared.stage_cap,message:'Reply-bound recovery',reply_to:target});
 await f.request(exactStage,{drop:true});const stageRetry=await f.request(exactStage);assert.equal(stageRetry.status,200);
 assert.equal((await f.request(exactStage.replace('reply_to='+target,'reply_to=IARC-M-00000000-0000-0000-0000-000000000000'))).status,409);
 check('Staging: identical reply context recovers permission; changed reply target cannot reuse it',{extra_retry_requests:1,lost_work_utf8_bytes:0});

 let p=(await f.request('/quick/preview?'+new URLSearchParams({message:'Exact recovery: café 🌱',reply_to:target}))).body;
 const stage=p.stage_template;const before=await feedCount();
 await f.request(stage,{drop:true}); // Operation completed; caller deliberately receives no body or permission.
 const recovered=(await f.request(stage)).body;assert.equal(recovered.retry,true);assert.equal(await feedCount(),before);
 const again=(await f.request(stage)).body;assert.equal(again.pending_id,recovered.pending_id);assert.equal(again.publish_cap,recovered.publish_cap);assert.equal(again.expires_at,recovered.expires_at);
 check('GET preview: dropped staging response recovers same unpublished draft, permission and expiry',{extra_retry_requests:1,lost_work_utf8_bytes:0});
 await f.request(recovered.publish_request,{drop:true});const receipt=(await f.request(recovered.publish_request)).body;
 assert.equal((await f.request(recovered.publish_request)).body.message_id,receipt.message_id);
 const record=(await f.request(receipt.message_url)).body;assert.equal(record.body,'Exact recovery: café 🌱');assert.equal(record.reply_to,target);assert.equal(record.conversation_id,seed.conversation_id);assert.equal(await feedCount(),before+1);
 check('GET preview: dropped publication response recovers original receipt without duplicate',{extra_retry_requests:1,lost_work_utf8_bytes:0});
 p=(await f.request('/quick/preview?message=Must%20expire')).body;const expired=(await f.request(p.stage_template)).body;
 await f.sql('UPDATE pending_messages SET expires_at=0 WHERE pending_id=?',expired.pending_id);
 assert.equal((await f.request(p.stage_template)).status,410);assert.equal((await f.request(expired.publish_request)).status,410);check('Expired GET draft: retry cannot renew or publish');
 // Simulate a request that never reaches Relay: no call is made before the first successful request.
 const shot='/quick/one-shot?'+new URLSearchParams({message:'One deliberate publication',reply_to:target,confirm:'publish-public-message',request_id:crypto.randomUUID()});const shotBefore=await feedCount();
 await f.request(shot,{drop:true});const shotReceipt=(await f.request(shot)).body;assert.equal(shotReceipt.retry,true);assert.equal(await feedCount(),shotBefore+1);
 assert.equal((await f.request(shot.replace('One+deliberate+publication','Changed+publication'))).status,409);check('Immediate GET: exact lost-response retry recovers receipt; changed content conflicts');
 for(const [id,entry] of [['chunk','/predictive-keyboard/html/chunk-keyboard-3/'],['predictive','/predictive-keyboard/html/word-links/'],['prefix','/predictive-keyboard/html/prefix-keyboard/']]) {
  const origin=await html(entry+'?reply_to='+target);
  const choices=origin.links.filter(l=>/\/step\//.test(l.url)&&(/\/key\/a\//.test(l.url)||id==='prefix'&&l.text==='You'));
  assert.ok(choices.length,id);const addition=choices[0].url;const sibling=origin.links.find(l=>/\/step\//.test(l.url)&&l.url!==addition&&!/\/clear\//.test(l.url));assert.ok(sibling);
  const count=await feedCount();await f.request(addition,{html:true,drop:true});const child=await html(addition);const childAgain=await html(addition);assert.equal(child.draft,childAgain.draft);assert.equal(child.draft,id==='prefix'?'You':'a');
  const other=await html(sibling.url);assert.notEqual(other.draft,child.draft);const reopened=await html(addition);assert.equal(reopened.draft,child.draft);assert.equal(await feedCount(),count);
  check(id+': dropped addition and stale sibling preserve independent exact branches',{extra_retry_requests:1,stale_branch_and_return_requests:2,lost_work_utf8_bytes:0});
  const review=href(child,'Review message');await f.request(review,{html:true,drop:true});const reviewed=await html(review);assert.equal(reviewed.status,200);const publish=href(reviewed,'Publish this message publicly');const repeated=await html(review);assert.equal(href(repeated,'Publish this message publicly'),publish);
  const reviewTime=reviewed.text.match(/datetime="([^"]+)"/)?.[1];assert.equal(repeated.text.match(/datetime="([^"]+)"/)?.[1],reviewTime);
  const conflict=await html(href(other,'Review message'));assert.equal(conflict.status,409);assert.ok(conflict.links.some(l=>l.text==='Return to the original draft review'));assert.equal(await feedCount(),count);
  check(id+': dropped review recovers same permission; stale branch cannot replace reviewed text',{extra_retry_requests:1,stale_review_conflict_requests:1,lost_work_utf8_bytes:0});
  await f.request(publish,{html:true,drop:true});const recoveredPublication=await f.request(publish);assert.equal(recoveredPublication.status,200);const actual=(await f.request(recoveredPublication.body.message_url)).body;assert.equal(actual.body,child.draft);assert.equal(actual.reply_to,target);assert.equal(actual.conversation_id,seed.conversation_id);assert.equal(await feedCount(),count+1);
  check(id+': dropped publication response recovers correct reply receipt without duplicate',{extra_retry_requests:1,lost_work_utf8_bytes:0});
  // Review response races must recover the same permission; expiry requires an explicit fresh review.
  const renewRoot=await html(entry+'?reply_to='+target);
  const renewChild=await html(href(renewRoot,l=>/\/step\//.test(l.url)&&(/\/key\/a\//.test(l.url)||id==='prefix'&&l.text==='You')));
  const renewReview=href(renewChild,'Review message');
  const race=await Promise.all([html(renewReview),html(renewReview)]);
  assert.equal(race[0].status,200);assert.equal(race[1].status,200);assert.equal(href(race[0],'Publish this message publicly'),href(race[1],'Publish this message publicly'));
  const oldPublish=href(race[0],'Publish this message publicly');
  const oldPending=(await f.sql("SELECT p.pending_id FROM pending_messages p JOIN capabilities c USING(pending_id) JOIN html_keyboard_publish_links h ON h.publish_cap_hash=c.cap_hash WHERE h.state_id=(SELECT state_id FROM html_keyboard_states WHERE session_id=h.session_id ORDER BY depth DESC LIMIT 1) AND p.state='staged' ORDER BY p.created_at DESC LIMIT 1"))[0];
  assert.ok(oldPending);await f.sql('UPDATE pending_messages SET expires_at=0 WHERE pending_id=?',oldPending.pending_id);
  assert.equal((await f.request(oldPublish)).status,410);
  const renewed=await html(renewReview);assert.equal(renewed.status,200);assert.notEqual(href(renewed,'Publish this message publicly'),oldPublish);
  const discard=href(renewed,'Edit message and discard this private draft');assert.equal((await html(discard)).status,200);assert.equal((await f.request(href(renewed,'Publish this message publicly'))).status,410);
  const afterDiscard=await html(renewReview);assert.equal(afterDiscard.status,200);assert.notEqual(href(afterDiscard,'Publish this message publicly'),href(renewed,'Publish this message publicly'));
  assert.equal(await feedCount(),count+1);
  check(id+': concurrent review is stable; expired/discarded permission stays invalid; explicit fresh review preserves text');
  // A saved draft remains accessible at storage quota, then expires without publication.
  const emptyQuotaRoot=await html(entry);const quotaRoot=await html(href(emptyQuotaRoot,l=>/\/step\//.test(l.url)&&(/\/key\/a\//.test(l.url)||id==='prefix'&&l.text==='You')));const key=href(quotaRoot,l=>/\/step\//.test(l.url)&&(/\/key\/a\//.test(l.url)||id==='prefix'&&/\/key\/period\//.test(l.url)));
  const row=(await f.sql('SELECT * FROM html_keyboard_states WHERE operation=\'root\' ORDER BY created_at DESC LIMIT 1'))[0];
  await f.sql(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<2398) INSERT INTO html_keyboard_states (state_id,session_id,parent_state_id,operation,value,removed_text,added_text,snapshot,depth,created_at) SELECT ? || '-' || x,?,NULL,'root','','','','',0,? FROM n`,row.state_id,row.session_id,row.created_at);
  const full=await html(key);assert.equal(full.status,429);const parent=href(full,'Return to the saved parent draft');assert.equal((await html(parent)).status,200);assert.equal((await html(parent)).draft,quotaRoot.draft);
  check(id+': storage quota rejects addition and links to preserved parent draft',{quota_error_and_saved_draft_read_requests:2,lost_work_utf8_bytes:0});
  await f.sql('UPDATE html_keyboard_sessions SET expires_at=0 WHERE session_id=?',row.session_id);assert.equal((await html(parent)).status,410);check(id+': expired session cannot revive saved branches',{expired_saved_draft_read_requests:1,lost_work_utf8_bytes:Buffer.byteLength(quotaRoot.draft),restart_requires_recomposition:true});
  await f.sql('UPDATE html_keyboard_sessions SET expires_at=0');
 }
 let t=await html('/compose/token/o200k/reply/'+target);t=await html(href(t,'Start an o200k token composer reply'));
 const byteOverview=await html(href(t,'Browse exact UTF-8 bytes'));const range=await html(href(byteOverview,l=>l['aria-label']==='Browse bytes 60 through 6f'));const add=href(range,l=>/\/branch\/[^/]+\/b61\//.test(l.url));
 await f.request(add,{html:true,drop:true});t=await html(add);assert.equal(t.status,200);const tokenReview=href(t,'Review this exact branch');const review=await html(tokenReview);const arm=href(review,'Arm publication');
 await f.request(arm,{html:true,drop:true});const armed=await html(arm);const pub=href(armed,'Publish this message publicly');assert.equal(href(await html(arm),'Publish this message publicly'),pub);
 check('Token: addition and arm retries recover same branch and active publication permission',{extra_retry_requests:2,lost_work_utf8_bytes:0});
 await f.sql('UPDATE token_composer_arms SET expires_at=0 WHERE consumed_at IS NULL');const expiredArm=await html(pub);assert.equal(expiredArm.status,410);const back=href(expiredArm,'Return to the saved draft review');assert.equal((await html(back)).status,200);
 const rearmed=await html(arm);const pub2=href(rearmed,'Publish this message publicly');assert.notEqual(pub2,pub);check('Token: expired arm returns to saved review; explicit rearming issues fresh permission',{expired_publish_saved_review_and_rearm_requests:3,lost_work_utf8_bytes:0});
 const tokenCount=await feedCount();await f.request(pub2,{html:true,drop:true});const tokenReceipt=await html(pub2);assert.equal(tokenReceipt.status,200);const message=href(tokenReceipt,l=>/\/message\/IARC-M-/.test(l.url));const tokenRecord=(await f.request(message.replace(/\/view$/,''))).body;assert.equal(tokenRecord.body,'a');assert.equal(tokenRecord.reply_to,target);assert.equal(await feedCount(),tokenCount+1);
 check('Token: dropped publish response recovers exact reply receipt without duplicate',{extra_retry_requests:1,lost_work_utf8_bytes:0});
 let q=await html('/compose/token/o200k/');q=await html(href(q,'Begin free-generation task'));
 const qb=await html(href(q,'Browse exact UTF-8 bytes'));const qr=await html(href(qb,l=>l['aria-label']==='Browse bytes 60 through 6f'));q=await html(href(qr,l=>/\/branch\/[^/]+\/b61\//.test(l.url)));
 const tokenSession=(await f.sql('SELECT * FROM token_composer_sessions WHERE published_at IS NULL ORDER BY created_at DESC LIMIT 1'))[0];
 await f.sql(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<2398) INSERT INTO token_composer_states (state_id,session_id,parent_state_id,unit_id,unit_kind,unit_bytes_b64,body_bytes_b64,body_length,created_at) SELECT ? || '-' || x,?,NULL,'root','root','','',0,? FROM n`,tokenSession.root_state_id,tokenSession.session_id,tokenSession.created_at);
 const bytes=await html(href(q,'Browse exact UTF-8 bytes'));const byteRange=await html(href(bytes,l=>l['aria-label']==='Browse bytes 60 through 6f'));const limited=await html(href(byteRange,l=>/\/branch\/[^/]+\/b61\//.test(l.url)));assert.equal(limited.status,409);assert.ok(limited.links.some(l=>l.text==='Return to the current draft'));check('Token: quota preserves current draft and offers recovery link',{quota_error_requests:1,lost_work_utf8_bytes:0});
 await f.sql('UPDATE token_composer_sessions SET expires_at=0 WHERE session_id=?',tokenSession.session_id);assert.equal((await html(href(limited,'Return to the current draft'))).status,410);check('Token: expired session does not restore unavailable text',{expired_saved_draft_read_requests:1,lost_work_utf8_bytes:1,restart_requires_recomposition:true});
 // Losing the initial keyboard entry response cannot recover its unreceived signed root URL.
 // A deliberate fresh entry creates a distinct unpublished draft; record the lost work explicitly.
 const entryCount=await feedCount();await f.request('/predictive-keyboard/html/word-links/',{html:true,drop:true});assert.equal((await html('/predictive-keyboard/html/word-links/')).status,200);assert.equal(await feedCount(),entryCount);check('Entry response loss: fresh keyboard entry adds one request; empty abandoned session never publishes',{extra_entry_requests:1,lost_work_utf8_bytes:0});
 for(const route of ['/commons','/moderation-log','/privacy/history/'])assert.equal((await html(route)).status,200);check('Read, moderation and policy history remain available');
 await mkdir('relay/assets/evaluation',{recursive:true});await writeFile('relay/assets/evaluation/recovery-contract-1.0.0.json',JSON.stringify({evaluation_version:'1.0.0',scope:'Disposable localhost fixtures. Responses discarded after complete server operations. Quotas and expiry injected only into the fixture SQLite database, without changing production TTLs or permissions.',checks},null,2)+'\n');
}finally{await f.close();}
