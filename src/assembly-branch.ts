import {assertNodeAttachments, releaseDisplacedAttachments} from './attachment-nodes.js';
import {normalizeSymmetry, transformSymmetryFrames} from './symmetry.js';
import * as T from 'three';
import {validateCraft, descendants, type FlightPart} from './core.js';

type PartVector = import('./catalog.js').PartVector;
export interface AssemblyRow {
  id: string;
  type: FlightPart['type'];
  stage: number;
  depth: number;
  count: number;
}
export interface PartBranch {
  rootId: string;
  parts: FlightPart[];
}
export interface BranchPose {
  position: number[];
  rotation: number[];
  parent?: string | null;
  attachment?: import('./catalog.js').PartAttachment;
}
export interface BranchResult {
  parts: FlightPart[];
  rootId: string;
  count: number;
}
/** A pose triple from the caller: three finite numbers. */
const finiteVector = (a: unknown): a is PartVector =>
  Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
const matrix = (p: {p: PartVector; r: PartVector}): T.Matrix4 =>
  new T.Matrix4().compose(
    new T.Vector3(...p.p),
    new T.Quaternion().setFromEuler(new T.Euler(...p.r)),
    new T.Vector3(1, 1, 1)
  );
export function assemblyTree(parts: FlightPart[]): AssemblyRow[] {
  if (!parts.length) return [];
  const checked = validateCraft({version: 1, parts}),
    children = new Map<string | null, FlightPart[]>(),
    rows: AssemblyRow[] = [];
  for (const p of checked) {
    const key = p.parent || null;
    let list = children.get(key);
    if (!list) {
      list = [];
      children.set(key, list);
    }
    list.push(p);
  }
  function visit(p: FlightPart, depth: number): number {
    const row: AssemblyRow = {id: p.id, type: p.type, stage: p.stage, depth, count: 1};
    rows.push(row);
    for (const child of children.get(p.id) || []) row.count += visit(child, depth + 1);
    return row.count;
  }
  for (const p of children.get(null) || []) visit(p, 0);
  return rows;
}
export function extractBranch(parts: FlightPart[], id: string): PartBranch {
  const checked = validateCraft({version: 1, parts});
  if (!checked.some(p => p.id === id)) throw Error('複製する部品が見つかりません');
  const ids = descendants(checked, id),
    branch = checked.filter(p => ids.has(p.id));
  for (const p of branch) {
    if (p.id === id) {
      p.parent = null;
      p.attachment = {mode: 'free'};
    }
    if (p.dockPartner && !ids.has(p.dockPartner)) delete p.dockPartner;
  }
  return {rootId: id, parts: validateCraft({version: 1, parts: branch})};
}
export function placeBranch(
  parts: FlightPart[],
  branch: PartBranch,
  {position, rotation, parent = null, attachment = {mode: 'free'}}: BranchPose,
  makeId: () => unknown = () => crypto.randomUUID()
): BranchResult {
  if (parts.length) validateCraft({version: 1, parts});
  const source = validateCraft({version: 1, parts: branch.parts}),
    root = source.find(p => p.id === branch.rootId);
  if (!root || root.parent || source.some(p => p.id !== root.id && !p.parent))
    throw Error('枝の接続が不正です');
  if (parts.length + source.length > 400) throw Error('部品上限は400です。枝全体を配置できません');
  if (parent !== null && !parts.some(p => p.id === parent)) throw Error('取付先が見つかりません');
  if (!finiteVector(position) || !finiteVector(rotation)) throw Error('配置位置・回転が不正です');
  const delta = matrix({p: position, r: rotation}).multiply(matrix(root).invert()),
    used = new Set<string>([...parts, ...source].map(p => p.id)),
    ids = new Map<string, string>();
  const newId = (old: string | null): string => {
    const id = old === null ? undefined : ids.get(old);
    if (id === undefined) throw Error('枝の部品IDが見つかりません');
    return id;
  };
  for (const p of source) {
    const id = makeId();
    if (typeof id !== 'string' || !id || used.has(id)) throw Error('新しい部品IDが重複しています');
    used.add(id);
    ids.set(p.id, id);
  }
  const created = source.map(p => {
    const transform = delta.clone().multiply(matrix(p)),
      position = new T.Vector3(),
      q = new T.Quaternion(),
      scale = new T.Vector3();
    transform.decompose(position, q, scale);
    const e = new T.Euler().setFromQuaternion(q),
      copy: FlightPart = {
        ...p,
        id: newId(p.id),
        parent: p.id === root.id ? parent : newId(p.parent),
        p: position.toArray(),
        r: [e.x, e.y, e.z]
      };
    if (p.dockPartner) copy.dockPartner = ids.get(p.dockPartner);
    return copy;
  });
  const rootId = newId(root.id),
    createdRoot = created.find(p => p.id === rootId);
  if (!createdRoot) throw Error('枝の根の部品が見つかりません');
  createdRoot.attachment = structuredClone(attachment);
  assertNodeAttachments([...parts, ...created], [rootId]);
  transformSymmetryFrames(created, delta);
  normalizeSymmetry(created, {fresh: true});
  const result = validateCraft({version: 1, parts: [...parts, ...created]});
  return {parts: result, rootId, count: created.length};
}

export function moveBranch(
  parts: FlightPart[],
  id: string,
  {position, rotation, parent = null, attachment = {mode: 'free'}}: BranchPose
): BranchResult {
  const checked = validateCraft({version: 1, parts}),
    root = checked.find(p => p.id === id);
  if (!root) throw Error('付け替える部品が見つかりません');
  const ids = descendants(checked, id);
  if (parent !== null && (!checked.some(p => p.id === parent) || ids.has(parent)))
    throw Error('自分や子部品には接続できません。別の取付先を選んでください');
  if (!finiteVector(position) || !finiteVector(rotation)) throw Error('配置位置・回転が不正です');
  const delta = matrix({p: position, r: rotation}).multiply(matrix(root).invert());
  for (const p of checked) {
    // The old boundary docking bond must be removed on both sides.
    if (p.dockPartner && ids.has(p.id) !== ids.has(p.dockPartner)) delete p.dockPartner;
    if (!ids.has(p.id)) continue;
    const transform = delta.clone().multiply(matrix(p)),
      pos = new T.Vector3(),
      q = new T.Quaternion(),
      scale = new T.Vector3();
    transform.decompose(pos, q, scale);
    const e = new T.Euler().setFromQuaternion(q);
    p.p = pos.toArray();
    p.r = [e.x, e.y, e.z];
    if (p.id === id) p.parent = parent;
  }
  root.attachment = structuredClone(attachment);
  assertNodeAttachments(checked, [id]);
  releaseDisplacedAttachments(checked);
  transformSymmetryFrames(
    checked.filter(p => ids.has(p.id)),
    delta
  );
  normalizeSymmetry(
    checked.filter(p => ids.has(p.id)),
    {fresh: true}
  );
  normalizeSymmetry(checked.filter(p => !ids.has(p.id)));
  return {parts: validateCraft({version: 1, parts: checked}), rootId: id, count: ids.size};
}
