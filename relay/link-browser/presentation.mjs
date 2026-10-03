// Local output pagination only: no navigation, ranking or target-aware filtering.
export const OUTPUT_BYTE_LIMIT=12000;
export function pages(view) {
  const {sections=[],...header}=view;
  const result=[];let current={...header,sections:[]};
  const flush=()=>{result.push(current);current={...header,sections:[]};};
  for(const section of sections) {
    // IDs are private browser implementation details; the REPL accepts names only.
    const items=[...(section.text||[]).map(text=>({text})),...(section.links||[]).map(({id,...link})=>({link})),...(section.controls||[]).map(control=>({control})),...(section.buttons||[]).map(button=>({button}))];
    if(!items.length)items.push({empty:true});
    for(const item of items) {
      const trial=structuredClone(current);
      let target=trial.sections.at(-1);
      if(!target||target.heading!==section.heading){target={heading:section.heading,text:[],links:[],controls:[],buttons:[]};trial.sections.push(target);}
      if(item.text!==undefined)target.text.push(item.text);
      if(item.link)target.links.push(item.link);
      if(item.control)target.controls.push(item.control);
      if(item.button)target.buttons.push(item.button);
      // Reserve space for the pagination metadata and error wrapper.
      if(Buffer.byteLength(JSON.stringify(trial))>OUTPUT_BYTE_LIMIT-1000&&current.sections.length){flush();}
      let actual=current.sections.at(-1);
      if(!actual||actual.heading!==section.heading){actual={heading:section.heading,text:[],links:[],controls:[],buttons:[]};current.sections.push(actual);}
      if(item.text!==undefined)actual.text.push(item.text);
      if(item.link)actual.links.push(item.link);
      if(item.control)actual.controls.push(item.control);
      if(item.button)actual.buttons.push(item.button);
    }
  }
  if(current.sections.length||!result.length)flush();
  return result.map((page,index)=>{
    const output={...page,outputPage:index,outputPages:result.length,outputComplete:result.length===1,localReadHint:result.length>1?'Read another output page with {"action":"read","page":N}. Local reads make no HTTP request or link activation.':undefined};
    if(Buffer.byteLength(JSON.stringify(output))>OUTPUT_BYTE_LIMIT){const error=Error('Page contains an oversized text or link item; bounded output cannot display it safely.');error.failureClass='client-output-overflow';throw error;}
    return output;
  });
}
export class Presentation {
  revision=null;observed=[];observedControls=[];observedButtons=[];lastPage=0;
  show(view,revision,page=0) {
    const output=pages(view);
    if(!Number.isInteger(page)||page<0||page>=output.length)throw Error('Unknown output page.');
    if(revision!==this.revision){this.revision=revision;this.observed=[];this.observedControls=[];this.observedButtons=[];}
    this.lastPage=page;
    const shown=output[page];
    shown.followHint='Follow the supplied aria name when present; otherwise use the label and its section. Local read commands do not navigate.';
    for(const section of shown.sections)for(const link of section.links)if(!this.observed.some(old=>old.label===link.label&&old.aria===link.aria&&old.section===section.heading))this.observed.push({...link,section:section.heading});
    for(const section of shown.sections){for(const c of section.controls||[]){const old=this.observedControls.findIndex(v=>v.name===c.name);if(old>=0)this.observedControls[old]=c;else this.observedControls.push(c);};for(const b of section.buttons||[]){if(!this.observedButtons.includes(b))this.observedButtons.push(b);};}
    return shown;
  }
  showRetained(view) {
    const count=pages(view).length;
    return this.show(view,view.revision,Math.min(this.lastPage,count-1));
  }
  requireMenu({name,option},submit=false) {
    if(submit){if(!this.observedButtons.includes(name))throw Error('GET button not shown in inspected output pages.');return;}
    if(!this.observedControls.some(c=>c.name===name&&c.options.includes(option)))throw Error('Dropdown option not shown in inspected output pages.');
  }
  requireObserved({name,section}) {
    if(!this.observed.some(link=>(link.label===name||link.aria===name)&&(!section||link.section===section)))throw Error('Link not shown in inspected output pages; read the relevant output page first.');
  }
}
