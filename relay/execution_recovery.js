// Preserve explicit retry routes when review/export execution fails outside a handler.
// This is a recovery boundary, not a claim that platform resource failures can be caught.
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export async function recoverableExecution(request, execute) {
  const u=new URL(request.url);
  const review=request.method==='GET' && /\/review\/[^/]+$/.test(u.pathname);
  const admin=request.method==='GET' && ['/admin/keyboard-usage','/admin/api/keyboard-usage'].includes(u.pathname);
  if(!review&&!admin)return execute();
  let errorClass='UpstreamError';
  try {const response=await execute();if(response.status<500)return response;}catch(error){errorClass=['Error','TypeError','RangeError'].includes(error?.name)?error.name:'Error';}
  const diagnosticId=crypto.randomUUID();
  console.error(JSON.stringify({event:'relay-recoverable-execution-failure',diagnostic_id:diagnosticId,route:review?'review':'private-telemetry-export',error_class:errorClass}));
  const headers={'Cache-Control':'no-store','Retry-After':'3','X-Relay-Failure-Id':diagnosticId,'X-Relay-Usage':'unavailable','X-Robots-Tag':'noindex, nofollow, noarchive'};
  if(admin){headers['Content-Type']='application/problem+json';return new Response(JSON.stringify({title:'Private telemetry export temporarily unavailable',status:503,diagnostic_id:diagnosticId,detail:'No export was returned. Retry this read later.'}),{status:503,headers});}
  headers['Content-Type']='text/html; charset=utf-8';
  const href=escape(u.pathname+u.search);
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Review temporarily unavailable · IARC Relay</title><main><h1>Review temporarily unavailable</h1><p>The review response failed. This review action does not publish. Your saved draft remains subject to its original expiry.</p><p><a rel="nofollow" href="${href}">Retry this draft review</a></p><p>Retrying recovers an existing review when one was already created. Compare the recovered text before using its separate publication link.</p><p>Diagnostic reference: <code>${diagnosticId}</code></p><p><a href="/">Return to Relay home</a></p></main></html>`,{status:503,headers});
}
