export const PARTS = {
 heatShield:{name:'熱シールド',code:'HS-20',cat:'構造',mass:70,size:[2,.28,2],heatShield:true,shieldRadius:1,shieldNormal:[0,-1,0],ablator:40,noseRadius:1,maxTemperature:1800,desc:'直径2 mの曲面耐熱材。茶色の面（ローカル−Y）を進行方向へ。消耗材40 kgで加熱を吸収。'},
 dockingPort:{name:'ドッキングポート',code:'DP-12',cat:'構造',mass:55,size:[1.25,.242,1.25],docking:true,dockFace:.121,desc:'正面はローカル+Y。ポート面を向き合わせて低速で結合。'},
 rcs:{name:'RCSブロック',code:'RC-6',cat:'推進',mass:16,monoprop:12,rcsThrust:120,rcsIsp:65,size:[.48,.48,.48],desc:'6方向・各120 N。内蔵単一推進剤12 kg。配置と重心で姿勢制御の効きが変わります。'},
 capsule:{name:'コマンドポッド',code:'CP-1',cat:'指令',mass:620,size:[1.25,1.3,1.25],control:true,reactionTorque:7000,battery:1000,desc:'耐熱外殻と姿勢制御を備える有人カプセル。'},
 probe:{name:'探査コア',code:'OC-4',cat:'指令',mass:90,size:[1.25,.4,1.25],control:true,reactionTorque:1200,battery:200,desc:'小型無人機のための軽量制御ユニット。'},
 cockpit:{name:'コックピット',code:'FC-2',cat:'指令',mass:510,size:[1.25,2,1.25],control:true,battery:500,desc:'航空機・ローバー向けの広視界キャノピー。'},
 tank:{name:'推進剤タンク',code:'FT-200',cat:'燃料',mass:150,fuel:1800,size:[1.25,2,1.25],desc:'同じ燃料系統へ推進剤を供給。分離リングを越えては流れません。'},
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
 solar:{name:'ソーラーパネル',code:'SP-2',cat:'装備',mass:22,size:[2,1,.08],solarPower:.8,desc:'最大0.8 EC/s。表面の向きと惑星の影で発電量が変化。'},
 pontoon:{name:'フロート',code:'FL-3',cat:'船舶',mass:85,size:[1,3,.8],volume:1.9,desc:'水密の浮体。水没体積に応じた浮力を生む。'},
 ballast:{name:'バラストタンク',code:'BT-1',cat:'船舶',mass:110,size:[1.25,1,1.25],volume:1.05,ballast:1050,desc:'注排水で質量を変え、浮上・潜航を調整する。'}
};
export const CATEGORIES=['すべて','指令','燃料','推進','構造','空力','走行','装備','船舶'];
export function nodes(type){const d=PARTS[type], [x,y,z]=d.size;if(type==='wing'||type==='fin')return [[0,0,0,-1,0,0],[x,0,0,1,0,0]];return [[0,y/2,0,0,1,0],[0,-y/2,0,0,-1,0],[x/2,0,0,1,0,0],[-x/2,0,0,-1,0,0],[0,0,z/2,0,0,1],[0,0,-z/2,0,0,-1]];}
export function part(type,p=[0,0,0],r=[0,0,0],parent=null,stage=0){return {id:crypto.randomUUID(),type,p,r,parent,stage};}
export function preset(kind){let a=[];const add=(t,p,r=[0,0,0],par=0,stage=0)=>{const o=part(t,p,r,a[par]?.id??null,stage);a.push(o);return a.length-1;};
 if(kind==='rocket'){add('capsule',[0,3.6,0]);add('tank',[0,1.95,0]);add('engine',[0,.35,0],[0,0,0],1);for(let i=0;i<4;i++){const t=i*Math.PI/2;add('fin',[.625*Math.cos(t),.8,-.625*Math.sin(t)],[0,t,0],1);} }
 if(kind==='launcher'||kind==='returner'){add('capsule',[0,5.6,0]);add('tank',[0,3.95,0]);add('tank',[0,1.95,0],[0,0,0],1);add('engine',[0,.35,0],[0,0,0],2,1);add('decoupler',[0,-.36,0],[0,0,0],3,1);add('tank',[0,-1.47,0],[0,0,0],4);add('tank',[0,-3.47,0],[0,0,0],5);add('tank',[0,-5.47,0],[0,0,0],6);for(const x of [-.7,.7])for(const z of [-.7,.7])add('engine',[x,-7.07,z],[0,0,0],7);for(let i=0;i<4;i++){const t=i*Math.PI/2;add('fin',[.625*Math.cos(t),-5.5,-.625*Math.sin(t)],[0,t,0],7);}}
 if(kind==='returner'){for(let i=1;i<a.length;i++)a[i].p[1]-=.50;const shield=part('heatShield',[0,4.81,0],[0,0,0],a[0].id);const separator=part('decoupler',[0,4.56,0],[0,0,0],shield.id,2);a.push(shield);a[1].parent=separator.id;a.push(separator);a.push(part('parachute',[0,6.45,0],[0,0,0],a[0].id,3));}
 if(kind==='reentry'){add('capsule',[0,0,0]);add('heatShield',[0,-.79,0]);add('parachute',[0,.85,0]);}
 if(kind==='recovery'){add('capsule',[0,0,0]);add('parachute',[0,.85,0]);}
 if(kind==='rcs'){add('probe',[0,0,0]);a[0].reactionEnabled=false;add('truss',[0,-.7,0]);for(const x of [-.74,.74])for(const y of [-1.2,.4])add('rcs',[x,y,0],[0,0,0],1);}
 if(kind==='orbiter'){add('probe',[0,2.5,0]);add('tank',[0,1.3,0]);add('engine',[0,-.3,0],[0,0,0],1);add('solar',[1.6,2.5,0],[0,0,0]);add('solar',[-1.6,2.5,0],[0,0,0]);}
 if(kind==='twin'){add('probe',[0,2.5,0]);add('tank',[0,1.3,0]);add('engine',[0,-.3,0],[0,0,0],1,0);add('decoupler',[0,-1.01,0],[0,0,0],2,1);add('probe',[0,-1.35,0],[0,0,0],3);add('tank',[0,-2.55,0],[0,0,0],4);add('engine',[0,-4.15,0],[0,0,0],5,2);add('solar',[1.6,2.5,0]);add('solar',[-1.6,2.5,0]);add('solar',[1.6,-1.35,0],[0,0,0],4);add('solar',[-1.6,-1.35,0],[0,0,0],4);}
 if(kind==='rendezvous'){a=preset('twin');for(const core of a.filter(p=>p.type==='probe')){core.reactionEnabled=false;for(const x of [-.9,.9])for(const y of [-1.2,1.2])a.push(part('rcs',[x,core.p[1]-1.3+y,0],[0,0,0],core.id));}}
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
 if(kind==='rover'){add('truss',[0,.9,0]);add('truss',[0,.9,1],[0,0,0]);add('probe',[0,1.6,.5],[0,0,0]);for(const x of [-.7,.7])for(const z of [0,1])add('wheel',[x,.4,z],[0,0,0]);add('solar',[0,2,.3],[-Math.PI/2,0,0],2);}
 if(kind==='boat'||kind==='sub'){const r=[Math.PI/2,0,0];add('cockpit',[0,1,1],r);add('truss',[0,.8,-.5]);if(kind==='boat')for(const x of [-1,1])add('pontoon',[x,.3,0],r,1);add('propeller',[0,-.15,-1.7],r,1);if(kind==='sub'){add('ballast',[-.65,.3,-.3],r,1);add('ballast',[.65,.3,-.3],r,1);}}
 if(['plane','boat','sub'].includes(kind)){a[0].r=[Math.PI/2,Math.PI,0];}
 return a;
}

