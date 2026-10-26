export const PARTS = {
 tankSmall:{name:'小型タンク',code:'FT-225',cat:'燃料',mass:25,fuel:225,size:[0.625,1,0.625],desc:'直径0.625 m・推進剤225 kg。接続したエンジンへ供給。'},
 tankLarge:{name:'大型タンク',code:'FT-14400',cat:'燃料',mass:1200,fuel:14400,size:[2.5,4,2.5],desc:'直径2.5 m・推進剤14400 kg。接続したエンジンへ供給。'},
 adapterSmall:{name:'異径アダプター 0.625–1.25',code:'AD-125',cat:'構造',mass:30,size:[1.25,0.6,1.25],desc:'上面0.625 m／下面1.25 m。燃料は通過。回転して逆向きにも接続可能。'},
 adapterLarge:{name:'異径アダプター 1.25–2.5',code:'AD-250',cat:'構造',mass:120,size:[2.5,1,2.5],desc:'上面1.25 m／下面2.5 m。燃料は通過。回転して逆向きにも接続可能。'},
 decouplerSmall:{name:'分離リング 0.625 m',code:'DC-62',cat:'構造',mass:15,size:[0.625,0.16,0.625],decoupler:true,desc:'直径0.625 m。ステージで接続枝を分離。燃料通過なし。'},
 decouplerLarge:{name:'分離リング 2.5 m',code:'DC-250',cat:'構造',mass:140,size:[2.5,0.32,2.5],decoupler:true,desc:'直径2.5 m。ステージで接続枝を分離。燃料通過なし。'},
 engineSeaSmall:{name:'小型海面用エンジン',code:'SL-12',cat:'推進',mass:70,thrust:12000,isp:310,ispSeaLevel:285,size:[0.625,0.8,0.625],gimbal:6,gimbalPivot:[0,0.120,0],desc:'直径0.625 m。推力 海面11.0／真空12 kN、比推力 285／310 s。ジンバル6°。'},
 engineVacSmall:{name:'小型真空用エンジン',code:'VX-6',cat:'推進',mass:35,thrust:6000,isp:350,ispSeaLevel:100,size:[0.625,1,0.625],gimbal:6,gimbalPivot:[0,0.150,0],desc:'直径0.625 m。推力 海面1.7／真空6 kN、比推力 100／350 s。ジンバル6°。'},
 engineSeaMedium:{name:'中型海面用エンジン',code:'SL-90',cat:'推進',mass:500,thrust:90000,isp:320,ispSeaLevel:290,size:[1.25,1.4,1.25],gimbal:6,gimbalPivot:[0,0.210,0],desc:'直径1.25 m。推力 海面81.6／真空90 kN、比推力 290／320 s。ジンバル6°。'},
 engineVacMedium:{name:'中型真空用エンジン',code:'VX-60',cat:'推進',mass:280,thrust:60000,isp:360,ispSeaLevel:110,size:[1.25,1.8,1.25],gimbal:6,gimbalPivot:[0,0.270,0],desc:'直径1.25 m。推力 海面18.3／真空60 kN、比推力 110／360 s。ジンバル6°。'},
 engineSeaLarge:{name:'大型海面用エンジン',code:'SL-650',cat:'推進',mass:2300,thrust:650000,isp:320,ispSeaLevel:285,size:[2.5,2.4,2.5],gimbal:6,gimbalPivot:[0,0.360,0],desc:'直径2.5 m。推力 海面578.9／真空650 kN、比推力 285／320 s。ジンバル6°。'},
 engineVacLarge:{name:'大型真空用エンジン',code:'VX-250',cat:'推進',mass:1200,thrust:250000,isp:365,ispSeaLevel:120,size:[2.5,3,2.5],gimbal:6,gimbalPivot:[0,0.450,0],desc:'直径2.5 m。推力 海面82.2／真空250 kN、比推力 120／365 s。ジンバル6°。'},
 battery:{name:'バッテリー',code:'BP-1000',cat:'装備',mass:35,size:[.8,.3,.5],battery:1000,desc:'1000 ECの蓄電池。機体全体へ給電し、太陽電池から充電。姿勢制御装置は内蔵しません。'},
 landingLeg:{name:'固定式着陸脚',code:'LL-16',cat:'構造',mass:45,size:[.65,1.6,.65],landingLeg:true,desc:'幅65 cmの接地パッドと支柱。固定式。四脚で推進器を地面から離し、低速で接地してください。'},
 heatShield:{name:'熱シールド',code:'HS-20',cat:'構造',mass:70,size:[2,.28,2],heatShield:true,shieldRadius:1,shieldNormal:[0,-1,0],ablator:40,noseRadius:1,maxTemperature:1800,desc:'直径2 mの曲面耐熱材。茶色の面（ローカル−Y）を進行方向へ。消耗材40 kgで加熱を吸収。'},
 dockingPort:{name:'ドッキングポート',code:'DP-12',cat:'構造',mass:55,size:[1.25,.242,1.25],docking:true,dockFace:.121,desc:'正面はローカル+Y。ポート面を向き合わせて低速で結合。'},
 rcs:{name:'RCSブロック',code:'RC-6',cat:'推進',mass:16,monoprop:12,rcsThrust:120,rcsIsp:65,size:[.48,.48,.48],desc:'6方向・各120 N。内蔵単一推進剤12 kg。配置と重心で姿勢制御の効きが変わります。'},
 capsule:{name:'コマンドポッド',code:'CP-1',cat:'指令',mass:620,size:[1.25,1.3,1.25],control:true,reactionTorque:7000,battery:1000,desc:'耐熱外殻と姿勢制御を備える有人カプセル。'},
 probe:{name:'探査コア',code:'OC-4',cat:'指令',mass:90,size:[1.25,.4,1.25],control:true,reactionTorque:1200,battery:200,desc:'小型無人機のための軽量制御ユニット。'},
 cockpit:{name:'コックピット',code:'FC-2',cat:'指令',mass:510,size:[1.25,2,1.25],control:true,battery:500,desc:'航空機・ローバー向けの広視界キャノピー。'},
 tank:{name:'中型タンク',code:'FT-200',cat:'燃料',mass:150,fuel:1800,size:[1.25,2,1.25],desc:'直径1.25 m・推進剤1800 kg。同じ燃料系統へ推進剤を供給。分離リングを越えては流れません。'},
 engine:{name:'液体燃料エンジン',code:'RE-45',cat:'推進',mass:270,thrust:45000,isp:300,size:[1.25,1.2,1.25],gimbal:6,gimbalPivot:[0,.16,0],desc:'45 kN・最大6度のジンバル。ノズルを傾けて推力方向を制御。'},
 jet:{name:'ターボジェット',code:'TJ-18',cat:'推進',mass:230,thrust:18000,isp:1800,air:true,size:[1.25,1.2,1.25],desc:'大気中専用。高度とともに推力が低下する。'},
 propeller:{name:'スクリュー',code:'MP-6',cat:'推進',mass:60,thrust:6000,isp:3000,water:true,size:[.8,.5,.8],desc:'水中専用推進器。船・潜水艇の推進に。'},
 nose:{name:'ノーズコーン',code:'NC-1',cat:'構造',mass:65,size:[1.25,1,1.25],desc:'機首を覆う軽量の整流コーン。'},
 decoupler:{name:'分離リング',code:'DC-12',cat:'構造',mass:40,size:[1.25,.22,1.25],decoupler:true,desc:'ステージ実行時、この部品から先の接続枝を分離。'},
 truss:{name:'構造フレーム',code:'TR-1',cat:'構造',mass:65,size:[1,1,1],desc:'ローバーや宇宙機の骨組み。6方向に接続可能。'},
 wing:{name:'主翼・固定翼',code:'SW-2',cat:'空力',mass:55,size:[2,1.6,.12],wing:2.1,ac:[.80,.13,0],massCenter:[.8,-.20,0],chord:1.1,desc:'空気速度と迎角から揚力が発生。基部はローカルX=0。'},
 fin:{name:'可動ロケットフィン',code:'RF-2',cat:'空力',mass:55,size:[2,1.6,.12],model:'wing',wing:2.1,ac:[.8,.13,0],massCenter:[.8,-.2,0],chord:1.1,controlAxis:'auto',maxDeflection:18,hingeY:.13,desc:'全遊動フィン。配置に合わせてピッチ・ヨー・ロールへ混合。気流が必要。'},
 stabilizer:{name:'水平・垂直安定板',code:'ST-1',cat:'空力',mass:25,size:[1.8,.65,.09],wing:1.05,chord:.65,ac:[0,.16,0],desc:'固定安定板。回転させて垂直尾翼にも使えます。'},
 elevator:{name:'エレベーター',code:'EL-1',cat:'空力',mass:12,size:[1.8,.4,.08],wing:.72,chord:.4,ac:[0,.1,0],controlAxis:'pitch',maxDeflection:25,desc:'水平尾翼の昇降舵。空気速度と重心からの腕で効きが変化。'},
 aileron:{name:'エルロン',code:'AL-1',cat:'空力',mass:10,size:[1.4,.3,.07],wing:.42,chord:.3,ac:[0,.075,0],controlAxis:'roll',maxDeflection:22,desc:'主翼後縁の独立した補助翼。左右の揚力差でロール。'},
 rudder:{name:'ラダー',code:'RD-1',cat:'空力',mass:10,size:[.8,.4,.07],wing:.32,chord:.4,ac:[0,.1,0],controlAxis:'yaw',maxDeflection:28,desc:'垂直尾翼の方向舵。横方向の空気力でヨーを制御。'},
 nosegear:{name:'操向前脚',code:'NG-1',cat:'走行',mass:35,size:[.34,.7,.7],wheel:true,steer:true,model:'wheel',desc:'前輪1輪の操向脚。地上のA/D入力で操向。'},
 maingear:{name:'主脚',code:'MG-1',cat:'走行',mass:45,size:[.34,.7,.7],wheel:true,model:'wheel',desc:'航空機の自由転動する主脚。ブレーキ付き。'},
 wheel:{name:'駆動輪',code:'RW-7',cat:'走行',mass:45,size:[.34,.7,.7],wheel:true,steer:true,desc:'接地中に駆動・ブレーキ・操舵できるサスペンション輪。'},
 parachute:{name:'回収パラシュート',code:'RC-14',cat:'装備',mass:80,size:[.8,.4,.8],parachute:154,maxTemperature:500,desc:'耐熱限界500 K。再突入中は熱シールドの背後に。Hで待機。高度5 km以下・250 m/s未満で縮帆、1.5 km以下・80 m/s未満で全開。'},
 solar:{name:'ソーラーパネル',code:'SP-2',cat:'装備',mass:22,size:[2,1,.08],solarPower:.8,desc:'最大0.8 EC/s。表面の向きと天体の影で発電量が変化。'},
 pontoon:{name:'フロート',code:'FL-3',cat:'船舶',mass:85,size:[1,3,.8],volume:1.9,desc:'水密の浮体。水没体積に応じた浮力を生む。'},
 ballast:{name:'バラストタンク',code:'BT-1',cat:'船舶',mass:110,size:[1.25,1,1.25],volume:1.05,ballast:1050,desc:'注排水で質量を変え、浮上・潜航を調整する。'}
};
export const CATEGORIES=['すべて','指令','燃料','推進','構造','空力','走行','装備','船舶'];
export function nodes(type){const d=PARTS[type], [x,y,z]=d.size;if(type==='wing'||type==='fin')return [[0,0,0,-1,0,0],[x,0,0,1,0,0]];return [[0,y/2,0,0,1,0],[0,-y/2,0,0,-1,0],[x/2,0,0,1,0,0],[-x/2,0,0,-1,0,0],[0,0,z/2,0,0,1],[0,0,-z/2,0,0,-1]];}
export function part(type,p=[0,0,0],r=[0,0,0],parent=null,stage=0){return {id:crypto.randomUUID(),type,p,r,parent,stage};}
export function preset(kind){let a=[];const add=(t,p,r=[0,0,0],par=0,stage=0)=>{const o=part(t,p,r,a[par]?.id??null,stage);a.push(o);return a.length-1;};
 if(kind==='atlas'){
  add('probe',[0,0,0]);const upper=add('tank',[0,-1.2,0]);
  const upper2=add('tank',[0,-3.2,0],[0,0,0],upper);
  const vacuum=add('engineVacMedium',[0,-5.1,0],[0,0,0],upper2,1);
  const separator=add('decoupler',[0,-6.11,0],[0,0,0],vacuum,1);
  const adapter=add('adapterLarge',[0,-6.72,0],[0,0,0],separator);
  const lower=add('tankLarge',[0,-9.22,0],[0,0,0],adapter);
  const lower2=add('tankLarge',[0,-13.22,0],[0,0,0],lower);
  add('engineSeaLarge',[0,-16.42,0],[0,0,0],lower2);
  for(const x of [-1.6,1.6])add('solar',[x,0,0]);
 }
 if(kind==='rocket'){add('capsule',[0,3.6,0]);add('tank',[0,1.95,0]);add('engine',[0,.35,0],[0,0,0],1);for(let i=0;i<4;i++){const t=i*Math.PI/2;add('fin',[.625*Math.cos(t),.8,-.625*Math.sin(t)],[0,t,0],1);} }
 if(kind==='launcher'||kind==='returner'){add('capsule',[0,5.6,0]);add('tank',[0,3.95,0]);add('tank',[0,1.95,0],[0,0,0],1);add('engine',[0,.35,0],[0,0,0],2,1);add('decoupler',[0,-.36,0],[0,0,0],3,1);add('tank',[0,-1.47,0],[0,0,0],4);add('tank',[0,-3.47,0],[0,0,0],5);add('tank',[0,-5.47,0],[0,0,0],6);for(const x of [-.7,.7])for(const z of [-.7,.7])add('engine',[x,-7.07,z],[0,0,0],7);for(let i=0;i<4;i++){const t=i*Math.PI/2;add('fin',[.625*Math.cos(t),-5.5,-.625*Math.sin(t)],[0,t,0],7);}}
 if(kind==='returner'){for(let i=1;i<a.length;i++)a[i].p[1]-=.50;const shield=part('heatShield',[0,4.81,0],[0,0,0],a[0].id);const separator=part('decoupler',[0,4.56,0],[0,0,0],shield.id,2);a.push(shield);a[1].parent=separator.id;a.push(separator);a.push(part('parachute',[0,6.45,0],[0,0,0],a[0].id,3));}
 if(kind==='reentry'){add('capsule',[0,0,0]);add('heatShield',[0,-.79,0]);add('parachute',[0,.85,0]);}
 if(kind==='lunar-return'){add('capsule',[0,0,0]);add('heatShield',[0,-.79,0]);add('parachute',[0,.85,0],[0,0,0],0,2);const separator=add('decoupler',[0,-1.04,0],[0,0,0],1,1);const tank=add('tank',[0,-2.15,0],[0,0,0],separator);add('engine',[0,-3.75,0],[0,0,0],tank);for(const x of [-1.6,1.6])add('solar',[x,-2.15,0],[0,0,0],tank);}
 if(kind==='lunar-expedition'){
  a=preset('lunar-return');for(const p of a){if(p.type==='engine')p.stage=2;else if(p.type==='decoupler')p.stage=3;else if(p.type==='parachute')p.stage=4;}
  const upper=a.findIndex(p=>p.type==='engine'),middleSeparator=add('decoupler',[0,-4.46,0],[0,0,0],upper,2);
  const middleTop=add('tank',[0,-5.57,0],[0,0,0],middleSeparator),middleBottom=add('tank',[0,-7.57,0],[0,0,0],middleTop);
  for(const x of [-.7,.7])add('engine',[x,-9.17,0],[0,0,0],middleBottom,1);
  const lowerSeparator=add('decoupler',[0,-9.88,0],[0,0,0],middleBottom,1);let tank=lowerSeparator;
  for(let i=0;i<5;i++)tank=add('tank',[0,-10.99-2*i,0],[0,0,0],tank);
  for(let i=0;i<6;i++){const angle=i*Math.PI/3;add('engine',[1.25*Math.cos(angle),-20.59,1.25*Math.sin(angle)],[0,0,0],tank);}
  for(let i=0;i<4;i++){const angle=i*Math.PI/2;add('fin',[.625*Math.cos(angle),-18.99,-.625*Math.sin(angle)],[0,angle,0],tank);}
 }
 if(kind==='lunar-surface-expedition'){
  a=preset('lunar-expedition');
  const tank=a.find(p=>p.type==='tank');
  for(const x of [-1.3,1.3])a.push(part('tank',[x,-2.15,0],[0,0,0],tank.id));
  for(const [x,z]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const frame=part('truss',[x*1.8,-3.2,z*1.8],[0,0,0],tank.id);
   a.push(frame,part('landingLeg',[x*1.8,-4.25,z*1.8],[0,0,0],frame.id));
  }
  for(const p of a.filter(p=>p.type==='solar'))p.p[0]*=1.8;
  const middle=a.find(p=>p.type==='tank'&&p.p[1]===-5.57),lower=a.find(p=>p.type==='tank'&&p.p[1]<-18);
  for(const x of [-1.3,1.3])a.push(part('tank',[x,-5.57,0],[0,0,0],middle.id));
  for(const z of [-1.4,1.4])a.push(part('engine',[0,-9.17,z],[0,0,0],middle.id,1));
  for(const x of [-1.3,1.3])for(const y of [-14.99,-16.99])a.push(part('tank',[x,y,0],[0,0,0],lower.id));
  for(const [x,z]of [[2.5,0],[-2.5,0],[0,2.5],[0,-2.5]])a.push(part('engine',[x,-20.59,z],[0,0,0],lower.id));
  for(let i=0;i<4;i++){const angle=i*Math.PI/2+Math.PI/4;a.push(part('engine',[2.5*Math.cos(angle),-20.59,2.5*Math.sin(angle)],[0,0,0],lower.id));}
  // Vacuum upper stage: keep the tank socket fixed and extend the lower stack.
  const upperEngine=a.find(p=>p.type==='engine'&&p.stage===2);
  upperEngine.type='engineVacMedium';upperEngine.p[1]-=.3;
  for(const p of a)if(p!==upperEngine&&p.p[1]<-4.35)p.p[1]-=.6;
  for(const p of a)if(p.type==='landingLeg'||p.type==='truss')p.p[1]-=.6;
 }
 if(kind==='recovery'){add('capsule',[0,0,0]);add('parachute',[0,.85,0]);}
 if(kind==='rcs'){add('probe',[0,0,0]);a[0].reactionEnabled=false;add('truss',[0,-.7,0]);for(const x of [-.74,.74])for(const y of [-1.2,.4])add('rcs',[x,y,0],[0,0,0],1);}
 if(kind==='orbiter'||kind==='transfer'){add('probe',[0,2.5,0]);add('tank',[0,1.3,0]);add('engine',[0,-.3,0],[0,0,0],1);add('solar',[1.6,2.5,0],[0,0,0]);add('solar',[-1.6,2.5,0],[0,0,0]);}
 if(kind==='lander'||kind==='moonlander'||kind==='hopper'){add('probe',[0,2.5,0]);add('tank',[0,1.3,0]);add('engine',[0,-.3,0],[0,0,0],1);add('solar',[1.6,2.5,0]);add('solar',[-1.6,2.5,0]);for(const [x,z]of [[1,0],[-1,0],[0,1],[0,-1]]){const frame=add('truss',[x*.9,.3,z*.9],[0,0,0],1);add('landingLeg',[x*1.2,-.8,z*1.2],[0,0,0],frame);}}
 if(kind==='twin'){add('probe',[0,2.5,0]);add('tank',[0,1.3,0]);add('engine',[0,-.3,0],[0,0,0],1,0);add('decoupler',[0,-1.01,0],[0,0,0],2,1);add('probe',[0,-1.35,0],[0,0,0],3);add('tank',[0,-2.55,0],[0,0,0],4);add('engine',[0,-4.15,0],[0,0,0],5,2);add('solar',[1.6,2.5,0]);add('solar',[-1.6,2.5,0]);add('solar',[1.6,-1.35,0],[0,0,0],4);add('solar',[-1.6,-1.35,0],[0,0,0],4);}
 if(kind==='rendezvous'){a=preset('twin');for(const core of a.filter(p=>p.type==='probe')){core.reactionEnabled=false;for(const x of [-.9,.9])for(const y of [-1.2,1.2])a.push(part('rcs',[x,core.p[1]-1.3+y,0],[0,0,0],core.id));}}
 if(kind==='orbital-tug'){a=preset('orbiter');add('dockingPort',[0,2.821,0]);for(const z of [-.9,.9])for(const y of [.2,2.4])add('rcs',[0,y,z],[0,0,0],1);}
 if(kind==='tug-launcher'){
  a=preset('orbital-tug');const engine=a.find(p=>p.type==='engine');engine.stage=1;
  const upper=add('tank',[0,-.7,0],[0,0,0],1);engine.parent=a[upper].id;engine.p[1]-=2;
  const separator=add('decoupler',[0,-3.01,0],[0,0,0],a.indexOf(engine),1);let tank=separator;
  for(let i=0;i<3;i++)tank=add('tank',[0,-4.12-i*2,0],[0,0,0],tank);
  for(const x of [-.7,.7])for(const z of [-.7,.7])add('engine',[x,-9.72,z],[0,0,0],tank);
  for(let i=0;i<4;i++){const angle=i*Math.PI/2;add('fin',[.625*Math.cos(angle),-8.15,-.625*Math.sin(angle)],[0,angle,0],tank);}
 }
 if(kind==='docking'){add('probe',[0,-1.4,0]);add('truss',[0,-.7,0]);add('dockingPort',[0,-.079,0],[0,0,0],1);add('dockingPort',[0,.163,0],[Math.PI,0,0],2);add('truss',[0,.784,0],[Math.PI,0,0],3);add('probe',[0,1.484,0],[Math.PI,0,0],4);a[2].dockPartner=a[3].id;a[3].dockPartner=a[2].id;for(const [core,ys]of [[0,[-1.2,-.2]],[5,[.284,1.284]]])for(const x of [-.74,.74])for(const y of ys)add('rcs',[x,y,0],[0,0,0],core);}
 if(kind==='plane'){
 const r=[Math.PI/2,0,0],left=[Math.PI/2,Math.PI,0],vertical=[Math.PI/2,Math.PI/2,0];
 add('cockpit',[0,1.3,2.2],r);add('tank',[0,1.3,.2],r);add('jet',[0,1.3,-1.4],r,1);
 add('wing',[.625,1.3,.45],[Math.PI/2-.045,0,0],1);add('wing',[-.625,1.3,.45],[Math.PI/2-.045,Math.PI,0],1);
 add('aileron',[1.7,1.3,-.51],r,3);add('aileron',[-1.7,1.3,-.51],left,4);
 add('stabilizer',[.95,1.4,-1.6],r,1);add('stabilizer',[-.95,1.4,-1.6],left,1);
 add('elevator',[.95,1.4,-2.125],r,7);add('elevator',[-.95,1.4,-2.125],left,8);
 add('stabilizer',[0,2.1,-1.6],vertical,1);add('rudder',[0,2.45,-2.125],vertical,11);
 add('nosegear',[0,.4,2.0],[0,0,0],0);add('maingear',[1.05,.4,-.25],[0,0,0],1);add('maingear',[-1.05,.4,-.25],[0,0,0],1);
 }
 if(kind==='courier'){
  add('probe',[0,1.6,-1.345]);add('solar',[0,2,-1.345],[-Math.PI/2,0,0]);
  const sep=add('decoupler',[0,1.6,-.61],[Math.PI/2,0,0],0,1);
  const chassis=add('truss',[0,.9,0],[0,0,0],sep);add('truss',[0,.9,1],[0,0,0],chassis);
  add('probe',[0,1.6,.5],[0,0,0],chassis);
  for(const x of [-1.2,1.2])for(const z of [-.6,1.6]){const i=add('wheel',[x,.4,z],[0,0,0],chassis);if(z<0)a[i].steeringEnabled=false;}
  add('battery',[0,1.25,-1.345],[0,0,0],0);
  for(const p of a)if(p.type==='probe')p.reactionEnabled=false;
 }
 if(kind==='rover'){add('truss',[0,.9,0]);add('truss',[0,.9,1],[0,0,0]);add('probe',[0,1.6,.5],[0,0,0]);for(const x of [-.7,.7])for(const z of [-.4,1.4]){const i=add('wheel',[x,.4,z],[0,0,0]);if(z<.5)a[i].steeringEnabled=false;}add('solar',[0,2,.3],[-Math.PI/2,0,0],2);}
 if(kind==='boat'||kind==='sub'){const r=[Math.PI/2,0,0];add('cockpit',[0,1,1],r);add('truss',[0,.8,-.5]);if(kind==='boat')for(const x of [-1,1])add('pontoon',[x,.3,0],r,1);add('propeller',[0,-.15,-1.7],r,1);if(kind==='sub'){add('ballast',[-.65,.3,-.3],r,1);add('ballast',[.65,.3,-.3],r,1);}}
 if(kind==='sub')for(const p of a){if(p.type==='cockpit')p.p=[0,0,.3];if(p.type==='truss')p.p=[0,1.2,0];if(p.type==='propeller')p.p=[0,.1,-2.1];if(p.type==='ballast')p.p=[Math.sign(p.p[0])*1.3,.2,0];}
 if(['plane','boat','sub'].includes(kind)){a[0].r=[Math.PI/2,Math.PI,0];}
 return a;
}

