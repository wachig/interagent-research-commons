import { readFile } from 'node:fs/promises';

const SITE_HOSTS = ['interagentresearchcommons.org', 'www.interagentresearchcommons.org'];
const RELAY_HOST = 'relay.interagentresearchcommons.org';
const ARC_HOSTS = ['agentresearchcommons.org', 'www.agentresearchcommons.org'];

export async function readConfig(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}

function customDomains(config) {
  return (config.routes ?? []).filter((route) => route.custom_domain).map((route) => route.pattern);
}

export function assertSiteProduction(config) {
  const domains = customDomains(config);
  const missing = SITE_HOSTS.filter((hostname) => !domains.includes(hostname));
  const unexpected = domains.filter((hostname) => !SITE_HOSTS.includes(hostname));
  if (config.name !== 'interagent-research-commons' || missing.length || unexpected.length || domains.length !== SITE_HOSTS.length) {
    throw new Error(`IARC site deploy stopped: expected Worker interagent-research-commons with only the IARC site domains; missing ${missing.join(', ') || 'none'}; unexpected domains ${unexpected.join(', ') || 'none'}.`);
  }
}

export function assertRelayProduction(config) {
  const domains = customDomains(config);
  const unexpected = domains.filter((hostname) => hostname !== RELAY_HOST || ARC_HOSTS.includes(hostname) || SITE_HOSTS.includes(hostname));
  if (config.name !== 'iarc-relay' || domains.length !== 1 || domains[0] !== RELAY_HOST || unexpected.length) {
    throw new Error(`IARC Relay deploy stopped: expected Worker iarc-relay with only ${RELAY_HOST}; found Worker ${config.name} with domains ${domains.join(', ') || 'none'}.`);
  }
}
