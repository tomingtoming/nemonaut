// Explicit catalog sizes, not a per-vessel visual scale. Existing craft stay unchanged.
export const LARGE_VARIANTS={
 transportCockpit:{base:'cockpit',scale:4.8,factor:25,name:'輸送機コックピット',code:'TC-6'},
 transportFuselage:{base:'tank',scale:4.8,factor:25,name:'輸送機燃料胴体',code:'TF-45000'},
 transportTail:{base:'nose',scale:4.8,factor:25,name:'輸送機テールコーン',code:'TT-6'},
 transportWingRoot:{base:'wing',scale:7,factor:49,name:'大型内翼区画',code:'WI-14'},
 enginePylon:{base:'truss',scale:1.5,factor:4,name:'エンジンパイロン',code:'PY-15'},
 transportWing:{base:'wing',scale:7,factor:49,name:'大型外翼区画',code:'TW-14'},
 transportJet:{base:'jet',scale:3,factor:10,name:'輸送機ターボファン',code:'TF-180'},
 transportStabilizer:{base:'stabilizer',scale:5,factor:25,name:'大型安定板 9 m',code:'TS-9'},
 transportElevator:{base:'elevator',scale:5,factor:25,name:'大型エレベーター 9 m',code:'TE-9'},
 cockpitLarge:{base:'cockpit',scale:3,factor:9,name:'大型コックピット',code:'FC-6'},
 fuselageLarge:{base:'tank',scale:3,factor:9,name:'大型航空燃料胴体',code:'AF-16200'},
 jetLarge:{base:'jet',scale:3,factor:5,name:'大型ターボファン',code:'TF-90'},
 wingLarge:{base:'wing',scale:3,factor:9,name:'大型主翼',code:'SW-6'},
 stabilizerLarge:{base:'stabilizer',scale:3,factor:9,name:'大型安定板',code:'ST-3'},
 elevatorLarge:{base:'elevator',scale:3,factor:9,name:'大型エレベーター',code:'EL-3'},
 aileronLarge:{base:'aileron',scale:3,factor:9,name:'大型エルロン',code:'AL-3'},
 rudderLarge:{base:'rudder',scale:3,factor:9,name:'大型ラダー',code:'RD-3'},
 nosegearLarge:{base:'nosegear',scale:3,factor:9,name:'大型操向前脚',code:'NG-3'},
 maingearLarge:{base:'maingear',scale:3,factor:9,name:'大型主脚',code:'MG-3'},
 marineCabin:{base:'cockpit',scale:4,factor:64,name:'大型水密操縦区画',code:'MC-8'},
 marineFrame:{base:'truss',scale:4,factor:64,name:'大型船体フレーム',code:'MF-4'},
 hullLarge:{base:'pontoon',scale:4,factor:64,name:'大型浮力船体',code:'HL-12'},
 ballastLarge:{base:'ballast',scale:4,factor:64,name:'大型バラスト区画',code:'BT-67'},
 propellerLarge:{base:'propeller',scale:4,factor:64,name:'大型可動スクリュー',code:'MP-384'}
};
export function installLargeParts(parts){
 for(const [id,spec]of Object.entries(LARGE_VARIANTS)){
  const {base,scale:s,factor:k,name,code}=spec,d=structuredClone(parts[base]);
  delete d.model;d.name=name;d.code=code;d.size=d.size.map(v=>v*s);
  for(const key of ['mass','fuel','thrust','battery'])if(d[key])d[key]*=k;
  for(const key of ['volume','ballast'])if(d[key])d[key]*=s**3;
  for(const key of ['ac','massCenter'])if(d[key])d[key]=d[key].map(v=>v*s);
  for(const key of ['chord','hingeY'])if(d[key])d[key]*=s;
  if(d.wing)d.wing*=s*s;
  if(id==='transportWingRoot'){d.wing=156.8;d.chord=11.2;d.ac=[7,0,0];d.massCenter=[7,0,0];}
  d.desc=d.wing?`面積 ${d.wing.toFixed(2)} m²。大型胴体用。重心からの配置と気流で効きが変わります。`:
   d.fuel?`直径 ${d.size[0]} m・燃料 ${d.fuel} kg。複数基の航空エンジンへ供給。`:
   d.ballast?`排水容積 ${d.volume.toFixed(1)} m³。注排水 ${d.ballast} kgで浮沈を調整。`:
   d.volume?`長さ ${d.size[1]} m・排水容積 ${d.volume.toFixed(1)} m³。組み合わせて船体を構成。`:
   d.thrust?`推力 ${(d.thrust/1000).toFixed(0)} kN。${d.water?'水中専用・可動推進器で操向。':'大気中専用。接続した燃料胴体から供給。'}`:
   d.wheel?'大型航空機用。接地・自由転動・制動。前脚のみA/D操向。':'大型機の独立した組立部品。接続・保存・質量計算に対応。';
  if(id==='propellerLarge'){d.gimbal=25;d.gimbalPivot=[0,0,0];}
  parts[id]=d;
 }
}
