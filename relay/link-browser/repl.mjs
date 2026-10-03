// One authorized process, explicit capability profile. No shell evaluation or field input.
import {createInterface} from 'node:readline';
import {read,follow,select,submit,initialize,close} from './browser.mjs';
import {Presentation} from './presentation.mjs';
const presentation=new Presentation();
const show=(view,page=0)=>presentation.show(view,view.revision,page);
const id=process.argv[2]==='--new'?await initialize({profile:process.argv.includes('--prefix-menus')?'prefix-dropdowns':'supplied-links'}):process.argv[2];
const first=await read(id,{inspection:false});const started=performance.now();let lastOutput=started;let inputGapMs=0;
const timed=output=>({...output,clientTiming:{elapsedMs:Math.round(performance.now()-started),inputGapMs:Math.round(inputGapMs),scope:'Time between emitted responses and subsequent input; includes model, tools, scheduling and human delays, not model thinking alone.'}});
try{console.log(JSON.stringify(timed(show(first))));}catch(error){await close(id);console.log(JSON.stringify({error:error.message,failureClass:error.failureClass||'client-output-overflow'}));process.exit(1);}
const deadline=setTimeout(async()=>{console.log(JSON.stringify({error:'Four-minute trial deadline reached.',failureClass:'client-deadline'}));await close(id);process.exit(0);},first.remainingSeconds*1000);
for await(const line of createInterface({input:process.stdin,terminal:false})) {
  inputGapMs+=performance.now()-lastOutput;
  try {
    const input=JSON.parse(line);
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['action','name','section','page','option'].includes(k)))throw Error('Only read or follow a displayed link name is available.');
    if(input.name!==undefined&&typeof input.name!=='string'||input.option!==undefined&&typeof input.option!=='string'||input.section!==undefined&&typeof input.section!=='string')throw Error('Selection names and options must be strings.');
    if(input.action==='read'&&(input.name||input.section||input.option))throw Error('Read accepts no selection.');
    if(input.action==='follow'){
      if(input.page!==undefined||input.option!==undefined)throw Error('Follow accepts no output page or option.');
      presentation.requireObserved(input);
    }
    if(input.action==='select'||input.action==='submit'){if(input.page!==undefined||input.section!==undefined||(input.action==='submit'&&input.option!==undefined))throw Error('Use only the displayed dropdown name and option, or GET button name.');presentation.requireMenu(input,input.action==='submit');}
    const output=input.action==='read'?await read(id):input.action==='follow'?await follow(id,{name:input.name,...(input.section?{section:input.section}:{})}):input.action==='select'?await select(id,{name:input.name,option:input.option}):input.action==='submit'?await submit(id,input.name):(()=>{throw Error('Only read, follow, and permitted supplied menus are available.');})();
    console.log(JSON.stringify(timed(show(output,input.action==='read'?(input.page??0):0))));
  }catch(error){
    // A failed request leaves the last supplied page intact. Return it explicitly;
    // polling stdout again cannot recover an already completed command.
    const current=await read(id,{inspection:false}).then(view=>presentation.showRetained(view)).catch(()=>null);
    console.log(JSON.stringify(timed({error:error.message,failureClass:error.failureClass||'client-selection-or-protocol',...(error.networkCode?{networkCode:error.networkCode}:{}),...(Number.isFinite(error.elapsedMs)?{elapsedMs:error.elapsedMs}:{}),current,recovery:'The command has completed. Read the current page or follow a supplied link; empty polling will not retry it. Publication is never retried automatically.'})));
  }
  lastOutput=performance.now();
}
clearTimeout(deadline);
await close(id);
