// Synthetic localhost fixtures only. Never accepts a deployment URL or production credentials.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {DatabaseSync} from 'node:sqlite';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export async function fixture({pendingSeconds=600,sessionSeconds=900}={}) {
 const persistence=await mkdtemp('/private/tmp/relay-recovery-evaluation-');
 const listener=net.createServer(); await new Promise(r=>listener.listen(0,'127.0.0.1',r)); const port=listener.address().port; await new Promise(r=>listener.close(r));
 const base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),'dev','--local','--config',path.join(root,'relay/wrangler.jsonc'),'--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--persist-to',persistence,'--var','RELAY_SERVICE_STATE:isolated-local-prototype','--var','RELAY_WRITES_OPEN:true','--var','RELAY_ADMISSIONS_REQUIRED:false','--var','RELAY_CAPABILITY_SECRET:local-evaluation-only-never-deploy-00000000000000','--var',`RELAY_SESSION_TTL_SECONDS:${sessionSeconds}`,'--var',`RELAY_PENDING_TTL_SECONDS:${pendingSeconds}`,'--log-level','error'],{cwd:root,env:{...process.env,WRANGLER_WRITE_LOGS:'false',WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 const close=async()=>{child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(2000)]);if(child.exitCode===null)child.kill('SIGKILL');await rm(persistence,{recursive:true,force:true});};
 try {let ready=false;for(let n=0;n<200;n++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/health.json')).ok){ready=true;break;}}catch{}await delay(100);}if(!ready)throw Error(logs);}catch(e){await close();throw e;}
 let db;
 async function sql(query,...values){
  if(!db){for(const name of await readdir(persistence,{recursive:true})){if(!name.endsWith('.sqlite'))continue;const candidate=new DatabaseSync(path.join(persistence,name));if(candidate.prepare("SELECT name FROM sqlite_master WHERE name='sessions'").get()){db=candidate;break;}candidate.close();}if(!db)throw Error('Fixture database unavailable');}
  const stmt=db.prepare(query);return stmt.all(...values);
 }
 let sequence=0;
 async function request(route,{html=false,drop=false,...options}={}){
  const url=new URL(route,base);if(url.origin!==base)throw Error('Nonlocal request blocked');
  const response=await fetch(url,{redirect:'manual',...options,headers:{Accept:html?'text/html':'application/json','CF-Connecting-IP':`192.0.2.${++sequence%250+1}`,...options.headers}});
  const text=await response.text();if(drop)return {status:response.status};
  return {status:response.status,text,body:html?undefined:(response.headers.get('content-type')||'').includes('json')?JSON.parse(text):undefined,headers:response.headers,url:url.href};
 }
 return {base,request,sql,close:async()=>{db?.close();await close();}};
}
export const decode=s=>s.replace(/&(?:amp|lt|gt|quot|#39|apos);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&apos;':"'"}[x]));
export const plain=s=>decode(s.replace(/<[^>]*>/g,''));
export function parse(html,url){
 const baseTag=html.match(/<base[^>]+href="([^"]+)"/);const origin=new URL(decode(baseTag?.[1]||url),url);
 const links=[...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(m=>{const attrs=Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],decode(a[2])]));return {...attrs,text:plain(m[2]),url:attrs.href?new URL(attrs.href,origin).href:null};}).filter(l=>l.url);
 const d=html.match(/<pre\b[^>]*class="draft"[^>]*>([\s\S]*?)<\/pre>/);
 return {html,url,links,draft:d?decode(d[1]):null};
}
