import {overWater} from './surface-frame.js';
import {PARTS} from './catalog.js';
import {partCenter, type AeroPart} from './aero.js';
import {referenceBody, bodyAltitude} from './celestial.js';
import {atmosphere} from './planet.js';
export interface MediumFlight {
  pos: import('three').Vector3;
  q: import('three').Quaternion;
  universalTime: number;
}
export interface EngineMedium {
  density: number;
  submersion: number;
}
export function hasVacuumEngine(parts: readonly {type: string}[]): boolean {
  return parts.some(p => PARTS[p.type].thrustMedium === 'independent');
}

// Match the reference body and vessel altitude used by the flight solver.
export function engineMedium(f: MediumFlight, p: AeroPart, time: number = f.universalTime): EngineMedium {
  const body = referenceBody(f.pos, time),
    height = bodyAltitude(f.pos, time, body);
  const point = partCenter(p).applyQuaternion(f.q).add(f.pos);
  return {
    density: body.id === 'planet' ? atmosphere(height).density : 0,
    submersion: overWater(point, time, body)
      ? Math.max(0, Math.min(1, (0.1 - bodyAltitude(point, time, body)) / 0.25))
      : 0
  };
}
