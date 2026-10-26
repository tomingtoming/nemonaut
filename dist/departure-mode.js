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
 if(event.type==='recover'&&event.moonEventIds?.length)return '月探査から母星へ帰還・回収';
 if(event.type==='moon-arrival')return '月の重力圏に到達';
 if(event.type==='moon-landing')return '月面に着陸';
 if(event.type==='recover'&&event.orbitEventIds)return '母星軌道から帰還・回収';
 if(event.type==='orbit')return '母星軌道投入 · 近点 '+(event.orbit.periapsis/1000).toFixed(1)+' km / 遠点 '+(event.orbit.apoapsis/1000).toFixed(1)+' km';
 if(event.type!=='launch')return {recover:'回収',terminate:'運用終了'}[event.type];
 if(event.environment===undefined)return '出発（開始条件の記録なし）';
 const {mode,label}=departureMode(event.environment);
 return (mode==='practice'?'練習配置':'出発')+' · '+label;
}
export function updateDepartureButton(root,environment){
 const {mode,label}=departureMode(environment),button=root.querySelector('#launch');
 root.querySelector('#targetPracticeControl')?.toggleAttribute('hidden',environment!=='orbit');
 button.textContent=mode==='practice'?'練習配置へ ↗':'出発 ↗';
 button.title=label+(mode==='practice'?'から独立した練習を開始します':'から現在の世界に機体を追加します');
 root.querySelector('#departureNotice').textContent=mode==='practice'
  ?'通常世界から独立した練習です。通常の機体・時刻・履歴は変わりません。組立棟・センターへの移動や再読込で練習を終了します。'
  :'地表から出発します。現在の世界の他の機体は保持されます。';
}
