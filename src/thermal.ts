import {PARTS, type PartDefinition, type Part} from './catalog.js';
/** Per-part thermal state, updated in place during flight. Temperatures in K, ablator in kg. */
export interface ThermalState {
  temperature: number;
  ablator: number;
  failed: boolean;
}
/** Thermal state by part id. */
export type ThermalMap = Map<string, ThermalState>;
/** The part fields the thermal model reads (a catalog Part satisfies it). */
export type ThermalPart = Pick<Part, 'id' | 'type' | 'p' | 'r'>;
/** Free-stream air: density kg/m³, static temperature K. */
export interface ThermalAir {
  density: number;
  temperature: number;
}
/** One part's thermal reading; heat/loss in W. */
export interface ThermalReading {
  temperature: number;
  limit: number;
  flux: number;
  shielded: boolean;
  heat: number;
  loss: number;
  ablated: number;
  failed: boolean;
}
/** The part closest to its temperature limit (ratio = temperature/limit). */
export interface ThermalHotspot {
  id: string;
  temperature: number;
  ratio: number;
}
export interface ThermalStepResult {
  parts: Map<string, ThermalReading>;
  hottest: ThermalHotspot | null;
  consumed: number;
  failed: string[];
}
/** A catalog definition plus the optional per-part ablation overrides the thermal model honours. */
export type ThermalDefinition = PartDefinition & {ablationTemperature?: number; ablatorEnergy?: number};
/** Part definitions by type, as thermal functions accept them (PARTS by default). */
export type ThermalCatalog = Record<string, ThermalDefinition>;
// Default material properties used by flight and coast cooling.
export const THERMAL = {
  sigma: 5.670374419e-8,
  heatCapacity: 900,
  emissivity: 0.8,
  maxTemperature: 1100,
  ablatorEnergy: 2e7,
  ablationTemperature: 650
};
export function createThermal(
  parts: readonly Pick<Part, 'id' | 'type'>[],
  definitions: ThermalCatalog = PARTS
): ThermalMap {
  return new Map<string, ThermalState>(
    parts.map(p => [p.id, {temperature: 288.15, ablator: definitions[p.type].ablator || 0, failed: false}])
  );
}
