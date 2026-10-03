// Narrow optional capability profile: supplied Prefix dropdowns and their GET button.
// No free text, constructed action URLs, page JavaScript, or arbitrary forms.
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|#39);/g,v=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"}[v]));
const text=s=>decode(s.replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim();
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1].toLowerCase(),decode(m[2])]));
export function prefixMenus(html,url,revision) {
 const result=[];
 for(const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
  const a=attrs(m[1]);if(a.id!=='prefix-filter-form'||a.method?.toLowerCase()!=='get')continue;
  const action=new URL(a.action||url,url);
  if(action.origin!==new URL(url).origin||!/^\/predictive-keyboard\/html\/word-links\/state\/[^/]+$/.test(action.pathname)||action.search||action.hash)continue;
  const fields=[];let valid=true;
  for(const input of m[2].matchAll(/<input\b([^>]*)>/gi)){
   const f=attrs(input[1]);
   if(f.type!=='hidden'||!['view','layout'].includes(f.name)||/\bdisabled\b/i.test(input[1])){valid=false;break;}
   fields.push([f.name,f.value||'']);
  }
  if(!valid||fields.filter(([n,v])=>n==='view'&&v==='prefix').length!==1)continue;
  const controls=[];
  for(const select of m[2].matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)){
   const f=attrs(select[1]);
   if(!/^(start|inside|end)_[a-z]$/.test(f.name||'')||!f['aria-label']||/\bdisabled\b/i.test(select[1])){valid=false;break;}
   const options=[...select[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map(o=>{
    const oa=attrs(o[1]);return {label:text(o[2]),value:oa.value??text(o[2]),disabled:/\bdisabled\b/i.test(o[1]),selected:/\bselected\b/i.test(o[1])};
   });
   if(!options.length||options.some(o=>o.value!==''&&(!/^[\p{L}'’]{1,2}$/u.test(o.value)||o.value[0]!==f.name.at(-1)))){valid=false;break;}
   const selected=options.find(o=>o.selected)||options[0];
   controls.push({name:f.name,label:f['aria-label'],value:selected.disabled?null:selected.value,options:options.filter(o=>!o.disabled).map(({label,value})=>({label,value}))});
  }
  if(!valid||!controls.length||new Set(controls.map(c=>c.name)).size!==controls.length)continue;
  const buttons=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].filter(b=>{const ba=attrs(b[1]);return ba.form===a.id&&ba.type==='submit'&&!ba.name&&!/\bdisabled\b/i.test(b[1]);});
  if(buttons.length!==1)continue;
  result.push({id:`${revision}.prefix`,action:action.href,fields,controls,submit:text(buttons[0][2])});
 }
 return result;
}
export function selectMenu(forms,{name,option}) {
 const matches=forms.flatMap(f=>f.controls.filter(c=>c.label===name).map(c=>({f,c})));
 if(matches.length!==1)throw Error('Choose an inspected supplied dropdown name.');
 const {c}=matches[0];const options=c.options.filter(o=>o.label===option);
 if(options.length!==1)throw Error('Choose an exact displayed enabled option label.');
 c.value=options[0].value;
}
export function suppliedFormDestination(forms,name) {
 const matches=forms.filter(f=>f.submit===name);
 if(matches.length!==1)throw Error('Choose an inspected supplied GET button.');
 const f=matches[0];const destination=new URL(f.action);const values=new URLSearchParams(f.fields);
 for(const c of f.controls)if(c.value!==null)values.append(c.name,c.value);
 destination.search=values.toString();return destination.href;
}
export function menuSections(forms) {
 return forms.map(f=>({heading:'Prefix dropdowns',text:[],links:[],controls:f.controls.map(c=>({name:c.label,selected:c.options.find(o=>o.value===c.value)?.label??null,options:c.options.map(o=>o.label)})),buttons:[f.submit]}));
}
