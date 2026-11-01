// The game's physics: a thin facade over the Rust Rapier engine (src/engine/orbital_engine.wasm).
// It offers the slice of the Rapier JS API the game uses, under the same names, so game code reads
// as before. All state lives in the Rust world: every setter and getter calls the Rapier method
// that the rapier.js 0.21 binding calls, so values (f32 storage, quaternion normalization, mass
// properties, force accumulation) are exactly those of JS Rapier. One Wasm instance per World.

type Vec3 = {x: number; y: number; z: number};
type Quat = {x: number; y: number; z: number; w: number};
type Exports = Record<string, (...args: number[]) => number>;

let wasmModule: WebAssembly.Module | null = null;
const fail = (message: string): never => {throw Error('Rust物理: ' + message);};
const ok = (result: number, message: string) => {if (result !== 1) fail(message);};

/** Use an already compiled engine module (Node tests, Workers that compiled it themselves). */
export function installPhysics(module: WebAssembly.Module) {wasmModule = module;}
/** Fetch and compile the engine once per page or Worker. */
export async function loadPhysics(url: URL | string) {
 if (!wasmModule) wasmModule = await WebAssembly.compile(await (await fetch(url)).arrayBuffer());
 return wasmModule;
}
export const physicsReady = () => wasmModule !== null;

export const ShapeType = Object.freeze({Ball: 0, Cuboid: 1});

/** RAPIER.Quaternion stand-in (game code only reads x, y, z, w). */
export class Quaternion {constructor(public x: number, public y: number, public z: number, public w: number) {}}

export class RigidBodyDesc {
 translation: Vec3 = {x: 0, y: 0, z: 0};
 static dynamic() {return new RigidBodyDesc();}
 setTranslation(x: number, y: number, z: number) {this.translation = {x, y, z}; return this;}
 // The engine's body is always non-sleeping with CCD, as the game requests.
 setCanSleep(canSleep: boolean) {if (canSleep) fail('sleeping bodies are not supported'); return this;}
 setCcdEnabled(enabled: boolean) {if (!enabled) fail('CCD is always enabled'); return this;}
}

export class ColliderDesc {
 translation: Vec3 = {x: 0, y: 0, z: 0};
 rotation: Quat = {x: 0, y: 0, z: 0, w: 1};
 mass = 0;
 friction = .5;
 private constructor(readonly kind: number, readonly extents: Vec3) {}
 static cuboid(hx: number, hy: number, hz: number) {return new ColliderDesc(ShapeType.Cuboid, {x: hx, y: hy, z: hz});}
 static ball(radius: number) {return new ColliderDesc(ShapeType.Ball, {x: radius, y: radius, z: radius});}
 setTranslation(x: number, y: number, z: number) {this.translation = {x, y, z}; return this;}
 setRotation(q: Quat) {this.rotation = {x: q.x, y: q.y, z: q.z, w: q.w}; return this;}
 setMass(mass: number) {this.mass = mass; return this;}
 setFriction(friction: number) {this.friction = friction; return this;}
 // The engine builds every collider with restitution 0.
 setRestitution(restitution: number) {if (restitution !== 0) fail('restitution must be 0'); return this;}
}

export class Collider {
 private storedMass: number;
 constructor(private readonly world: World, readonly handle: number, private index: number, mass: number) {this.storedMass = Math.fround(mass);}
 /** Index of this collider in the engine (-1 is the ground). */
 get engineIndex() {return this.index;}
 private get(field: number) {return this.world.exports.shape_get(this.index, field);}
 parent() {return this.index < 0 ? null : this.world.body;}
 shapeType() {return this.get(0) === 1 ? ShapeType.Ball : ShapeType.Cuboid;}
 halfExtents(): Vec3 {return {x: this.get(1), y: this.get(2), z: this.get(3)};}
 radius() {return this.get(1);}
 translationWrtParent(): Vec3 {return {x: this.get(4), y: this.get(5), z: this.get(6)};}
 rotationWrtParent(): Quat {return {x: this.get(7), y: this.get(8), z: this.get(9), w: this.get(10)};}
 mass() {return this.get(11);}
 friction() {return this.get(12);}
 setMass(mass: number) {
  // An unchanged mass leaves the mass properties unchanged; skipping avoids a recompute per step.
  if (Math.fround(mass) === this.storedMass) return;
  this.storedMass = Math.fround(mass);
  ok(this.world.exports.craft_mass(this.index, mass), 'collider mass rejected');
 }
 // Ground only: pose and enabled state, sent together (the engine normalizes the rotation exactly
 // as coSetRotation does, from the value last given).
 setEnabled(enabled: boolean) {this.world.ground.enabled = enabled; this.world.syncGround();}
 setTranslation(t: Vec3) {this.world.ground.translation = {x: t.x, y: t.y, z: t.z}; this.world.syncGround();}
 setRotation(q: Quat) {this.world.ground.rotation = {x: q.x, y: q.y, z: q.z, w: q.w}; this.world.syncGround();}
 isEnabled() {return this.world.ground.enabled;}
}

export class RigidBody {
 constructor(private readonly world: World) {}
 private get(field: number) {return this.world.exports.body_get(field);}
 private vector(first: number): Vec3 {return {x: this.get(first), y: this.get(first + 1), z: this.get(first + 2)};}
 translation() {return this.vector(0);}
 linvel() {return this.vector(3);}
 rotation(): Quat {return {x: this.get(6), y: this.get(7), z: this.get(8), w: this.get(9)};}
 angvel() {return this.vector(10);}
 mass() {return this.get(13);}
 localCom() {return this.vector(14);}
 worldCom() {return this.vector(17);}
 principalInertia() {return this.vector(20);}
 principalInertiaLocalFrame(): Quat {return {x: this.get(23), y: this.get(24), z: this.get(25), w: this.get(26)};}
 userForce() {return this.vector(27);}
 userTorque() {return this.vector(30);}
 setTranslation(t: Vec3, _wakeUp = true) {ok(this.world.exports.body_set_translation(t.x, t.y, t.z), 'translation rejected');}
 setRotation(q: Quat, _wakeUp = true) {ok(this.world.exports.body_set_rotation(q.x, q.y, q.z, q.w), 'rotation rejected');}
 setLinvel(v: Vec3, _wakeUp = true) {ok(this.world.exports.body_set_velocity(0, v.x, v.y, v.z), 'velocity rejected');}
 setAngvel(v: Vec3, _wakeUp = true) {ok(this.world.exports.body_set_velocity(1, v.x, v.y, v.z), 'angular velocity rejected');}
 // Forces and torques are always reset together by the game.
 resetForces(_wakeUp = true) {ok(this.world.exports.body_reset_forces(), 'reset rejected');}
 resetTorques(_wakeUp = true) {}
 addForceAtPoint(f: Vec3, p: Vec3, _wakeUp = true) {ok(this.world.exports.body_add_force_at_point(f.x, f.y, f.z, p.x, p.y, p.z), 'force rejected');}
 addTorque(t: Vec3, _wakeUp = true) {ok(this.world.exports.body_add_torque(t.x, t.y, t.z), 'torque rejected');}
 recomputeMassPropertiesFromColliders() {this.world.flushRemovals(); ok(this.world.exports.body_recompute_mass(), 'mass recompute rejected');}
 numColliders() {this.world.flushRemovals(); return this.world.shapes.length;}
 collider(i: number) {this.world.flushRemovals(); return this.world.shapes[i];}
}

type Manifold = {numContacts(): number; contactImpulse(i: number): number};

export class World {
 readonly exports: Exports;
 gravity: Vec3;
 timestep = 1 / 60;
 numSolverIterations = 8;
 integrationParameters = {lengthUnit: 100, normalizedAllowedLinearError: .001, normalizedPredictionDistance: .002};
 body: RigidBody | null = null;
 groundCollider: Collider | null = null;
 ground = {enabled: true, translation: {x: 0, y: 0, z: 0} as Vec3, rotation: {x: 0, y: 0, z: 0, w: 1} as Quat, friction: .5};
 shapes: Collider[] = [];
 private removed = new Set<Collider>();
 private nextHandle = 1;
 private freed = false;
 constructor(gravity: Vec3) {
  if (!wasmModule) fail('engine not loaded');
  this.exports = new WebAssembly.Instance(wasmModule as WebAssembly.Module, {}).exports as unknown as Exports;
  this.exports.craft_reset();
  this.gravity = {x: gravity.x, y: gravity.y, z: gravity.z};
 }
 createRigidBody(desc: RigidBodyDesc) {
  if (this.body) fail('a world owns one craft body');
  this.body = new RigidBody(this);
  this.body.setTranslation(desc.translation);
  return this.body;
 }
 createCollider(desc: ColliderDesc, parent?: RigidBody) {
  if (!parent) {
   // The static ground: the Flight's 2000 x 1 x 2000 half-extent box, made before any part.
   const e = desc.extents;
   if (this.groundCollider || desc.kind !== ShapeType.Cuboid || e.x !== 2000 || e.y !== 1 || e.z !== 2000) fail('unsupported static collider');
   this.ground = {enabled: true, translation: {...desc.translation}, rotation: {...desc.rotation}, friction: desc.friction};
   this.syncGround();
   return this.groundCollider = new Collider(this, this.nextHandle++, -1, 0);
  }
  if (parent !== this.body) fail('collider parent must be the craft body');
  this.flushRemovals();
  const t = desc.translation, q = desc.rotation, e = desc.extents;
  ok(this.exports.craft_shape(desc.kind === ShapeType.Ball ? 1 : 0, e.x, e.y, e.z, t.x, t.y, t.z, q.x, q.y, q.z, q.w, desc.mass, desc.friction), 'collider rejected');
  const collider = new Collider(this, this.nextHandle++, this.shapes.length, desc.mass);
  this.shapes.push(collider);
  return collider;
 }
 /** The game rebuilds all part colliders at once (staging, docking, cargo doors). */
 removeCollider(collider: Collider, _wakeUp = true) {
  if (collider === this.groundCollider) fail('the ground cannot be removed');
  this.removed.add(collider);
 }
 flushRemovals() {
  if (!this.removed.size) return;
  if (this.removed.size !== this.shapes.length || !this.shapes.every(s => this.removed.has(s))) fail('only removing every part collider at once is supported');
  ok(this.exports.craft_clear_shapes(), 'collider removal rejected');
  this.shapes = [];this.removed.clear();
 }
 syncGround() {
  const g = this.ground, t = g.translation, q = g.rotation;
  ok(this.exports.ground_set(g.enabled ? 1 : 0, t.x, t.y, t.z, q.x, q.y, q.z, q.w, g.friction), 'ground rejected');
 }
 step() {
  // The engine world is built with the game's 8 solver iterations.
  if (this.numSolverIterations !== 8) fail('numSolverIterations must be 8');
  this.flushRemovals();
  const g = this.gravity, p = this.integrationParameters;
  ok(this.exports.world_step(g.x, g.y, g.z, this.timestep, p.lengthUnit, p.normalizedAllowedLinearError, p.normalizedPredictionDistance), 'step rejected');
 }
 /** Contacts of a part collider with the ground, as JS Rapier's contactPair reports them. */
 contactPair(collider: Collider, other: Collider, callback: (manifold: Manifold, flipped: boolean) => void) {
  if (other !== this.groundCollider || collider.engineIndex < 0) fail('only part-ground contact queries are supported');
  const i = collider.engineIndex, n = this.exports.craft_contact_count(i);
  if (n > 0) callback({numContacts: () => n, contactImpulse: k => this.exports.craft_contact_impulse(i, k)}, false);
 }
 free() {if (!this.freed) {this.freed = true; this.exports.craft_dispose();}}
}

/** Drop-in for the default export of the Rapier module, as the game imports it. */
export default {init: async () => {}, World, RigidBodyDesc, ColliderDesc, ShapeType, Quaternion};
