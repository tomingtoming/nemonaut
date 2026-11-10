// Braking and pitch damping for the landing rollout. 6 m/s² and 75 m are conservative planning
// assumptions, not a guarantee of braking performance for arbitrary aircraft.
export interface RolloutState {
  speed: number;
  pitchRate: number;
  remaining: number;
}
export interface RolloutCommand {
  brake: boolean;
  pitch: number;
  invalid?: boolean;
  required?: number;
  delay?: number;
}
export class RolloutControl {
  declare elapsed: number;
  declare braking: boolean;
  constructor() {
    this.elapsed = 0;
    this.braking = false;
  }
  step({speed, pitchRate, remaining}: RolloutState, dt: number): RolloutCommand {
    if (![speed, pitchRate, remaining, dt].every(Number.isFinite) || speed < 0 || dt < 0) {
      this.braking = true;
      return {brake: true, pitch: 0, invalid: true};
    }
    const delay = Math.max(0, 1 - this.elapsed);
    const required = (speed * speed) / 12 + speed * delay + 75;
    // Once braking is required, never release it because speed subsequently fell.
    if (dt > 0) {
      this.braking ||= delay === 0 || remaining <= required;
      this.elapsed += dt;
    }
    return {brake: this.braking, pitch: Math.max(-0.5, Math.min(0.5, pitchRate * 0.12)), required, delay};
  }
}
