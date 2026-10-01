// Private crash-safe checkpoints. A received response never belongs in a public export.
import {open,readFile,rename,rm,mkdir,statfs,cp,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
export async function diskGuard(dir,minBytes=32*1024*1024){
 await mkdir(dir,{recursive:true,mode:0o700});const s=await statfs(dir);
 const available=s.bavail*s.bsize;if(available<minBytes)throw Error('Low disk space: benchmark paused before mutation');return available;
}
export async function atomicText(file,value){
 const tmp=file+'.tmp-'+randomUUID();let handle;
 try{handle=await open(tmp,'wx',0o600);await handle.writeFile(value);await handle.sync();await handle.close();handle=null;await rename(tmp,file);
 const dir=await open(path.dirname(file),'r');try{await dir.sync();}finally{await dir.close();}
 }finally{await handle?.close();await rm(tmp,{force:true});}
}
export async function atomicJson(file,value){return atomicText(file,JSON.stringify(value,null,2)+'\n');}
export async function durableAppend(file,event){const f=await open(file,'a',0o600);try{await f.writeFile(JSON.stringify(event)+'\n');await f.sync();}finally{await f.close();}}
export async function readEvents(file,{repair=false}={}){
 let text;try{text=await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return [];throw e;}
 const lines=text.split('\n'),events=[];let valid='';
 for(let i=0;i<lines.length;i++){
  if(!lines[i]&&i===lines.length-1)break;
  try{const e=JSON.parse(lines[i]);if(!Number.isInteger(e.seq)||e.seq<1||(events.length&&e.seq<=events.at(-1).seq))throw Error('Invalid journal sequence');events.push(e);valid+=lines[i]+'\n';}
  catch(e){if(i!==lines.length-1)throw Error('Corrupt benchmark journal: '+file);if(repair){const f=await open(file,'r+');try{await f.truncate(Buffer.byteLength(valid));await f.sync();}finally{await f.close();}}else break;}
 }
 if(repair&&text&&!text.endsWith('\n')&&events.length&&valid.length>=text.length){const f=await open(file,'a');try{await f.writeFile('\n');await f.sync();}finally{await f.close();}}
 return events;
}
export async function saveState(dir,state){
 await diskGuard(dir,32*1024*1024+Buffer.byteLength(JSON.stringify(state))*2);
 state.checkpoint_generation=(state.checkpoint_generation||0)+1;
 await atomicJson(path.join(dir,'checkpoint.json'),state);
 await atomicJson(path.join(dir,'state.json'),state);
}
export async function loadState(dir){
 const versions=[];for(const file of ['state.json','checkpoint.json'])try{versions.push(JSON.parse(await readFile(path.join(dir,file),'utf8')));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 if(!versions.length)throw Error('No recoverable state in '+dir);
 const state=versions.sort((a,b)=>(b.checkpoint_generation||0)-(a.checkpoint_generation||0))[0];
 const events=await readEvents(path.join(dir,'events.jsonl'),{repair:true});state.events=Math.max(state.events||0,events.at(-1)?.seq||0);state.activations=Math.max(state.activations||0,events.filter(e=>e.kind==='activation').length);return state;
}
function bootTime(){try{return Date.now()-os.uptime()*1000;}catch{return null;}}
function alive(pid){try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}}
export async function lockDirectory(dir){
 const lock=path.join(dir,'.lock');
 for(let attempt=0;attempt<3;attempt++){
  try{await mkdir(lock,{mode:0o700});await atomicJson(path.join(lock,'owner.json'),{pid:process.pid,host:os.hostname(),at:Date.now(),boot_ms:bootTime()});return async()=>rm(lock,{recursive:true,force:true});}
  catch(e){if(e.code!=='EEXIST')throw e;let owner;try{owner=JSON.parse(await readFile(path.join(lock,'owner.json')));}catch{throw Error('Lock ownership unknown; inspect before manual recovery: '+lock);}
   if(owner.host!==os.hostname()||((!owner.boot_ms||!bootTime()||Math.abs(owner.boot_ms-bootTime())<30000)&&alive(owner.pid)))throw Error('Benchmark is locked by a live or remote process');
   const stale=lock+'.stale-'+randomUUID();try{await rename(lock,stale);await rm(stale,{recursive:true,force:true});}catch(e){if(e.code!=='ENOENT')throw e;}
  }
 }
 throw Error('Could not acquire benchmark lock');
}
export async function backupPrivate(root,destination){
 if(path.resolve(destination).startsWith(path.resolve(root)+path.sep)||path.resolve(destination)===path.resolve(root))throw Error('Backup must be outside run storage');
 try{await readFile(path.join(root,'broker.json'));throw Error('Stop the broker before making a private backup');}catch(e){if(e.code!=='ENOENT')throw e;}
 await diskGuard(path.dirname(destination));await mkdir(destination,{mode:0o700});
 // Hold every run lock during copying, so backups cannot race a response/checkpoint.
 const releases=[];
 try{for(const name of await readdir(root,{withFileTypes:true}))if(name.isDirectory())releases.push(await lockDirectory(path.join(root,name.name)));
 await cp(root,destination,{recursive:true,filter:source=>!source.endsWith('broker.json')&&!source.includes(path.sep+'.lock')});
 await atomicJson(path.join(destination,'BACKUP.json'),{at:new Date().toISOString(),private:true,includes_bearer_capabilities:true});
 }finally{for(const release of releases.reverse())await release();}
 return {backup:destination,private:true};
}
