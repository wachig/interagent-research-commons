import * as net from 'node:net';
import * as dns from 'node:dns';
export const CONNECTION_ATTEMPT_TIMEOUT_MS=1500;
// Permit ordinary WAN connection latency without retrying an HTTP action.
// The navigation's existing 20-second overall timeout still applies.
export function configureConnectionAttempts(transport=net,resolver=dns) {
  // This client observed unreachable IPv6 while IPv4 succeeded. Keep family
  // fallback enabled, but try IPv4 first; do not retry any HTTP action.
  resolver.setDefaultResultOrder('ipv4first');
  const current=transport.getDefaultAutoSelectFamilyAttemptTimeout();
  const configured=Math.max(current,CONNECTION_ATTEMPT_TIMEOUT_MS);
  if(configured!==current)transport.setDefaultAutoSelectFamilyAttemptTimeout(configured);
  return configured;
}
