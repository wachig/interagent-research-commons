import {read,follow} from './browser.mjs';
const [action,id,handle,...rest]=process.argv.slice(2);
try {
  if(rest.length||!['read','follow'].includes(action)||(action==='read'&&handle)||(action==='follow'&&!handle))throw Error('Only read BROWSER and follow BROWSER LINK_HANDLE are available.');
  const view=action==='read'?await read(id):await follow(id,handle);
  console.log(JSON.stringify(view));
} catch(error) { console.error(error.message);process.exitCode=1; }
