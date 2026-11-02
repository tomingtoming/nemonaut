// The bundle is generated into dist by tools/build.mjs from tools/; those sources are not type-checked yet.
// Minimal shapes of tools/takeoff-session.mjs, landing-session.mjs, return-session.mjs and their clients as src uses them.
// The flight passed in is the app's flight record; the sessions only keep and compare it, so it stays opaque here.
export type AutopilotFlight = object;
export interface AutopilotCommands {
  pitch?: number;
  roll?: number;
  yaw?: number;
}
export interface CruiseTarget {
  speed: number;
  altitude: number;
  heading: number;
  mode: string;
  vertical: number;
}
export type WorkerFactory = () => Worker;
export class TakeoffPreviewClient {
  constructor(makeWorker: WorkerFactory, options?: {timeoutMs?: number; maxAge?: number});
  cancel(): void;
}
export class LandingPlanClient {
  constructor(makeWorker: WorkerFactory, options?: {timeoutMs?: number});
  cancel(): void;
}
export interface TakeoffPilot {
  phase: string;
  target: CruiseTarget;
  cruise: {target: CruiseTarget; status?: string; running?: boolean} | null;
  update(f: AutopilotFlight, dt: number): AutopilotCommands;
}
export interface TakeoffPrepareResult {
  status: string;
  accepted?: boolean;
}
export class TakeoffSession {
  constructor(client: TakeoffPreviewClient);
  state: string;
  cancel(): void;
  prepare(f: AutopilotFlight, settings: CruiseTarget): Promise<TakeoffPrepareResult>;
  readyFor(f: AutopilotFlight, settings: CruiseTarget): boolean;
  start(f: AutopilotFlight, settings: CruiseTarget): TakeoffPilot;
}
export interface LandingPilot {
  phase: string;
}
export interface LandingPrepareResult {
  status: string;
}
export class LandingSession {
  constructor(client: LandingPlanClient);
  state: string;
  owner: AutopilotFlight | null;
  pilot: LandingPilot | null;
  faultMessage?: string | null;
  cancel(): void;
  prepare(f: AutopilotFlight, options?: {end?: string}): Promise<LandingPrepareResult>;
  readyFor(f: AutopilotFlight): boolean;
  start(f: AutopilotFlight): LandingPilot;
  stop(reason?: string): void;
  goAround(f: AutopilotFlight): boolean;
  step(f: AutopilotFlight, dt: number, options?: {manual?: boolean}): AutopilotCommands;
}
export class ReturnSession {
  constructor(client: LandingPlanClient);
  landing: LandingSession;
  state: string;
  owner: AutopilotFlight | null;
  message?: string | null;
  start(f: AutopilotFlight, settings: {speed: number; end: string}): object;
  stop(reason?: string): void;
  step(f: AutopilotFlight, dt: number, options?: {manual?: boolean}): AutopilotCommands;
}
export function departureReadiness(f: AutopilotFlight, target: CruiseTarget): string | null;
export function landingReadiness(f: AutopilotFlight, end?: string): string | null;
export function returnReadiness(f: AutopilotFlight, speed?: number, end?: string): string | null;
