// Action groups: part operations assigned to the ten numbered groups (keys 1…9, 0) and fired together.
// This module is the model only: which operations a part offers, the assignments stored on the part
// (`actionGroups`: operation id → list of group numbers), their validation, and the texts that describe a
// group. Firing is in action-group-fire.ts. Pure: no DOM, no import-time side effects.
import {PARTS, type Part, type PartDefinition} from './catalog.js';
import {symmetryTargets, validateSymmetry} from './symmetry.js';

/** Group numbers in the order they are shown and the order of their keys: 1…9, then 0. */
export const ACTION_GROUPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as const;
/**
 * `toggle`: a two-state operation, aligned and then flipped when its group fires.
 * `once`: runs when its group fires and is skipped where it is not possible.
 */
export type OperationKind = 'toggle' | 'once';
export interface OperationSpec {
  /** Stored in saves; independent of the display text. */
  readonly id: string;
  readonly kind: OperationKind;
  readonly name: string;
  /** What the notice says after the operation ran (for a toggle: switched on / switched off). */
  readonly on: string;
  readonly off: string;
  readonly applies: (d: PartDefinition) => boolean;
}
const spec = (
  id: string,
  kind: OperationKind,
  name: string,
  on: string,
  off: string,
  applies: (d: PartDefinition) => boolean
): OperationSpec => ({id, kind, name, on, off, applies});
// The order here is the order of the rows, of the summary and of the firing notice.
export const OPERATIONS: readonly OperationSpec[] = [
  spec('engine', 'toggle', 'エンジン', 'エンジン始動', 'エンジン停止', d => !!d.thrust),
  spec('fuelEnabled', 'toggle', '燃料使用', '燃料使用 入', '燃料使用 切', d => !!(d.fuel || d.monoprop)),
  spec(
    'fuelCrossfeed',
    'toggle',
    '燃料通過',
    '燃料通過 入',
    '燃料通過 切',
    d => !!(d.docking || d.decoupler)
  ),
  spec('gimbalEnabled', 'toggle', 'ジンバル', 'ジンバル 入', 'ジンバル 切', d => !!d.gimbal),
  spec('controlEnabled', 'toggle', '操舵面', '操舵面 入', '操舵面 切', d => !!d.controlAxis),
  spec(
    'reactionEnabled',
    'toggle',
    'リアクションホイール',
    'リアクションホイール 入',
    'リアクションホイール 切',
    d => !!d.reactionTorque
  ),
  spec('steeringEnabled', 'toggle', '車輪操舵', '車輪操舵 入', '車輪操舵 切', d => !!d.steer),
  spec('driveEnabled', 'toggle', '車輪駆動', '車輪駆動 入', '車輪駆動 切', d => !!d.poweredWheel),
  spec('cargoOpen', 'toggle', '貨物扉', '貨物扉 開', '貨物扉 閉', d => !!d.cargoBay),
  spec('observation', 'toggle', '地表観測', '地表観測 入', '地表観測 切', d => d.surfaceObservation === true),
  spec('chuteArm', 'once', '開傘待機', '開傘待機', '開傘待機', d => !!d.parachute),
  spec('chuteDisarm', 'once', '待機解除', '待機解除', '待機解除', d => !!d.parachute),
  spec(
    'chuteCut',
    'once',
    'パラシュート切離し',
    'パラシュート切離し',
    'パラシュート切離し',
    d => !!d.parachute
  ),
  spec('decouple', 'once', '切離し', '切離し', '切離し', d => !!d.decoupler),
  spec('undock', 'once', 'ポート分離', 'ポート分離', 'ポート分離', d => !!d.docking)
];
/** Operation id → the groups it belongs to. A part without assignments has no such field. */
export type ActionGroupAssignments = Record<string, number[]>;
type GroupPart = Pick<Part, 'id' | 'type' | 'actionGroups'>;

export function operationSpec(id: string): OperationSpec | undefined {
  return OPERATIONS.find(o => o.id === id);
}
/** The operations a part of this type can be given a group for. */
export function partOperations(type: string): OperationSpec[] {
  const d = PARTS[type];
  return d ? OPERATIONS.filter(o => o.applies(d)) : [];
}
const validGroup = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 9;
/** Rejects anything but: a non-empty object of this part type's operations, each with 1…10 distinct groups 0…9. */
export function validateActionGroups(p: {type: string; actionGroups?: unknown}): void {
  const a = p.actionGroups;
  if (a === undefined) return;
  if (!a || typeof a !== 'object' || Array.isArray(a))
    throw Error('アクショングループの割り当てが不正です。');
  const entries = Object.entries(a),
    allowed = partOperations(p.type);
  if (!entries.length) throw Error('アクショングループの割り当てが不正です。');
  for (const [operation, groups] of entries) {
    if (!allowed.some(o => o.id === operation)) throw Error('この部品にはない操作の割り当てです。');
    if (
      !Array.isArray(groups) ||
      !groups.length ||
      !groups.every(validGroup) ||
      new Set(groups).size !== groups.length
    )
      throw Error('アクショングループの番号は0〜9です。');
  }
}
/** The groups an operation of a part belongs to (none: empty). */
export function operationGroups(p: Pick<Part, 'actionGroups'>, operation: string): number[] {
  const a = p.actionGroups;
  return a && Object.hasOwn(a, operation) ? [...a[operation]] : [];
}
/** Replaces the groups of one operation on this part; an empty list removes the assignment. */
export function setOperationGroups(p: GroupPart, operation: string, groups: readonly number[]): void {
  if (!partOperations(p.type).some(o => o.id === operation))
    throw Error('この部品にはない操作の割り当てです。');
  if (!groups.every(validGroup)) throw Error('アクショングループの番号は0〜9です。');
  const next: ActionGroupAssignments = {};
  for (const [key, value] of Object.entries(p.actionGroups ?? {})) if (key !== operation) next[key] = value;
  if (groups.length) next[operation] = [...new Set(groups)];
  if (Object.keys(next).length) p.actionGroups = next;
  else delete p.actionGroups;
}
/**
 * Workshop edit: gives one operation of a part one group (null: none) and returns the changed copy.
 * With `linked`, the symmetric counterparts of the part get the same assignment.
 */
export function assignActionGroup<P extends GroupPart & {symmetryGroup?: string}>(
  parts: P[],
  id: string,
  operation: string,
  group: number | null,
  linked = true
): P[] {
  validateSymmetry(parts);
  const copy = structuredClone(parts);
  for (const p of symmetryTargets(copy, id, linked))
    setOperationGroups(p, operation, group === null ? [] : [group]);
  return copy;
}
export interface GroupMember {
  id: string;
  operation: string;
}
/** Every (part, operation) of these parts assigned to a group, in operation order. */
export function groupMembers(parts: readonly GroupPart[], group: number): GroupMember[] {
  return OPERATIONS.flatMap(o =>
    parts.filter(p => operationGroups(p, o.id).includes(group)).map(p => ({id: p.id, operation: o.id}))
  );
}
/** 「エンジン×2 · 貨物扉」: the operations of a group with the number of parts each acts on. */
export function groupSummary(parts: readonly GroupPart[], group: number): string {
  const members = groupMembers(parts, group);
  return OPERATIONS.flatMap(o => {
    const count = members.filter(m => m.operation === o.id).length;
    return count ? [o.name + (count > 1 ? '×' + count : '')] : [];
  }).join(' · ');
}
export interface GroupRow {
  group: number;
  summary: string;
}
/** The groups of these parts that have something assigned, in key order. */
export function groupRows(parts: readonly GroupPart[]): GroupRow[] {
  if (!parts.some(p => p.actionGroups)) return [];
  return ACTION_GROUPS.map(group => ({group, summary: groupSummary(parts, group)})).filter(r => r.summary);
}
