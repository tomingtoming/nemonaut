const environments={
 land:['surface','発射台 / 地上'],runway:['surface','滑走路'],water:['surface','海面'],
 drop:['practice','高度1 km降下'],entry:['practice','高度45 km再突入'],
 orbit:['practice','母星80 km円軌道'],'moon-orbit':['practice','月20 km円軌道'],
 'moon-surface':['practice','月面'],transfer:['practice','月遷移用の母星80 km軌道']
};
export function departureMode(environment){
 if(!Object.hasOwn(environments,environment))throw Error('出発環境が不正です');
 const [mode,label]=environments[environment];return {mode,label};
}
export function historyActionLabel(event){
 if(event.type!=='launch')return {recover:'回収',terminate:'運用終了'}[event.type];
 if(event.environment===undefined)return '出発（開始条件の記録なし）';
 const {mode,label}=departureMode(event.environment);
 return (mode==='practice'?'練習配置':'出発')+' · '+label;
}
export function updateDepartureButton(root,environment){
 const {mode,label}=departureMode(environment),button=root.querySelector('#launch');
 button.textContent=mode==='practice'?'練習配置へ ↗':'出発 ↗';
 button.title=label+'から現在の世界に機体を追加します';
 root.querySelector('#departureNotice').textContent=mode==='practice'
  ?'練習用の開始位置に直接配置します。現在の世界に追加され、飛行中は他の機体の時間も進みます。'
  :'地表から出発します。現在の世界の他の機体は保持されます。';
}
