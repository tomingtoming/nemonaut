// Firing an action group on the piloted vessel. Every operation assigned to the group runs through the
// same functions the part window uses, so the same conditions apply (control, damage, cargo doors).
//
// Two-state operations are aligned, then flipped, per operation: all parts whose (say) engine is in the
// group are looked at together — if any of them is on, all are switched off; if all are off, all are
// switched on. Different operations in one group are decided independently of each other.
// One-shot operations run where they are possible and are skipped elsewhere. A part that refuses does
// not stop the others. Order: two-state operations, parachutes, separations, undocking — so settings
// still reach parts that leave the vessel in the same press.
import {OPERATIONS, groupMembers} from './action-groups.js';
import {partActions, setPartAction, setParachuteAction} from './part-actions.js';
import {operatePort} from './port-window.js';
import {canControl} from './fleet.js';
type Flight = import('./core.js').Flight;

/** What one operation of the group did: `on` is the state a two-state operation was switched to. */
export interface GroupRun {
  operation: string;
  on: boolean | null;
  count: number;
}
export interface GroupResult {
  /** The piloted vessel afterwards: a new one after undocking, else the one passed in. */
  flight: Flight;
  /** Assignments of this group on the vessel (0: nothing was attempted). */
  assigned: number;
  ran: GroupRun[];
  /** Parts left the vessel (separation or undocking). */
  separated: boolean;
}
const CHUTE_KEYS: Readonly<Record<string, string>> = {
  chuteArm: 'arm',
  chuteDisarm: 'disarm',
  chuteCut: 'cut'
};

export function fireActionGroup(f: Flight, group: number): GroupResult {
  const members = canControl(f) ? groupMembers(f.parts, group) : [],
    ran: GroupRun[] = [];
  let flight = f,
    separated = false;
  for (const {id: operation, kind} of OPERATIONS) {
    const ids = members.filter(m => m.operation === operation).map(m => m.id);
    if (!ids.length) continue;
    if (kind === 'toggle') {
      const isOn = (id: string) => partActions(flight, id).find(a => a.key === operation)?.on === true,
        target = !ids.some(isOn),
        count = ids.filter(id => isOn(id) !== target && setPartAction(flight, id, operation, target)).length;
      if (count) ran.push({operation, on: target, count});
      continue;
    }
    let count = 0;
    for (const id of ids) {
      if (!flight.parts.some(p => p.id === id)) continue;
      if (operation === 'decouple') {
        if (flight.decouplePart(id).size) count++;
      } else if (operation === 'undock') {
        try {
          flight = operatePort(flight, id, 'undock', '');
          count++;
        } catch {
          // Not docked (any more): nothing to undock.
        }
      } else if (setParachuteAction(flight, id, CHUTE_KEYS[operation])) count++;
    }
    if (count) {
      ran.push({operation, on: null, count});
      if (operation === 'decouple' || operation === 'undock') separated = true;
    }
  }
  return {flight, assigned: members.length, ran, separated};
}
/** 「グループ3：エンジン停止 ×3 · 貨物扉 開」 */
export function groupNotice(group: number, ran: readonly GroupRun[]): string {
  return (
    'グループ' +
    group +
    '：' +
    (ran.length
      ? ran
          .map(r => {
            const o = OPERATIONS.find(o => o.id === r.operation);
            if (!o) throw Error('不明な操作です: ' + r.operation);
            return (r.on === false ? o.off : o.on) + (r.count > 1 ? ' ×' + r.count : '');
          })
          .join(' · ')
      : '実行できる操作がありません')
  );
}
