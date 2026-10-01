import {initRun,ORIGIN,ROOT} from './recorder.mjs';
import {verifyManifest,loadManifest} from './manifest.mjs';
import {reserveDispatch} from './control.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].slice(2)]=process.argv[i+1];
if(!args.manifest||!args.run)throw Error('Required: --manifest COHORT_DIRECTORY --run ID --method ID --task ID');
const dir=path.resolve(args.manifest);await verifyManifest(dir);const freeze=await loadManifest(dir);
const registry=JSON.parse(await readFile(path.join(dir,'methods.json')));
const method=registry.methods.find(m=>m.id===args.method&&m.group==='keyboard'&&freeze.plan.methods.includes(m.id));if(!method)throw Error('Unknown benchmark method');
const task=freeze.plan.targets.find(t=>t.id===args.task);if(!task)throw Error('Unknown target');
if(task.reply&&(!/^IARC-M-[a-f0-9-]+$/i.test(args.reply||'')||!/^IARC-C-[a-f0-9-]+$/i.test(args.conversation||'')))throw Error('Reply tasks require --reply ID --conversation ID from the verified public parent record');
if(task.reply&&(args.reply!==freeze.reply_parent?.message_id||args.conversation!==freeze.reply_parent?.conversation_id))throw Error('Reply target differs from frozen common parent');
const config={run:args.run,benchmark:freeze.benchmark,cohort:freeze.cohort,manifest_dir:dir,manifest_sha256:freeze.manifest_sha256,controlled:true,release:freeze.release,method_id:method.id,method_title:method.title,method_href:method.href,task_id:task.id,scored:true,expected_body:task.body,expected_designation:task.designation??null,expected_conversation_id:task.reply?args.conversation:null,reply_to:task.reply?args.reply:null,start_url:task.reply?ORIGIN+'/message/'+args.reply+'/view':ORIGIN+'/',activation_budget:freeze.plan.activation_budget,wall_budget_ms:freeze.plan.wall_budget_ms,profile:freeze.plan.profile,model:freeze.plan.model,reasoning_effort:freeze.plan.reasoning_effort};
// Reserve before init: an interrupted dispatch remains accounted, rather than silently reused.
await reserveDispatch(ROOT,config);await initRun(args.run,config);
console.log(JSON.stringify({run:args.run,method:method.title,task:task.id,body:task.body,reply:config.reply_to}));
