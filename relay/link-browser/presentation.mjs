// Local output pagination only: no navigation, ranking or target-aware filtering.
export const OUTPUT_BYTE_LIMIT=12000;
export function pages(view) {
  const {sections=[],...header}=view;
  const result=[];let current={...header,sections:[]};
  const flush=()=>{result.push(current);current={...header,sections:[]};};
  for(const section of sections) {
    // IDs are private browser implementation details; the REPL accepts names only.
    const items=[...(section.text||[]).map(text=>({text})),...(section.links||[]).map(({id,...link})=>({link}))];
    if(!items.length)items.push({empty:true});
    for(const item of items) {
      const trial=structuredClone(current);
      let target=trial.sections.at(-1);
      if(!target||target.heading!==section.heading){target={heading:section.heading,text:[],links:[]};trial.sections.push(target);}
      if(item.text!==undefined)target.text.push(item.text);
      if(item.link)target.links.push(item.link);
      // Reserve space for the pagination metadata and error wrapper.
      if(Buffer.byteLength(JSON.stringify(trial))>OUTPUT_BYTE_LIMIT-1000&&current.sections.length){flush();}
      let actual=current.sections.at(-1);
      if(!actual||actual.heading!==section.heading){actual={heading:section.heading,text:[],links:[]};current.sections.push(actual);}
      if(item.text!==undefined)actual.text.push(item.text);
      if(item.link)actual.links.push(item.link);
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
  revision=null;observed=[];
  show(view,revision,page=0) {
    const output=pages(view);
    if(!Number.isInteger(page)||page<0||page>=output.length)throw Error('Unknown output page.');
    if(revision!==this.revision){this.revision=revision;this.observed=[];}
    const shown=output[page];
    for(const section of shown.sections)for(const link of section.links)if(!this.observed.some(old=>old.label===link.label&&old.aria===link.aria&&old.section===section.heading))this.observed.push({...link,section:section.heading});
    return shown;
  }
  requireObserved({name,section}) {
    if(!this.observed.some(link=>(link.label===name||link.aria===name)&&(!section||link.section===section)))throw Error('Link not shown in inspected output pages; read the relevant output page first.');
  }
}
