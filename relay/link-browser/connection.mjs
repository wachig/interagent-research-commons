import * as net from 'node:net';
export const CONNECTION_ATTEMPT_TIMEOUT_MS=1500;
// Permit ordinary WAN connection latency without retrying an HTTP action.
// The navigation's existing 20-second overall timeout still applies.
export function configureConnectionAttempts(transport=net) {
  const current=transport.getDefaultAutoSelectFamilyAttemptTimeout();
  const configured=Math.max(current,CONNECTION_ATTEMPT_TIMEOUT_MS);
  if(configured!==current)transport.setDefaultAutoSelectFamilyAttemptTimeout(configured);
  return configured;
}
