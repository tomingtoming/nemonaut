// A capture listener may release a pilot and synchronize controls before the
// target handler consumes the user's edit. Keep that pending edit intact.
export interface ManualControl {
  value?: string;
  checked?: boolean;
}
export function preserveManualControlEdit(control: ManualControl, release: () => void): void {
  const value = control.value,
    checked = control.checked;
  release();
  if (value !== undefined) control.value = value;
  if (checked !== undefined) control.checked = checked;
}
export type ControlTarget = EventTarget & ManualControl & {closest?(selectors: string): Element | null};
/** Narrows an event target to the fields a capture listener reads: an optional string value, boolean checked and closest(). */
export const isControlTarget = (target: EventTarget | null): target is ControlTarget =>
  target !== null &&
  (!('value' in target) || target.value === undefined || typeof target.value === 'string') &&
  (!('checked' in target) || target.checked === undefined || typeof target.checked === 'boolean') &&
  (!('closest' in target) || target.closest === undefined || typeof target.closest === 'function');
