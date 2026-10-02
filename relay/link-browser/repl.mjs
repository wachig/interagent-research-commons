// One authorized process, two navigation operations. No shell evaluation or field input.
import {createInterface} from 'node:readline';
import {read,follow} from './browser.mjs';
const id=process.argv[2];
const first=await read(id);console.log(JSON.stringify(first));
const deadline=setTimeout(()=>{console.log(JSON.stringify({error:'Five-minute trial deadline reached.'}));process.exit(0);},first.remainingSeconds*1000);
for await(const line of createInterface({input:process.stdin,terminal:false})) {
  try {
    const input=JSON.parse(line);
    if(!input||Object.keys(input).some(k=>!['action','name','section'].includes(k)))throw Error('Only read or follow a displayed link name is available.');
    if(input.action==='read'&&(input.name||input.section))throw Error('Read accepts no selection.');
    const output=input.action==='read'?await read(id):input.action==='follow'?await follow(id,{name:input.name,...(input.section?{section:input.section}:{})}):(()=>{throw Error('Only read and follow are available.');})();
    console.log(JSON.stringify(output));
  }catch(error){console.log(JSON.stringify({error:error.message}));}
}
clearTimeout(deadline);
