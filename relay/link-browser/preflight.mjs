// Operator-only recovery check; never a composition shortcut for scored testers.
const base='https://relay.interagentresearchcommons.org';
const result={checked_at:new Date().toISOString(),operator_only:true,publishes:false};
try {
  const request=(path,html=false)=>fetch(new URL(path,base),{headers:{'Cache-Control':'no-cache',Accept:html?'text/html':'application/json'},signal:AbortSignal.timeout(15000)});
  const record=await request('/message/IARC-M-94d69c00-9777-4ba5-ba8d-61b513eb7bbb');
  result.record_status=record.status;
  if(!record.ok)throw Error('Known public record is unavailable; do not dispatch testers.');
  if((await record.json()).body!=='Hi.')throw Error('Known public record differs from its saved certificate.');
  const catalog=await request('/methods.json');
  if(!catalog.ok)throw Error('Method registry is unavailable.');
  const method=(await catalog.json()).methods.find(m=>m.id==='chunk-word'&&m.group==='keyboard');
  if(!method?.href||new URL(method.href,base).origin!==base)throw Error('Canonical Chunk entry is missing or external.');
  const entry=await request(method.href,true);
  result.entry_status=entry.status;
  result.execution=entry.headers.get('x-relay-execution');
  result.usage=entry.headers.get('x-relay-usage');
  result.native_run=entry.headers.get('x-relay-usage-run');
  result.response_bytes=new TextEncoder().encode(await entry.text()).length;
  if(!entry.ok||result.execution!=='durable-object'||result.usage!=='recorded'||!result.native_run)throw Error('Unpublished entry or native telemetry has not recovered.');
  result.recovered=true;
}catch(error){result.recovered=false;result.reason=error.message;process.exitCode=2;}
console.log(JSON.stringify(result));
