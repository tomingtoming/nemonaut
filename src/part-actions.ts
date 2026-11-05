import {angularMomentum, angularVelocity} from './angular-momentum.js';
import {engineMedium, type MediumFlight} from './engine-medium.js';
import {usesTankPropellant, fuelNetworks, type FuelNetworks} from './resources.js';
import {partSettings, type SettablePart, type PartToggleKey} from './part-settings.js';
import {PARTS} from './catalog.js';
import {canControl} from './fleet.js';
/** The flight fields the part action menu reads and changes. */
export interface PartActionFlight extends MediumFlight {
  parts: SettablePart[];
  crashed?: boolean;
  observations: ReadonlyMap<string, import('./observation.js').ObservationState>;
  active: Set<string>;
  started: boolean;
  thermal: ReadonlyMap<string, {failed: boolean}>;
  body: Pick<import('./physics.js').RigidBody, 'principalInertia' | 'principalInertiaLocalFrame'>;
  omega: import('three').Vector3;
  buildColliders(): void;
  networks: FuelNetworks;
  chutes: ReadonlyMap<string, import('./recovery.js').ParachuteState>;
  fuel: ReadonlyMap<string, number>;
  throttle: number;
  engineThrust: ReadonlyMap<string, number>;
  reactionEnabled?: boolean;
  steeringEnabled?: boolean;
  driveEnabled?: boolean;
}
// Every boolean part setting key (partSettings rows of type boolean); the Record keeps the list complete.
const TOGGLES: Readonly<Record<PartToggleKey | 'cargoOpen', true>> = {
  fuelEnabled: true,
  fuelCrossfeed: true,
  gimbalEnabled: true,
  controlEnabled: true,
  controlPitch: true,
  controlYaw: true,
  controlRoll: true,
  reactionEnabled: true,
  steeringEnabled: true,
  driveEnabled: true,
  cargoOpen: true
};
const isToggleKey = (key: string): key is PartToggleKey | 'cargoOpen' => Object.hasOwn(TOGGLES, key);
const isVesselToggle = (key: string): key is 'reactionEnabled' | 'steeringEnabled' | 'driveEnabled' =>
  key === 'reactionEnabled' || key === 'steeringEnabled' || key === 'driveEnabled';
const CHUTE_ACTIONS: Readonly<Record<string, import('./recovery.js').ChuteStatus | undefined>> = {
  arm: 'armed',
  disarm: 'stowed',
  cut: 'cut'
};
export interface PartAction {
  key: string;
  label: string;
  on: boolean;
  globalOff: boolean;
}
export interface ParachuteAction {
  key: string;
  label: string;
  enabled: boolean;
}
export interface EngineActionState {
  active: boolean;
  status: string;
  enabled: boolean;
}
export function partActions(f: PartActionFlight | null | undefined, id: string): PartAction[] {
  const p = f?.parts.find(p => p.id === id);
  if (!f || !p) return [];
  const d = PARTS[p.type];
  return [
    ...(PARTS[p.type].surfaceObservation === true
      ? [
          {
            key: 'observation',
            label: '地表観測 · 0.1 EC/s',
            on: f.observations.get(id)?.enabled ?? false,
            globalOff: false
          }
        ]
      : []),
    ...(d.thrust ? [{key: 'engine', label: 'エンジン', on: f.active.has(id), globalOff: false}] : []),
    ...partSettings(p)
      .filter(s => s.type === 'boolean')
      .map(s => ({key: s.key, label: s.label, on: s.value, globalOff: isVesselToggle(s.key) && !f[s.key]}))
  ];
}
export function setPartAction(
  f: PartActionFlight | null | undefined,
  id: string,
  key: string,
  on: unknown
): boolean {
  if (!f || !canControl(f) || typeof on !== 'boolean' || !partActions(f, id).some(a => a.key === key))
    return false;
  const p = f.parts.find(p => p.id === id);
  const momentum = key === 'cargoOpen' ? angularMomentum(f.body, f.q, f.omega) : null;
  if (key === 'observation') {
    if (on && f.thermal.get(id)?.failed) return false;
    const observation = f.observations.get(id);
    if (!observation) throw Error('観測状態が見つかりません: ' + id);
    observation.enabled = on;
    return true;
  }
  if (key === 'engine') {
    if (on && f.thermal.get(id)?.failed) return false;
    if (on) {
      f.active.add(id);
      f.started = true;
    } else f.active.delete(id);
  } else {
    if (!p) throw Error('部品が見つかりません: ' + id);
    if (!isToggleKey(key)) throw Error('部品の切替項目が不正です: ' + key);
    p[key] = on;
  }
  if (momentum) {
    f.buildColliders();
    f.omega.copy(angularVelocity(f.body, f.q, momentum));
  }
  if (key === 'fuelCrossfeed' || key === 'fuelEnabled') f.networks = fuelNetworks(f.parts);
  return true;
}

export function setPartThrustLimit(
  f: PartActionFlight | null | undefined,
  id: string,
  value: number
): boolean {
  const p = f?.parts.find(p => p.id === id);
  if (
    !p ||
    !f ||
    !canControl(f) ||
    !PARTS[p.type].thrust ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  )
    return false;
  p.thrustLimit = value;
  return true;
}

export function setPartControlLimit(
  f: PartActionFlight | null | undefined,
  id: string,
  value: number
): boolean {
  const p = f?.parts.find(p => p.id === id);
  if (
    !p ||
    !f ||
    !canControl(f) ||
    !PARTS[p.type].controlAxis ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  )
    return false;
  p.controlLimit = value;
  return true;
}

export function parachuteActions(f: PartActionFlight | null | undefined, id: string): ParachuteAction[] {
  const p = f?.parts.find(p => p.id === id),
    s = f?.chutes.get(id);
  if (!f || !p || !PARTS[p.type].parachute || !s) return [];
  return [
    {key: 'arm', label: '開傘待機', enabled: s.status === 'stowed'},
    {key: 'disarm', label: '待機解除', enabled: s.status === 'armed'},
    {key: 'cut', label: 'パラシュートを切離す', enabled: ['reefed', 'open'].includes(s.status)}
  ].map(a => ({...a, enabled: a.enabled && canControl(f) && !f.thermal.get(id)?.failed}));
}
export function setParachuteAction(f: PartActionFlight | null | undefined, id: string, key: string): boolean {
  if (!f || !parachuteActions(f, id).some(a => a.key === key && a.enabled)) return false;
  const s = f.chutes.get(id),
    status = CHUTE_ACTIONS[key];
  if (!s) throw Error('パラシュート状態が見つかりません: ' + id);
  if (!status) throw Error('パラシュート操作が不正です: ' + key);
  s.status = status;
  s.fraction = 0;
  return true;
}

export function engineState(f: PartActionFlight | null | undefined, id: string): EngineActionState | null {
  const p = f?.parts.find(p => p.id === id);
  if (!f || !p || !PARTS[p.type].thrust) return null;
  const active = f.active.has(id),
    failed = !!f.thermal.get(id)?.failed,
    d = PARTS[p.type],
    medium = engineMedium(f, p);
  const tanks = f.networks.network.get(id)?.tanks || [],
    fuel = tanks.reduce((sum, p) => sum + (f.fuel.get(p.id) || 0), 0);
  const status = failed
    ? '損傷'
    : !active
      ? '停止中'
      : f.throttle === 0
        ? 'スロットル待ち'
        : (p.thrustLimit ?? 1) === 0
          ? '推力上限 0%'
          : d.thrustMedium === 'air' && medium.submersion >= 1
            ? '吸気口が水没'
            : d.thrustMedium === 'air' && medium.density <= 0
              ? '大気なし'
              : d.thrustMedium === 'water' && medium.submersion <= 0
                ? '水中でのみ作動'
                : usesTankPropellant(p) && fuel <= 0
                  ? '燃料供給なし'
                  : (f.engineThrust.get(id) || 0) > 0
                    ? d.thrustMedium === 'water'
                      ? '推進中'
                      : '燃焼中'
                    : '推力待ち';
  return {active, status, enabled: canControl(f) && (!failed || active)};
}
