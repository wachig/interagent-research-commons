// One loopback broker gives every tester the same upstream network process.
// This is a test harness, not a Relay deployment or a participant-facing route.
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdir,rm} from 'node:fs/promises';
import {act,errorText,ROOT} from './recorder.mjs';
import {verifyManifest,loadManifest} from './manifest.mjs';
import {atomicJson,loadState} from './storage.mjs';
const manifest=process.argv[2];if(!manifest)throw Error('Required schema-2 cohort directory');await verifyManifest(manifest);const freeze=await loadManifest(manifest);
const key=randomBytes(32).toString('hex');
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.method!=='POST'||req.url!=='/act'||req.headers.authorization!==`Bearer ${key}`){res.writeHead(403);res.end('{"error":"Local benchmark access denied"}');return;}
  let input='';try{
    for await(const chunk of req){input+=chunk;if(input.length>4096)throw Error('Command too large');}
    const {run,action}=JSON.parse(input);
    if(!['start','follow','retry','back','view','finish'].includes(action?.op))throw Error('Unrecognized recorder command');
    if(action.drop)throw Error('Response-loss injection is controlled by the orchestrator, not testers');
    if(!/^[a-z0-9][a-z0-9_-]{0,90}$/.test(run||''))throw Error('Invalid run');const state=await loadState(ROOT+'/'+run);if(!state.config.controlled||state.config.manifest_sha256!==freeze.manifest_sha256)throw Error('Run belongs to another frozen cohort');
    const result=await act(run,action);res.end(JSON.stringify(result));
  }catch(e){res.writeHead(400);res.end(JSON.stringify({error:errorText(e)}));}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
await mkdir(ROOT,{recursive:true,mode:0o700});
await atomicJson(ROOT+'/broker.json',{url:`http://127.0.0.1:${server.address().port}/act`,key,cohort:freeze.cohort});
console.log('Controlled benchmark broker ready on loopback. Credentials are private; no public listener.');
const stop=async()=>{await new Promise(r=>server.close(r));await rm(ROOT+'/broker.json');process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
