// Late-bound calls "up" into app.ts (BACKLOG 7b). Modules split out of app.ts call these slots instead of
// importing the module that imports them, which keeps the runtime import graph acyclic. app.ts assigns the
// real functions once at start-up; a slot that is called before that throws instead of doing nothing.
// Type-only imports: no runtime dependencies and no import-time side effects.
import type {Flight,CraftRecord} from './core.js';
import type {SavedWorld} from './world-save.js';
import type {PracticeDesign} from './practice-session.js';
export type AppHooks={
 updateInfo:()=>void;
 syncFlightControls:()=>void;
 switchVessel:(target:Flight)=>void;
 startFlight:(restored?:Flight|null)=>void;
 endFlight:()=>void;
 stage:()=>void;
 refreshDockedFlight:(next:Flight)=>void;
 updateDocking:()=>void;
 updateNavigation:()=>void;
 updateDebrisList:()=>void;
 updateExploration:()=>void;
 showCenter:()=>void;
 refreshCenter:()=>void;
 enterWorkshop:(bay:string)=>void;
 resumeFromCenter:(selection?:{world:SavedWorld;observe:string|null}|null)=>void;
 openTracking:(focusId?:string|null)=>void;
 persistWorkspace:()=>boolean;
 launchAdditional:(design:PracticeDesign&{bay?:string})=>void;
 rebuild:()=>void;
 select:(id:string|null)=>void;
 cancelPlacement:()=>void;
 checkpoint:()=>void;
 setBay:(b:string)=>void;
 loadData:(data:CraftRecord&{name?:unknown})=>void;
 frame:()=>void;
 updateWorkshop:()=>void;
 renderInterferences:()=>void;
};
const unwired=(name:string)=>()=>{throw Error('app-hooks: '+name+' is not wired');};
export const hooks:AppHooks={
 updateInfo:unwired('updateInfo'),
 syncFlightControls:unwired('syncFlightControls'),
 switchVessel:unwired('switchVessel'),
 startFlight:unwired('startFlight'),
 endFlight:unwired('endFlight'),
 stage:unwired('stage'),
 refreshDockedFlight:unwired('refreshDockedFlight'),
 updateDocking:unwired('updateDocking'),
 updateNavigation:unwired('updateNavigation'),
 updateDebrisList:unwired('updateDebrisList'),
 updateExploration:unwired('updateExploration'),
 showCenter:unwired('showCenter'),
 refreshCenter:unwired('refreshCenter'),
 enterWorkshop:unwired('enterWorkshop'),
 resumeFromCenter:unwired('resumeFromCenter'),
 openTracking:unwired('openTracking'),
 persistWorkspace:unwired('persistWorkspace'),
 launchAdditional:unwired('launchAdditional'),
 rebuild:unwired('rebuild'),
 select:unwired('select'),
 cancelPlacement:unwired('cancelPlacement'),
 checkpoint:unwired('checkpoint'),
 setBay:unwired('setBay'),
 loadData:unwired('loadData'),
 frame:unwired('frame'),
 updateWorkshop:unwired('updateWorkshop'),
 renderInterferences:unwired('renderInterferences'),
};
/** Called once by app.ts with its real functions; the object type makes it list every slot. */
export function wireHooks(real:AppHooks){Object.assign(hooks,real);}
