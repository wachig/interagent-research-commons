// Capability facts are separate from agent completion. No publication is performed.
import {wireGet,extract,ORIGIN,isPublish} from './recorder.mjs';
export function compatibility(method,profile,html='',lane=null){
 const supplied=profile==='strict-supplied-links-no-js-no-forms';
 const missing=(method.required_capabilities||[]).filter(c=>c!=='follow-links'&&(supplied||c!=='submit-get-form'));
 // Observed Prefix menus need GET forms even though the old registry declared them optional.
 if(supplied&&method.id==='prefix-link'&&/<form\b/i.test(html))missing.push('submit-get-form-for-word-discovery');
 if(supplied&&method.id==='prefix-link'&&lane==='supplied-links-with-exact-fallback'&&/href="[^"]*\/word-links\/characters\/[^"]*view=prefix/u.test(html))return {status:'compatible',missing_capabilities:[],primary_discovery_status:'incompatible',primary_missing_capabilities:[...new Set(missing)],evaluated_lane:lane,scope:'Supplied word links and observed exact fallback only; GET-form discovery remains incompatible. Not a coverage or speed claim.'};
 return {status:missing.length?'incompatible':'compatible',missing_capabilities:[...new Set(missing)],scope:'Client/entry compatibility only; not exact coverage, speed or universal reachability.'};
}
export async function probePath(start,{local=false,release,maxHops=6,onRequest,onResponse}={}){
 let url=start;const transitions=[];
 for(let i=0;i<maxHops;i++){
  if(isPublish(url))throw Error('Preflight cannot publish');
  await onRequest?.();let r;try{r=await wireGet(url,{local});}catch(e){await onResponse?.({transport:true});throw e;}await onResponse?.({status:r.status});transitions.push({status:r.status,url,wire_body_bytes:r.wire_body_bytes});
  if(r.status!==200&&!(r.status>=300&&r.status<400))throw Error('Operation probe failed HTTP '+r.status);
  if(release&&r.headers['x-relay-release']!==release)throw Error('Operation probe release differs');
  if(r.status>=300&&r.status<400&&r.headers.location){url=new URL(r.headers.location,url).href;continue;}
  return {html:r.text,page:await extract(r.text),transitions,release:r.headers['x-relay-release'],observed_at:Date.now()};
 }
 throw Error('Operation probe redirect limit');
}
export async function preflightMethod(method,freeze,callbacks={}){
 const probe=await probePath(ORIGIN+method.href,{release:freeze.release,...callbacks});
 const result=compatibility(method,freeze.plan.profile,probe.html,freeze.plan.method_lanes?.[method.id]);
 return {...result,manifest_sha256:freeze.manifest_sha256,release:freeze.release,observed_at:probe.observed_at,entry_sha256:(await import('./manifest.mjs')).hash(probe.html),http_attempts:probe.transitions.length};
}
