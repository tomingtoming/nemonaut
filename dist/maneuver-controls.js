import {PARTS} from './catalog.js';
import {canControl} from './fleet.js';

// The saved node may outlive its burn, the propulsion stage, or a body crossing.
export function maneuverBurnAvailable(flight,kind){
 if(!flight||!canControl(flight)||!flight.maneuver?.[kind]||flight.maneuver.complete)return false;
 const body=kind==='departure'?'planet':'moon';
 if(flight.orbit?.bodyId!==body)return false;
 return flight.parts.some(p=>{
  const d=PARTS[p.type],network=flight.networks.network.get(p.id);
  return d.thrust&&!d.air&&!d.water&&flight.active.has(p.id)&&network?.tanks.some(t=>(flight.fuel.get(t.id)||0)>0);
 });
}

export function recoveryGuidance(flight){
 if(flight.crashed)return '機体が損傷しています。帰還装備と再突入姿勢を見直してください';
 if(flight.landed)return '着地しました。宇宙センターの追跡施設から回収できます';
 const shield=flight.parts.some(p=>PARTS[p.type].heatShield),chutes=[...flight.chutes.values()];
 if(!shield)return '熱シールドがありません。この機体の安全な再突入は未確認です';
 if(!chutes.length)return 'パラシュートがありません。耐熱通過後の着地手段が必要です';
 if(chutes.some(c=>c.status==='open'))return 'パラシュート全開で降下中です。鉛直速度を確認してください';
 if(chutes.some(c=>c.status==='reefed'))return 'パラシュート縮帆展開中です。低高度で全開になるまで降下を監視してください';
 if(flight.parts.some(p=>PARTS[p.type].thrust))return '推進部が残っています。段一覧で帰還カプセルを残す分離を確認し、SAS逆行で耐熱面を向けてください';
 if(chutes.some(c=>c.status==='stowed'))return '帰還カプセルです。SAS逆行で遮熱し、Hでパラシュートを待機してください';
 return 'パラシュートは安全条件待ちです。SAS逆行で遮熱し、速度と高度を確認してください';
}
