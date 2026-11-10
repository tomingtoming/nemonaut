// Throttle tail of rendezvous transfer and velocity-match burns without a fixed power (100 → 10 → 1 %
// under 2 and 0.5 m/s); the planner and the automatic burn must use this same tail. Lunar departure and
// return burns use terminalBurnThrottle.
export const transferThrottle = (remaining: number): number =>
  remaining < 0.5 ? 0.01 : remaining < 2 ? 0.1 : 1;

export interface RendezvousContract {
  burnThrottle: number | null;
  duration: number;
  targetPartId: string;
}
export type RendezvousContractInput = Omit<RendezvousContract, 'targetPartId'> & {
  targetPartId?: string | null;
};
export function validateRendezvousBurn(value: RendezvousContractInput): RendezvousContract {
  if (
    !value ||
    ![null, 0.1].includes(value.burnThrottle) ||
    !Number.isFinite(value.duration) ||
    value.duration <= 0 ||
    value.duration > 1200 ||
    !hasTargetPart(value) ||
    !value.targetPartId.length ||
    value.targetPartId.length > 200
  )
    throw Error('会合噴射計画の保存値が不正です');
  return value;
}
function hasTargetPart(value: RendezvousContractInput): value is RendezvousContract {
  return typeof value.targetPartId === 'string';
}

// Editing invalidates the timed contract; it cannot silently become an impulse
// epoch with a second half-burn correction. The UI binds only the exact preview.
type Vector3 = import('three').Vector3;
export interface RendezvousFlight {
  targetPartId?: string | null;
}
export interface RendezvousPreview {
  universalTime: number;
  impulse: Vector3;
}
export interface RendezvousBurnPlan {
  burnThrottle: number | null;
  duration: number;
}
interface PendingRendezvous {
  flight: RendezvousFlight;
  epoch: number;
  impulse: Vector3;
  contract: RendezvousContract;
  invalid?: boolean;
}
export class RendezvousPlanBinding {
  declare pending: PendingRendezvous | null | undefined;
  clear(): void {
    this.pending = null;
  }
  observe(f: RendezvousFlight | null | undefined): void {
    if (this.pending && (this.pending.flight !== f || this.pending.contract.targetPartId !== f?.targetPartId))
      this.pending.invalid = true;
  }
  remember(
    f: RendezvousFlight,
    preview: RendezvousPreview,
    burn: RendezvousBurnPlan | null | undefined
  ): void {
    this.clear();
    if (!burn) return;
    const contract = validateRendezvousBurn({
      burnThrottle: burn.burnThrottle,
      duration: burn.duration,
      targetPartId: f.targetPartId
    });
    this.pending = {flight: f, epoch: preview.universalTime, impulse: preview.impulse.clone(), contract};
  }
  options(
    f: RendezvousFlight | null | undefined,
    preview: RendezvousPreview
  ): {rendezvous?: RendezvousContract} {
    this.observe(f);
    const p = this.pending;
    if (p?.invalid) throw Error('機体または目標が変わりました。会合案を作り直してください');
    if (!p || p.flight !== f || p.contract.targetPartId !== f?.targetPartId) return {};
    if (Math.abs(preview.universalTime - p.epoch) > 1e-6 || preview.impulse.distanceTo(p.impulse) > 0.001)
      return {};
    return {rendezvous: {...p.contract}};
  }
}
