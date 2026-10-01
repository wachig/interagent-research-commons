// Embind vectors own WASM allocations; collecting their rows must release them.
export function collectPredictionResults(rows, limit) {
  const candidates=[];
  try {
    for(let index=0;index<rows.size()&&candidates.length<limit;index++) {
      const row=rows.get(index);
      try {
        let value=row.prediction;
        try { const parsed=JSON.parse(value);if(typeof parsed==='string')value=parsed; } catch {}
        value=value.trim();
        if(value&&value.length<=80&&!/[\u0000-\u001F\u007F]/u.test(value)&&!candidates.some(c=>c.text===value)){
          const probability=Number(row.probability);
          candidates.push({text:value,score:Number.isFinite(probability)&&probability>0?probability:null,rank:index});
        }
      } finally { if(typeof row?.delete==='function')row.delete(); }
    }
    return candidates;
  } finally { rows.delete(); }
}
