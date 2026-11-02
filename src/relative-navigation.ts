import * as T from 'three';
import {partCenter, partMass, type AeroPart, type MassPart} from './aero.js';
import {PARTS} from './catalog.js';
import {fleet} from './fleet.js';
export interface NavigationPart extends AeroPart, MassPart {
  id: string;
  dockPartner?: string;
}
export interface DockingPortPair {
  own: string;
  target: string;
}
export interface CenteredVessel {
  parts: readonly NavigationPart[];
  fuel?: import('./resources.js').FuelMap | number;
  ballast?: number;
  thermal?: ReadonlyMap<string, {ablator?: number}> | null;
  q: T.Quaternion;
  pos: T.Vector3;
}
export interface MovingVessel extends CenteredVessel {
  vel: T.Vector3;
}
export interface NavigationVessel extends MovingVessel {
  detached: NavigationVessel[];
  navigationTarget?: NavigationVessel | null;
  targetPartId?: string | null;
  dockingPorts?: DockingPortPair | null;
  portTranslationEnabled?: boolean;
  sasMode: string;
  holdQ?: T.Quaternion;
}
export interface RelativeState {
  distance: number;
  speed: number;
  closing: number;
  direction: T.Vector3 | null;
  braking: T.Vector3 | null;
  offset: T.Vector3;
  velocity: T.Vector3;
}
export interface ResolveTargetOptions {
  strict?: boolean;
}
export const TARGET_MODES: string[] = ['target', 'relativeRetrograde', 'dock'];
export function centerOfVessel(v: CenteredVessel): T.Vector3 {
  const center = new T.Vector3();
  let mass = 0;
  for (const p of v.parts) {
    const m = partMass(p, v.fuel, v.ballast, v.thermal);
    mass += m;
    center.addScaledVector(partCenter(p), m);
  }
  return center
    .divideScalar(mass || 1)
    .applyQuaternion(v.q)
    .add(v.pos);
}
export function relativeState(
  v: MovingVessel,
  target: MovingVessel | null | undefined
): RelativeState | null {
  if (!target || v === target) return null;
  const offset = centerOfVessel(target).sub(centerOfVessel(v)),
    velocity = target.vel.clone().sub(v.vel),
    distance = offset.length(),
    speed = velocity.length(),
    direction = distance > 1e-6 ? offset.clone().divideScalar(distance) : null;
  return {
    distance,
    speed,
    closing: direction ? -velocity.dot(direction) : 0,
    direction,
    braking: speed > 0.01 ? velocity.clone().divideScalar(speed) : null,
    offset,
    velocity
  };
}
export function setTarget(
  root: NavigationVessel,
  v: NavigationVessel,
  target: NavigationVessel | null | undefined
): void {
  const vessels = fleet(root);
  if (!vessels.includes(v) || target === v || (target && !vessels.includes(target)))
    throw Error('目標は同じ飛行に属する他の機体を選んでください');
  if (v.navigationTarget !== target) {
    v.dockingPorts = null;
    v.portTranslationEnabled = false;
  }
  v.targetPartId = target ? (target.parts.find(p => PARTS[p.type].control) || target.parts[0]).id : null;
  v.navigationTarget = target || null;
  if (!target && TARGET_MODES.includes(v.sasMode)) {
    v.sasMode = 'hold';
    v.holdQ = v.q.clone();
  }
}
// A part ID survives vessel re-rooting and follows the correct branch on staging.
export function resolveTargets(root: NavigationVessel, options: ResolveTargetOptions = {}): void {
  return resolveWorldTargets(fleet(root), options);
}
export function resolveWorldTargets(
  vessels: readonly NavigationVessel[],
  {strict = false}: ResolveTargetOptions = {}
): void {
  const owners = new Map<string, NavigationVessel>(
    vessels.flatMap(v => v.parts.map((p): [string, NavigationVessel] => [p.id, v]))
  );
  for (const v of vessels) {
    const target = v.targetPartId ? owners.get(v.targetPartId) : null;
    if (v.targetPartId && (!target || target === v)) {
      if (strict) throw Error('保存された目標が存在しないか自機を指しています');
      v.targetPartId = null;
    }
    v.navigationTarget = target && target !== v ? target : null;
    if (!v.navigationTarget && TARGET_MODES.includes(v.sasMode)) {
      if (strict) throw Error('目標なしの相対SASは復帰できません');
      v.sasMode = 'hold';
      v.holdQ = v.q.clone();
    }
    const ports = v.dockingPorts;
    if (ports) {
      const a = v.parts.find(p => p.id === ports.own),
        b = v.navigationTarget?.parts.find(p => p.id === ports.target);
      if (!a || !b || !PARTS[a.type].docking || !PARTS[b.type].docking || a.dockPartner || b.dockPartner) {
        if (strict) throw Error('保存されたポート選択が不正です');
        v.dockingPorts = null;
        v.portTranslationEnabled = false;
      }
    }
    if (!v.dockingPorts && (v.sasMode === 'dock' || v.portTranslationEnabled)) {
      if (strict) throw Error('ポートなしの誘導は復帰できません');
      v.sasMode = 'hold';
      v.holdQ = v.q.clone();
      v.portTranslationEnabled = false;
    }
  }
}

// Both the part windows and the navigation panel use the same pair transition.
export function selectDockingPorts(
  v: NavigationVessel,
  ownId: string | null | undefined,
  targetId: string | null | undefined
): boolean {
  const clear = ownId == null && targetId == null;
  const own = v.parts.find(p => p.id === ownId),
    target = v.navigationTarget?.parts.find(p => p.id === targetId);
  if (
    !clear &&
    (!own ||
      !target ||
      !PARTS[own.type].docking ||
      !PARTS[target.type].docking ||
      own.dockPartner ||
      target.dockPartner)
  )
    return false;
  const changed = clear
    ? !!v.dockingPorts
    : v.dockingPorts?.own !== ownId || v.dockingPorts?.target !== targetId;
  if (changed) {
    v.portTranslationEnabled = false;
    if (v.sasMode === 'dock') {
      v.sasMode = 'hold';
      v.holdQ = v.q.clone();
    }
  }
  if (clear) v.dockingPorts = null;
  else {
    if (!own || !target) throw Error('選択したポートが見つかりません');
    v.dockingPorts = {own: own.id, target: target.id};
    v.targetPartId = targetId;
  }
  return true;
}
