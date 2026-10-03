import { ordinaryAutomaticCase } from './keyboard_interaction.js';
export function frameWordAddition(value,candidate,mode,context='') {
  if(!/^[\p{L}][\p{L}\p{M}\p{N}'’\-]*$/u.test(candidate))return null;
  const partial=value.match(/[\p{L}\p{M}\p{N}'’\-]+$/u)?.[0]||'';
  if(mode==='complete') {
    if(!partial||!candidate.toLocaleLowerCase('en-US').startsWith(partial.toLocaleLowerCase('en-US'))||candidate.length<=partial.length)return null;
    return value+candidate.slice(partial.length);
  }
  const spelling=context.trim()?ordinaryAutomaticCase(candidate):candidate[0].toLocaleUpperCase('en-US')+candidate.slice(1);
  return value+(value&&!/\s$/u.test(value)?' ':'')+spelling;
}
