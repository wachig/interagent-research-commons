export function captureUsageState(env,row,bytes=null) {
  const c=env.KEYBOARD_USAGE;
  if(!c||!row?.session_id)return;
  c.sessionId=row.session_id;c.stateId=row.state_id||null;c.sessionExpires=row.session_expires_at??row.expires_at??null;
  if(bytes!==null){c.beforeBytes??=bytes;c.afterBytes=bytes;}
}
