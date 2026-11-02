import {PARTS,type PartCatalog} from './catalog.js';
/** A vessel tree node: the separated vessels still flown alongside it. */
export interface FleetNode<V>{detached:V[]}
/** The vessel fields canControl reads. */
export interface ControllableVessel{crashed?:boolean;parts:readonly {type:string}[]}
export function fleet<V extends FleetNode<V>>(root:V):V[]{return [root,...root.detached.flatMap(fleet)];}
export function canControl(vessel:ControllableVessel):boolean{return !vessel.crashed&&vessel.parts.some(p=>(PARTS as PartCatalog)[p.type].control);}
export function selectVessel<V extends FleetNode<V>&ControllableVessel>(root:V,target:V):V{const vessels=fleet(root);if(!vessels.includes(target))throw Error('現在の飛行に含まれない機体です');if(!canControl(target))throw Error('制御装置のない機体・損傷した機体は操縦できません');if(root===target)return root;for(const vessel of vessels)vessel.detached=[];target.detached=vessels.filter(v=>v!==target);return target;}
