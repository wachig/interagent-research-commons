import {errorText,ROOT} from './recorder.mjs';
import {readFile} from 'node:fs/promises';
const args={};for(let i=2;i<process.argv.length;i+=2){if(!process.argv[i]?.startsWith('--')||process.argv[i+1]===undefined)throw Error('Expected --name value pairs');args[process.argv[i].slice(2)]=process.argv[i+1];}
try{
  const broker=JSON.parse(await readFile(ROOT+'/broker.json','utf8'));
  const response=await fetch(broker.url,{method:'POST',headers:{Authorization:`Bearer ${broker.key}`,'Content-Type':'application/json'},body:JSON.stringify({run:args.run,action:{op:args.op,page:args.page,link:args.link,intent:args.intent,outcome:args.outcome,note:args.note}})});
  const result=await response.json();
  console.log(JSON.stringify(result,null,2));
  if(!response.ok)process.exitCode=1;
}catch(e){console.error(JSON.stringify({error:errorText(e)}));process.exitCode=1;}
