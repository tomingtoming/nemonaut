import * as T from 'three';
import {fleet} from './fleet.js';
import {bodyUp} from './celestial.js';
import {PARTS} from './catalog.js';
type FailureEvent = import('./failure-events.js').FailureEvent;
/** Age-dependent size and fade of one failure effect. */
export interface FailureEnvelope {
  age: number;
  radius: number;
  alive: boolean;
  flash: number;
  smoke: number;
}
/** Object3D node seen by traverse: either a mesh or a node without isMesh. */
type WreckNode = (T.Object3D & {isMesh?: false}) | T.Mesh;
type TintableMaterial = T.Material & {color?: T.Color; emissive?: T.Color};
interface FailureParticle {
  mesh: T.Sprite;
  smoke: boolean;
  direction: T.Vector3;
}
interface FailureVisualItem {
  root: T.Group;
  materials: T.SpriteMaterial[];
  particles: FailureParticle[];
}

export function failureEnvelope(
  event: Pick<FailureEvent, 'time' | 'effect' | 'fuel'>,
  now: number
): FailureEnvelope {
  const age = now - event.time,
    hot = event.effect === 'fuel-burst';
  const radius = hot ? Math.min(12, 0.8 + Math.cbrt(event.fuel) * 0.65) : 0.25;
  return {
    age,
    radius,
    alive: age >= 0 && age < (hot ? 8 : 2),
    flash: Math.max(0, 1 - age / 0.5),
    smoke: hot ? Math.max(0, 1 - age / 8) : 0
  };
}
export function markWreckVisual(
  object: T.Object3D,
  vessel: {failureDynamics?: unknown; failureEvents?: readonly FailureEvent[]}
): void {
  if (!vessel.failureDynamics || object.userData.wreckTinted) return;
  object.userData.wreckTinted = true;
  const event = vessel.failureEvents?.find(e => e.partId === object.userData.partId),
    burned = event?.effect === 'fuel-burst' || event?.cause === 'thermal';
  object.traverse((o: WreckNode) => {
    if (!o.isMesh) return;
    o.userData.wreckMaterials = true;
    const tint = (m: TintableMaterial) => {
      const copy = m.clone();
      if (copy.color) copy.color.multiplyScalar(burned ? 0.18 : 0.55);
      if (copy.emissive) copy.emissive.set(0);
      return copy;
    };
    o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
  });
}
export function disposeWreckVisual(object: T.Object3D): void {
  object.traverse((o: T.Object3D & {material?: T.Material | T.Material[]}) => {
    if (!o.userData.wreckMaterials) return;
    const material = o.material;
    if (!material) throw Error('破損表示の材質が見つかりません');
    for (const m of Array.isArray(material) ? material : [material]) m.dispose();
    delete o.userData.wreckMaterials;
  });
}
function plumeTexture() {
  const size = 64,
    data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1,
        dy = ((y + 0.5) / size) * 2 - 1,
        r = Math.hypot(dx, dy),
        i = (y * size + x) * 4;
      const cloud = 0.85 + 0.15 * Math.sin(dx * 17 + Math.sin(dy * 11)) * Math.cos(dy * 19);
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * Math.max(0, 1 - r) ** 1.4 * cloud);
    }
  const texture = new T.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}
// Bounded cosmetic particles only. Actual parts remain owned by physics.
export class FailureVisuals {
  declare items: Map<string, FailureVisualItem>;
  declare scene: T.Object3D;
  declare texture: T.DataTexture;
  constructor(scene: T.Object3D) {
    this.scene = scene;
    this.items = new Map();
    this.texture = plumeTexture();
  }
  clear(): void {
    for (const id of [...this.items.keys()]) this.remove(id);
  }
  remove(id: string): void {
    const item = this.items.get(id);
    if (!item) return;
    this.scene.remove(item.root);
    for (const m of item.materials) m.dispose();
    this.items.delete(id);
  }
  update(f: import('./failure-feedback.js').FailureFleet | null | undefined): void {
    if (!f) {
      this.clear();
      return;
    }
    const now = f.universalTime,
      events = [
        ...new Map(
          fleet(f)
            .flatMap(v => v.failureEvents ?? [])
            .map((e): [string, FailureEvent] => [e.id, e])
        ).values()
      ]
        .filter(e => failureEnvelope(e, now).alive)
        .sort((a, b) => a.time - b.time)
        .slice(-16),
      live = new Set(events.map(e => e.id));
    for (const id of this.items.keys()) if (!live.has(id)) this.remove(id);
    for (const e of events) {
      let item = this.items.get(e.id);
      const env = failureEnvelope(e, now);
      if (!item) {
        const root = new T.Group(),
          materials: T.SpriteMaterial[] = [],
          particles: FailureParticle[] = [];
        for (let i = 0; i < 32; i++) {
          const smoke = e.effect === 'fuel-burst' && i >= 20;
          const material = new T.SpriteMaterial({
            map: this.texture,
            color: smoke ? '#4b4844' : i % 3 ? '#ff6a10' : e.effect === 'fuel-burst' ? '#ffbd46' : '#fff3b0',
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            blending: T.NormalBlending
          });
          materials.push(material);
          const mesh = new T.Sprite(material);
          root.add(mesh);
          const y = 1 - (2 * (i + 0.5)) / 32,
            theta = i * 2.3999632297,
            r = Math.sqrt(1 - y * y);
          particles.push({
            mesh,
            smoke,
            direction: new T.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r)
          });
        }
        item = {root, materials, particles};
        this.scene.add(root);
        this.items.set(e.id, item);
      }
      const age = env.age,
        up = bodyUp(new T.Vector3(...e.position), e.time);
      item.root.position.fromArray(e.position).addScaledVector(new T.Vector3(...e.velocity), age);
      for (const {mesh, smoke, direction} of item.particles) {
        const life = smoke ? env.smoke : Math.max(0, 1 - age / (e.effect === 'fuel-burst' ? 1.6 : 1.1));
        mesh.visible = life > 0;
        mesh.material.opacity = life * (smoke ? 0.45 : 0.9);
        const shell = e.effect === 'fragments' ? Math.max(...(PARTS[e.type]?.size ?? [1])) * 0.55 : 0;
        mesh.position
          .copy(direction)
          .multiplyScalar(shell + (smoke ? 0.45 : 4) * env.radius * age)
          .addScaledVector(up, smoke ? age * env.radius * 0.35 : -age * age * 0.35);
        mesh.scale.setScalar(
          smoke
            ? env.radius * (0.35 + age * 0.14)
            : e.effect === 'fuel-burst'
              ? env.radius * (0.12 + env.flash * 0.45)
              : 0.05 + 0.04 * (1 - life)
        );
      }
    }
  }
  dispose(): void {
    this.clear();
    this.texture.dispose();
  }
}
