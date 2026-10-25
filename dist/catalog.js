export const PARTS = {
 capsule:{name:'コマンドポッド',code:'CP-1',cat:'指令',mass:620,size:[1.25,1.3,1.25],control:true,desc:'耐熱外殻と姿勢制御を備える有人カプセル。'},
 probe:{name:'探査コア',code:'OC-4',cat:'指令',mass:90,size:[1.25,.4,1.25],control:true,desc:'小型無人機のための軽量制御ユニット。'},
 cockpit:{name:'コックピット',code:'FC-2',cat:'指令',mass:510,size:[1.25,2,1.25],control:true,desc:'航空機・ローバー向けの広視界キャノピー。'},
 tank:{name:'推進剤タンク',code:'FT-200',cat:'燃料',mass:150,fuel:1800,size:[1.25,2,1.25],desc:'共通推進剤を供給。消費に応じて機体の重心も変化。'},
 engine:{name:'液体燃料エンジン',code:'RE-45',cat:'推進',mass:270,thrust:45000,isp:300,size:[1.25,1.2,1.25],desc:'真空でも作動する45 kNエンジン。推力方向は部品の上向き。'},
 jet:{name:'ターボジェット',code:'TJ-18',cat:'推進',mass:230,thrust:18000,isp:1800,air:true,size:[1.25,1.2,1.25],desc:'大気中専用。高度とともに推力が低下する。'},
 propeller:{name:'スクリュー',code:'MP-6',cat:'推進',mass:60,thrust:6000,isp:3000,water:true,size:[.8,.5,.8],desc:'水中専用推進器。船・潜水艇の推進に。'},
 nose:{name:'ノーズコーン',code:'NC-1',cat:'構造',mass:65,size:[1.25,1,1.25],desc:'機首を覆う軽量の整流コーン。'},
 decoupler:{name:'分離リング',code:'DC-12',cat:'構造',mass:40,size:[1.25,.22,1.25],decoupler:true,desc:'ステージ実行時、この部品から先の接続枝を分離。'},
 truss:{name:'構造フレーム',code:'TR-1',cat:'構造',mass:65,size:[1,1,1],desc:'ローバーや宇宙機の骨組み。6方向に接続可能。'},
 wing:{name:'後退翼',code:'SW-2',cat:'空力',mass:55,size:[2,1.6,.12],wing:2.1,desc:'空気速度と迎角から揚力が発生。基部はローカルX=0。'},
 wheel:{name:'駆動輪',code:'RW-7',cat:'走行',mass:45,size:[.34,.7,.7],wheel:true,desc:'接地中に駆動・ブレーキ・操舵できるサスペンション輪。'},
 solar:{name:'ソーラーパネル',code:'SP-2',cat:'装備',mass:22,size:[2,1,.08],desc:'展開済みの太陽電池パネル。現版では電力系は未実装。'},
 pontoon:{name:'フロート',code:'FL-3',cat:'船舶',mass:85,size:[1,3,.8],volume:1.9,desc:'水密の浮体。水没体積に応じた浮力を生む。'},
 ballast:{name:'バラストタンク',code:'BT-1',cat:'船舶',mass:110,size:[1.25,1,1.25],volume:1.05,ballast:1050,desc:'注排水で質量を変え、浮上・潜航を調整する。'}
};
export const CATEGORIES=['すべて','指令','燃料','推進','構造','空力','走行','装備','船舶'];
export function nodes(type){const d=PARTS[type], [x,y,z]=d.size;if(type==='wing')return [[0,0,0,-1,0,0],[x,0,0,1,0,0]];return [[0,y/2,0,0,1,0],[0,-y/2,0,0,-1,0],[x/2,0,0,1,0,0],[-x/2,0,0,-1,0,0],[0,0,z/2,0,0,1],[0,0,-z/2,0,0,-1]];}
export function part(type,p=[0,0,0],r=[0,0,0],parent=null,stage=0){return {id:crypto.randomUUID(),type,p,r,parent,stage};}
export function preset(kind){let a=[];const add=(t,p,r=[0,0,0],par=0,stage=0)=>{const o=part(t,p,r,a[par]?.id??null,stage);a.push(o);return a.length-1;};
 if(kind==='rocket'){add('capsule',[0,3.6,0]);add('tank',[0,1.95,0]);add('engine',[0,.35,0],[0,0,0],1);for(let i=0;i<4;i++){const t=i*Math.PI/2;add('wing',[.625*Math.cos(t),.8,-.625*Math.sin(t)],[0,t,0],1);} }
 if(kind==='orbiter'){add('probe',[0,2.5,0]);add('tank',[0,1.3,0]);add('engine',[0,-.3,0],[0,0,0],1);add('solar',[1.6,2.5,0],[0,0,0]);add('solar',[-1.6,2.5,0],[0,0,0]);}
 if(kind==='plane'){const r=[Math.PI/2,0,0];add('cockpit',[0,1.3,2.2],r);add('tank',[0,1.3,.2],r);add('jet',[0,1.3,-1.4],r,1);add('wing',[.625,1.3,.4],r,1);add('wing',[-.625,1.3,.4],[Math.PI/2,Math.PI,0],1);add('wing',[0,1.5,-.9],[Math.PI/2,Math.PI/2,0],1);for(const x of [-1.05,1.05])for(const z of [-.7,1.6])add('wheel',[x,.4,z],[0,0,0],1);}
 if(kind==='rover'){add('truss',[0,.9,0]);add('truss',[0,.9,1],[0,0,0]);add('probe',[0,1.6,.5],[0,0,0]);for(const x of [-.7,.7])for(const z of [0,1])add('wheel',[x,.4,z],[0,0,0]);add('solar',[0,2,.3],[-Math.PI/2,0,0],2);}
 if(kind==='boat'||kind==='sub'){const r=[Math.PI/2,0,0];add('cockpit',[0,1,1],r);add('truss',[0,.8,-.5]);if(kind==='boat')for(const x of [-1,1])add('pontoon',[x,.3,0],r,1);add('propeller',[0,-.15,-1.7],r,1);if(kind==='sub'){add('ballast',[-.65,.3,-.3],r,1);add('ballast',[.65,.3,-.3],r,1);}}
 if(['plane','boat','sub'].includes(kind)){a[0].r=[Math.PI/2,Math.PI,0];}
 return a;
}
