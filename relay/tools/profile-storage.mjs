// Mechanical localhost storage-cost probe, not an agent performance comparison.
import assert from 'node:assert/strict';
import {fixture,parse} from './local-evaluation.mjs';
const f=await fixture({adminLocalTest:true});
const html=async route=>{const r=await f.request(route,{html:true});assert.equal(r.status,200);assert.notEqual(r.headers.get('x-relay-usage'),'unavailable');return {...r,...parse(r.text,r.url)};};
const select=(p,test)=>{const l=p.links.find(test);assert.ok(l,'Required supplied link absent');return l.url;};
const stats=async()=>{const r=await f.request('/admin/api/keyboard-usage');assert.equal(r.status,200);assert.ok(r.body.storage_statistics?.sql_calls>0);return r.body.storage_statistics;};
try {
 const methods=(await f.request('/methods.json')).body.methods.filter(m=>m.group==='keyboard'),results=[];
 for(const method of methods) {
  let p=await html(method.href);
  if(method.id==='frame'){p=await html(select(p,l=>/start\//.test(l.url)&&l.text.includes('Write a sentence')));p=await html(select(p,l=>l.text==='Compose exact text'));}
  if(method.id==='token-link'){p=await html(select(p,l=>/\/start\/generation\//.test(l.url)));p=await html(select(p,l=>l.text==='Browse exact UTF-8 bytes'));p=await html(select(p,l=>l['aria-label']==='Browse bytes 60 through 6f'));}
  if(method.id!=='token-link'&&!p.links.some(l=>l.text==='a'&&(/\/step\//.test(l.url)||/\/action\//.test(l.url))))p=await html(select(p,l=>/^Exact characters|^Literal characters/.test(l.text)));
  const before=await stats();let requests=0,bytes=0;
  for(let i=0;i<100;i++){
   p=await html(select(p,l=>method.id==='token-link'?/\/branch\/[^/]+\/b61\//.test(l.url):l.text==='a'&&(/\/step\//.test(l.url)||/\/action\//.test(l.url))));requests++;bytes+=new TextEncoder().encode(p.text).length;
   // Token branches show continuation bytes directly; Frame action returns a form view.
  }
  const after=await stats();const row={method:method.id,character_actions:requests,rows_read:after.rows_read-before.rows_read,rows_written:after.rows_written-before.rows_written,sql_calls:after.sql_calls-before.sql_calls,response_bytes:bytes};
  assert.ok(row.rows_written>0,'Native SQL cursor write measurements must be available');
  assert.ok(row.rows_written<5000,'100 literal activations must not use 5% of the daily write allowance');
  results.push(row);console.log(JSON.stringify(row));
 }
 assert.equal((await f.sql('SELECT COUNT(*) AS n FROM keyboard_usage_choices'))[0].n,0);
 console.log(JSON.stringify({scope:'Mechanical local SQL cursor measurements; no public publication, schema/alarm API excluded; includes final export reads. Not a Luna performance result.',results,totals:await stats()}));
}finally{await f.close();}
