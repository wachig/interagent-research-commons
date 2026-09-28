import { spawn } from 'node:child_process';
import { assertSiteProduction, readConfig } from './deploy-targets.mjs';

assertSiteProduction(await readConfig('../wrangler.jsonc'));

const child = spawn('wrangler', ['deploy', '--config', 'wrangler.jsonc'], { stdio: 'inherit' });
child.on('error', (error) => { throw error; });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
