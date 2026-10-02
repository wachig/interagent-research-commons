// Create a NEW directory. Historical cohorts and evidence are never overwritten.
import {wireGet,ORIGIN} from './recorder.mjs';
import {hash,runtimeFingerprint,REPO,plannedSlots} from './manifest.mjs';
import {atomicJson} from './storage.mjs';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].slice(2)]=process.argv[i+1];
if(!args.output||!args.plan)throw Error('Required: --output NEW_DIRECTORY --plan PLAN_FILE');
const dir=path.resolve(args.output),plan=JSON.parse(await readFile(args.plan));plannedSlots(plan);
if(!plan.cohort||!plan.benchmark_version||!plan.spending_limits)throw Error('Plan needs cohort, version and spending limits');
if(!plan.pilot_target_ids?.length||plan.pilot_target_ids.some(id=>!plan.targets.some(t=>t.id===id)))throw Error('Plan needs valid pilot_target_ids');for(const limits of [plan.spending_limits,plan.expanded_spending_limits])for(const value of Object.values(limits||{}))if(!Number.isFinite(value)||value<=0)throw Error('Spending limits must be finite and positive');
let replyParent=null;if(plan.targets.some(t=>t.reply)){if(!args['reply-parent'])throw Error('Reply targets require --reply-parent VERIFIED_PUBLIC_PARENT.json');const parent=JSON.parse(await readFile(args['reply-parent']));if(!/^IARC-M-[a-f0-9-]+$/i.test(parent.message_id||'')||!/^IARC-C-[a-f0-9-]+$/i.test(parent.conversation_id||''))throw Error('Invalid verified reply parent');replyParent={message_id:parent.message_id,conversation_id:parent.conversation_id,record_sha256:hash(JSON.stringify(parent))};}
const runtime=runtimeFingerprint();await mkdir(dir,{mode:0o700});
const resources={};let release;
for(const route of ['/service.json','/methods.json','/protocol.json','/privacy.txt','/participation-policy.txt']){
 const r=await wireGet(ORIGIN+route,{accept:'application/json'});
 if(r.status!==200||!r.headers['x-relay-release'])throw Error('Freeze read failed: '+route);
 if(release&&release!==r.headers['x-relay-release'])throw Error('Release changed during freeze');release=r.headers['x-relay-release'];
 await writeFile(path.join(dir,route.slice(1)),r.text,{mode:0o600});resources[route]={sha256:hash(r.text),release,headers:r.headers};
}
const serviceFiles=['relay/frame_keyboard.js','relay/frame_document.js','relay/methods-2.0.1.json','relay/brand.js','relay/span_keyboard.js','relay/span_contract.js','relay/semantic/build-span.py','relay/assets/span-keyboard/1.0.0/manifest.json','relay/assets/span-keyboard/1.0.0/help.html','relay/short_word_keyboard.js','relay/short_words-1.0.0.json','relay/semantic/build-short-words.py','relay/keyboard_exact_view.js','relay/prediction_results.js','relay/keyboard_foundation.js','relay/runtime.js','relay/chunk_exact.js','relay/phrase_safety.js','relay/prefix_keyboard_vocabulary.js','relay/chunk_keyboard_three_letter_vocabulary.js','relay/html_keyboard.js','relay/html_keyboard_word.js','relay/html_keyboard_word2.js','relay/html_keyboard_word3.js','relay/token_composer.js','relay/html_keyboard_model.json','relay/assets/semantic-lexicon/manifest.json','relay/assets/semantic-lexicon/chunk-order-manifest.json','relay/assets/o200k/manifest.json','relay/tokenizers/o200k_base.tiktoken'];
const harness=(await readdir(import.meta.dirname)).filter(f=>!f.startsWith('.')&&/\.(?:mjs|py|txt)$/.test(f)).map(f=>'relay/benchmark/'+f);
const files=[...new Set([...serviceFiles,...harness,path.relative(REPO,path.resolve(args.plan))])];
const spanManifest=JSON.parse(await readFile(path.join(REPO,'relay/assets/span-keyboard/1.0.0/manifest.json')));
files.push(...Object.keys(spanManifest.files).map(f=>'relay/assets/span-keyboard/1.0.0/'+f));
const sources={};for(const f of files)sources[f]=hash(await readFile(path.join(REPO,f)));
const registry=JSON.parse(await readFile(path.join(dir,'methods.json')));
await atomicJson(path.join(dir,'freeze.json'),{schema_version:2,benchmark:plan.benchmark_version,cohort:plan.cohort,frozen_at:new Date().toISOString(),origin:ORIGIN,release,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),deployed_service_commit:args['deployed-commit']||null,source_attestation:'Local file hashes and owner-supplied deployment provenance; release header is not cryptographic source attestation.',registry_version:registry.registry_version,reply_parent:replyParent,resources,sources,runtime,plan_sha256:hash(JSON.stringify(plan)),plan});
console.log(JSON.stringify({directory:dir,release,cohort:plan.cohort}));
