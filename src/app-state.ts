// Shared mutable state of the app (BACKLOG 7b): every former module-level `let` of app.ts, in one object
// so that modules split out of app.ts read and write the same values. Type-only imports: this module has
// no runtime dependencies and no import-time side effects. Values that need runtime code (the starting
// craft, the frame clock) start empty here and are assigned by app.ts at their original place.
import type * as T from 'three';
import type {FlightPart, Flight} from './core.js';
import type {PartType, PartAttachment} from './catalog.js';
import type {PartBranch} from './assembly-branch.js';
import type {SavedWorld} from './world-save.js';
import type {PracticeSession} from './practice-session.js';
import type {SpaceCenter} from './space-center.js';
import type {WorldRuntime} from './world-runtime.js';
import type {LaunchPilot} from './launch-pilot.js';
import type {ReturnPilot} from './return-pilot.js';
import type {FlightScenery} from './flight-scenery.js';
import type {CoastBlocker} from './coast-flight.js';
export type EditMode = 'select' | 'translate' | 'rotate';
export type AppState = {
  linkSymmetry: boolean;
  lastCoastBlocker: CoastBlocker | null;
  workshopFloor: number;
  workshopGridSize: number;
  recoveryUndo: {before: SavedWorld; after: string; message: string} | null;
  branchDraft: PartBranch | null;
  movingBranch: {id: string; ids: Set<string>; before: string; parent: string | null} | null;
  universalTime: number;
  practiceSession: PracticeSession | null;
  activeFlightName: string;
  atCenter: boolean;
  centerReady: boolean;
  parkedWorld: SavedWorld | null;
  centerView: SpaceCenter | null;
  workspaceError: boolean;
  parts: FlightPart[];
  selected: string | null;
  placing: PartType | null;
  ghost: T.Object3D | null;
  flight: Flight | null;
  worldRuntime: WorldRuntime | null;
  category: string;
  mode: EditMode;
  bayMode: string;
  pointerDown: {x: number; y: number; button: number; wasGizmo: boolean} | null;
  saveDrag: FlightPart[] | null;
  pendingPose: {pos: T.Vector3; q: T.Quaternion; parent: string | null; attachment: PartAttachment} | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  chuteFramed: boolean;
  launchPilot: LaunchPilot | ReturnPilot | null;
  trackedDebris: Flight | null;
  flightScenery: FlightScenery | undefined;
  cameraKeyTime: number | null;
  launchPartOrigins: Map<string | undefined, string | undefined>;
  last: number;
  infoTime: number;
  dockingArmed: {flight: Flight | null; own: string; target: string} | null;
  explorationError: string;
};
export const state: AppState = {
  linkSymmetry: true,
  lastCoastBlocker: null,
  workshopFloor: 0,
  workshopGridSize: 80,
  recoveryUndo: null,
  branchDraft: null,
  movingBranch: null,
  universalTime: 0,
  practiceSession: null,
  activeFlightName: '',
  atCenter: true,
  centerReady: false,
  parkedWorld: null,
  centerView: null,
  workspaceError: false,
  parts: [],
  selected: null,
  placing: null,
  ghost: null,
  flight: null,
  worldRuntime: null,
  category: 'すべて',
  mode: 'select',
  bayMode: 'vab',
  pointerDown: null,
  saveDrag: null,
  pendingPose: null,
  timer: undefined,
  chuteFramed: false,
  launchPilot: null,
  trackedDebris: null,
  flightScenery: undefined,
  cameraKeyTime: null,
  launchPartOrigins: new Map(),
  last: 0,
  infoTime: 0,
  dockingArmed: null,
  explorationError: ''
};
