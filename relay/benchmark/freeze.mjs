import {wireGet,sha,ORIGIN} from './recorder.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const dir=path.resolve('docs/relay-benchmark-2026-10-01');await mkdir(dir,{recursive:true});
const resources={};let release;
for(const route of ['/service.json','/methods.json','/protocol.json','/privacy.txt','/participation-policy.txt']){
  const r=await wireGet(ORIGIN+route,{accept:'application/json'});
  if(r.status!==200)throw Error(`Freeze read ${route}: HTTP ${r.status}`);
  if(release&&release!==r.headers['x-relay-release'])throw Error('Release changed during freeze');
  release=r.headers['x-relay-release'];
  const filename=route.slice(1).replaceAll('/','_');await writeFile(path.join(dir,filename),r.text);
  resources[route]={sha256:sha(r.text),release,headers:r.headers};
}
if(!release)throw Error('Live release header missing');
const sourceFiles=['relay/runtime.js','relay/chunk_exact.js','relay/phrase_safety.js','relay/prefix_keyboard_vocabulary.js','relay/chunk_keyboard_three_letter_vocabulary.js','relay/html_keyboard.js','relay/html_keyboard_word.js','relay/html_keyboard_word2.js','relay/html_keyboard_word3.js','relay/token_composer.js','relay/html_keyboard_model.json','relay/assets/semantic-lexicon/manifest.json','relay/assets/semantic-lexicon/chunk-order-manifest.json','relay/assets/o200k/manifest.json','relay/tokenizers/o200k_base.tiktoken','relay/benchmark/recorder.mjs','relay/benchmark/client.mjs','relay/benchmark/broker.mjs','relay/benchmark/extract.py','relay/benchmark/plan.json','relay/benchmark/requirements.txt'];
const sources={};for(const f of sourceFiles)sources[f]=sha(await readFile(f));
const plan=JSON.parse(await readFile(path.join(import.meta.dirname,'plan.json'),'utf8'));
const methods=JSON.parse(await readFile(path.join(dir,'methods.json'),'utf8'));
const freeze={benchmark:plan.benchmark_version,frozen_at:new Date().toISOString(),origin:ORIGIN,release,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source_attestation:'Git commit is the locally deployed source recorded by the owner-controlled deployment; HTTP release header identifies the Worker, not a cryptographic attestation of source.',registry_version:methods.registry_version,resources,sources,plan_sha256:sha(JSON.stringify(plan)),client:{version:'1.0.0',node:process.version,python:execFileSync('python3',['--version'],{encoding:'utf8'}).trim(),tokenizer:'tiktoken 0.12.0 with pinned local o200k ranks',transport:'Shared loopback broker using curl HTTPS, gzip/br advertised and decoded by recorder, no JS/forms/prefetch/cache; one request per selected supplied link unless redirect or same-document fragment',payload:'encoded HTTP response body bytes measured before decompression; excludes headers/TLS; extracted tokens use o200k as a declared common proxy, not Luna billing tokens',reading:'all static HTML text including closed disclosure content is exposed uniformly; scripts/styles/SVG excluded; link label and aria-label preserved; no claims about attention'},plan};
await writeFile(path.join(dir,'freeze.json'),JSON.stringify(freeze,null,2)+'\n');console.log(JSON.stringify({release,registry_version:methods.registry_version,freeze:path.join(dir,'freeze.json')}));
