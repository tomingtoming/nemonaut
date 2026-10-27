import {cargoMassCenter} from './cargo-geometry.js';
export function installCargoParts(parts){
 parts.cargoBay={name:'共用貨物胴体',code:'CB-6',cat:'構造',mass:4200,size:[6,9.6,6],cargoBay:{wall:.3},desc:'6 m級・左右スライド扉。内部床の接続点に分離リングを取り付け、開扉して搬出。輸送機・宇宙機共用。耐熱シールドではありません。',attachmentNodes:[
  [0,4.8,0,0,1,0],[0,-4.8,0,0,-1,0],[3,0,0,1,0,0],[-3,0,0,-1,0,0],[0,0,3,0,0,1],[0,0,-3,0,0,-1],
  [0,0,-2.3,0,0,1],[0,3,-2.3,0,0,1],[0,-3,-2.3,0,0,1]
 ]};
 parts.cargoBay.massCenter=cargoMassCenter(parts.cargoBay);
}
