export const CENTER_FACILITIES={
 vab:{name:'VAB · ロケット組立棟',description:'縦置きでロケットを組み立てます。設計を保存したら発射台へ。',button:'enterVAB'},
 sph:{name:'SPH · 航空機格納庫',description:'航空機・ローバー・船舶を組み立てます。保存した航空機は滑走路から出発。',button:'enterSPH'},
 pad:{name:'発射台',description:'保存した設計を選んで打ち上げます。飛行中の別の機体も残ります。',button:'centerPad'},
 runway:{name:'滑走路',description:'保存した設計を選んで地上から出発します。組立棟へ戻って調整できます。',button:'centerRunway'},
 tracking:{name:'追跡施設',description:'飛行中の機体と軌道を確認して、操縦・観察を再開します。',button:'centerTracking'}
};
export interface CenterHistoryEvent{type:string;name:string;universalTime:number;environment?:string;orbitEventIds?:readonly string[];moonEventIds?:readonly string[];orbit?:{periapsis:number;apoapsis:number}}
export interface ExplorationProgress{departure:CenterHistoryEvent|null;orbit:CenterHistoryEvent|null;returned:CenterHistoryEvent|null;moonArrival:CenterHistoryEvent|null;moonLanding:CenterHistoryEvent|null;moonReturn:CenterHistoryEvent|null}
export interface CenterGuidanceInput{partCount:number;designCount:number;vesselCount:number;libraryError?:boolean;history?:readonly CenterHistoryEvent[]}
export interface CenterGuidanceItem{title:string;completed:boolean;text:string}
export function explorationProgress(history:readonly CenterHistoryEvent[]=[]):ExplorationProgress{
 return {
  departure:history.find(e=>e.type==='launch'&&e.environment!==undefined&&['land','runway','water'].includes(e.environment))??null,
  orbit:history.find(e=>e.type==='orbit')??null,
  returned:history.find(e=>e.type==='recover'&&e.orbitEventIds?.length)??null,
  moonArrival:history.find(e=>e.type==='moon-arrival')??null,
  moonLanding:history.find(e=>e.type==='moon-landing')??null,
  moonReturn:history.find(e=>e.type==='recover'&&e.moonEventIds?.length)??null
 };
}
export function centerGuidance({partCount,designCount,vesselCount,libraryError=false,history=[]}:CenterGuidanceInput):CenterGuidanceItem[]{
 const progress=explorationProgress(history);
 const build=libraryError?'保存設計を確認できません。発射台・滑走路で詳細を確認できます。':designCount?`保存済み ${designCount} 設計。発射台・滑走路で選んで出発できます。`:partCount?`作業中 ${partCount} 部品。組立棟で設計を保存して、発射台・滑走路へ。`:'VAB/SPHで機体を作り、設計を保存して地表から出発しましょう。';
 const title=(name:string,event:CenterHistoryEvent|null)=>name+(event?' · 記録済み':' · 記録なし');
 const evidence=(event:CenterHistoryEvent)=>event.name+' · UT '+event.universalTime.toFixed(1)+' s';
 const apsides=(event:CenterHistoryEvent)=>{const orbit=event.orbit;if(!orbit)throw Error('軌道投入の記録に近点・遠点がありません');return `。近点 ${(orbit.periapsis/1000).toFixed(1)} km / 遠点 ${(orbit.apoapsis/1000).toFixed(1)} km。`;};
 return [
  {title:title('地表出発',progress.departure),completed:!!progress.departure,text:progress.departure?evidence(progress.departure)+'。'+build:build},
  {title:title('母星軌道投入',progress.orbit),completed:!!progress.orbit,text:progress.orbit?evidence(progress.orbit)+apsides(progress.orbit): '地表から打ち上げ、母星に束縛された軌道で近点を70 kmより高くします。練習・旧保存の未記録の飛行は達成数に含めません。'},
  {title:title('軌道から帰還・回収',progress.returned),completed:!!progress.returned,text:progress.returned?evidence(progress.returned)+'。次は衛星の運用や月への探査へ。':(vesselCount?`保持中 ${vesselCount} 機は追跡施設で確認できます。`:'帰還装備を備えた機体を設計しましょう。')+'軌道から逆噴射し、無損傷で着地・静止した機体を回収します。'}
 ,
  {title:title('月到達',progress.moonArrival),completed:!!progress.moonArrival,text:progress.moonArrival?evidence(progress.moonArrival):'地表から出発した機体で月の重力圏へ。周回後、月遷移計画で接近を準備します。'},
  {title:title('月面着陸',progress.moonLanding),completed:!!progress.moonLanding,text:progress.moonLanding?evidence(progress.moonLanding):'月で減速し、無損傷で接地・静止します。着陸脚と離陸用の燃料を用意しましょう。'},
  {title:title('月探査から帰還・回収',progress.moonReturn),completed:!!progress.moonReturn,text:progress.moonReturn?evidence(progress.moonReturn):'月へ到達した機体を母星へ戻し、着地後に回収します。フライバイ・周回からの帰還も記録します。'}
 ];
}
