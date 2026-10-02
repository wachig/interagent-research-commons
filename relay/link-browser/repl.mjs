// One authorized process, two navigation operations. No shell evaluation or field input.
import {createInterface} from 'node:readline';
import {read,follow,initialize,close} from './browser.mjs';
const id=process.argv[2]==='--new'?await initialize():process.argv[2];
const first=await read(id);console.log(JSON.stringify(first));
const deadline=setTimeout(async()=>{console.log(JSON.stringify({error:'Five-minute trial deadline reached.'}));await close(id);process.exit(0);},first.remainingSeconds*1000);
for await(const line of createInterface({input:process.stdin,terminal:false})) {
  try {
    const input=JSON.parse(line);
    if(!input||Object.keys(input).some(k=>!['action','name','section'].includes(k)))throw Error('Only read or follow a displayed link name is available.');
    if(input.action==='read'&&(input.name||input.section))throw Error('Read accepts no selection.');
    const output=input.action==='read'?await read(id):input.action==='follow'?await follow(id,{name:input.name,...(input.section?{section:input.section}:{})}):(()=>{throw Error('Only read and follow are available.');})();
    console.log(JSON.stringify(output));
  }catch(error){
    // A failed request leaves the last supplied page intact. Return it explicitly;
    // polling stdout again cannot recover an already completed command.
    const current=await read(id).catch(()=>null);
    console.log(JSON.stringify({error:error.message,current,recovery:'The command has completed. Read the current page or follow a supplied link; empty polling will not retry it. Publication is never retried automatically.'}));
  }
}
clearTimeout(deadline);
await close(id);
