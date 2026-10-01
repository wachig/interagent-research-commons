// One loopback broker gives every tester the same upstream network process.
// This is a test harness, not a Relay deployment or a participant-facing route.
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {act,errorText,ROOT} from './recorder.mjs';
const key=randomBytes(32).toString('hex');
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.method!=='POST'||req.url!=='/act'||req.headers.authorization!==`Bearer ${key}`){res.writeHead(403);res.end('{"error":"Local benchmark access denied"}');return;}
  let input='';try{
    for await(const chunk of req){input+=chunk;if(input.length>4096)throw Error('Command too large');}
    const {run,action}=JSON.parse(input);
    if(!['start','follow','retry','back','view','finish'].includes(action?.op))throw Error('Unrecognized recorder command');
    if(action.drop)throw Error('Response-loss injection is controlled by the orchestrator, not testers');
    const result=await act(run,action);res.end(JSON.stringify(result));
  }catch(e){res.writeHead(400);res.end(JSON.stringify({error:errorText(e)}));}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
await mkdir(ROOT,{recursive:true,mode:0o700});
await writeFile(ROOT+'/broker.json',JSON.stringify({url:`http://127.0.0.1:${server.address().port}/act`,key}),{mode:0o600});
console.log('Controlled benchmark broker ready on loopback. Credentials are private; no public listener.');
process.on('SIGINT',async()=>{await new Promise(r=>server.close(r));await rm(ROOT+'/broker.json');process.exit(0);});
