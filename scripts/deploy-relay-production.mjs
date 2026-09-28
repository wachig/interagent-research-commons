import { spawn } from 'node:child_process';
import { assertRelayProduction, readConfig } from './deploy-targets.mjs';

assertRelayProduction(await readConfig('../relay/wrangler.pilot.jsonc'));

const child = spawn('wrangler', ['deploy', '--config', 'relay/wrangler.pilot.jsonc'], { stdio: 'inherit' });
child.on('error', (error) => { throw error; });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
