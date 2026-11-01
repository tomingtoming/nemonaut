// Only intervals actually measured by this version are included.
export function copyObservationQuality(value,totals){
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('観測品質の形式が不正です');
 const result={};
 for(const key of ['day','night']){
  const q=value[key];if(!q||!['received','missed'].every(k=>Number.isFinite(q[k])&&q[k]>=0&&q[k]<=1e12)||q.received>totals[key]+1e-5)throw Error('観測品質の測定時間が不正です');
  result[key]={received:q.received,missed:q.missed};
 }return result;
}
export function qualitySummary(quality,key){
 const q=quality?.[key];if(!q)return null;
 const total=q.received+q.missed;return {...q,ratio:total>0?q.received/total:null};
}
