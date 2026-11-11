// Fields of a frozen baseline that are no longer compared. A frozen baseline (v1, v2) cannot be
// recorded again, so a recorded value that embodied an engine defect which has since been fixed is
// listed here instead, with the reason. Everything else in its case is still compared, and a retired
// field must still be present in the replay as a finite number.
export const retired=[
 {version:2,case:'capsule-tank-impulse-ranking',path:'result.samples[3].vessels[0].resources[0].charge',
  // From about t = 1 s the capsule rests on the ground with SAS on. The recorded charge (990.82393)
  // includes SAS power spent against the jitter of stale ground contacts, which the engine no longer
  // produces (990.82551 now; the tolerance is 0.001). tests/golden/js-v3.json pins the corrected run.
  reason:'SAS power spent against stale-contact jitter while resting on the ground'}
];
/**
 * The retired paths of each case of one baseline, as a Map from case name to paths. Throws when an
 * entry of that version names a case the baseline does not have, so that the list cannot outlive
 * what it refers to. A path that a case does not have is reported by compareGolden.
 */
export function retiredFields(version,caseNames,entries=retired){
 const names=new Set(caseNames),fields=new Map();
 for(const entry of entries.filter(entry=>entry.version===version)){
  if(!names.has(entry.case))throw Error(`Retired golden field names a missing case: v${version} ${entry.case} ${entry.path}`);
  fields.set(entry.case,[...(fields.get(entry.case)??[]),entry.path]);
 }
 return fields;
}
