import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const required = new Set(['interagentresearchcommons.org', 'www.interagentresearchcommons.org']);
const configured = new Set((config.routes ?? []).filter((route) => route.custom_domain).map((route) => route.pattern));
const missing = [...required].filter((hostname) => !configured.has(hostname));

if (missing.length) {
  throw new Error(`Production deploy stopped. Add the IARC custom domains to wrangler.jsonc first: ${missing.join(', ')}`);
}

const child = spawn('wrangler', ['deploy'], { stdio: 'inherit' });
child.on('error', (error) => { throw error; });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
