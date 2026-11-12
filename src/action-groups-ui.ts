// Firing an action group from the keyboard or from its row in the flight HUD: the same preparation as a
// part window operation (flight-panels.ts beforePartOperation), then the notice and sound. A group with
// nothing assigned on the piloted vessel does nothing at all, so a stray digit leaves automation and
// time warp alone. No import-time side effects.
import {groupMembers} from './action-groups.js';
import {fireActionGroup, groupNotice} from './action-group-fire.js';
import {canControl} from './fleet.js';
import {state} from './app-state.js';
import {hooks} from './app-hooks.js';
import {notify} from './ui-common.js';
import {gameAudio} from './flight-shared.js';
import {beforePartOperation, partWindowPanels} from './flight-panels.js';

export function fireGroup(group: number): void {
  const f = state.flight;
  if (!f || state.atCenter || !canControl(f) || !groupMembers(f.parts, group).length) return;
  beforePartOperation();
  const result = fireActionGroup(f, group);
  if (result.separated) {
    hooks.refreshDockedFlight(result.flight);
    gameAudio().play('stage');
  } else {
    partWindowPanels().partWindows.update();
    if (result.ran.length) gameAudio().play('click');
  }
  notify(groupNotice(group, result.ran));
}
