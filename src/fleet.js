import {PARTS} from './catalog.js';
export function fleet(root){return [root,...root.detached.flatMap(fleet)];}
export function canControl(vessel){return !vessel.crashed&&vessel.parts.some(p=>PARTS[p.type].control);}
export function selectVessel(root,target){const vessels=fleet(root);if(!vessels.includes(target))throw Error('現在の飛行に含まれない機体です');if(!canControl(target))throw Error('制御装置のない機体・損傷した機体は操縦できません');if(root===target)return root;for(const vessel of vessels)vessel.detached=[];target.detached=vessels.filter(v=>v!==target);return target;}
