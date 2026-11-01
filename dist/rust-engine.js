// Rust physics: the game's only solver. Rapier JS objects remain the data model for bodies and
// colliders; each Rapier JS world gets one Rust Wasm craft world:
// every step imports the JS body pre-state, forces, masses and ground, steps Rust, and writes
// the result back to the JS body. The JS solver is not called while installed. Game logic,
// staging/failure decisions, saves and planetary translation stay JS-owned.
// Any unsupported input throws instead of silently falling back to the JS solver.
const vec=v=>[v.x,v.y,v.z];
const fail=message=>{throw Error('Rust物理: '+message);};
const check=(ok,message)=>{if(!ok)fail(message);};
const installed=new WeakMap();
// Fetch, compile and install once per Rapier module (page or Worker).
// Vessel-vessel contact queries (pair_*) of the installed engine, or null before installation.
export function rustPairQuery(R){return installed.get(R)?.pair??null;}
export async function loadRustEngine(R,url){
 if(installed.has(R))return installed.get(R);
 const module=await WebAssembly.compile(await (await fetch(url)).arrayBuffer());
 return installRustEngine(R,module);
}
export function installRustEngine(R,module,{zeroImpulses=()=>false}={}){
 if(installed.has(R))return installed.get(R);
 const worlds=new Map(),stats={worlds:0,frames:0,rebuilds:0,contactQueries:0,contactPoints:0};
 const original={step:R.World.prototype.step,contactPair:R.World.prototype.contactPair,free:R.World.prototype.free},body={rotation:R.RigidBody.prototype.rotation,setRotation:R.RigidBody.prototype.setRotation};
 // JS setRotation renormalizes, so reading back would differ from the solver output by an ulp,
 // which the game then integrates. Until the game sets a new rotation, report Rust's exact value.
 const exactRotation=new WeakMap();
 // Versions let a step skip re-reading colliders: geometry changes only through create/remove,
 // and masses only through setMass (fuel use, staging).
 const geometryVersion=new WeakMap();let massVersion=0;
 const colliderApi={create:R.World.prototype.createCollider,remove:R.World.prototype.removeCollider,setMass:R.Collider.prototype.setMass};
 R.World.prototype.createCollider=function(...args){geometryVersion.set(this,(geometryVersion.get(this)??0)+1);return colliderApi.create.apply(this,args);};
 R.World.prototype.removeCollider=function(...args){geometryVersion.set(this,(geometryVersion.get(this)??0)+1);return colliderApi.remove.apply(this,args);};
 R.Collider.prototype.setMass=function(...args){massVersion++;return colliderApi.setMass.apply(this,args);};
 R.RigidBody.prototype.rotation=function(){return exactRotation.get(this)??body.rotation.call(this);};
 R.RigidBody.prototype.setRotation=function(...args){exactRotation.delete(this);return body.setRotation.apply(this,args);};
 // The body and ground are found once per world and re-found only when the counts change.
 function single(world,s=worlds.get(world)){
  const counts=world.bodies.len()+':'+world.colliders.len();
  if(s?.counts===counts)return s.found;
  const bodies=[];world.bodies.forEach(b=>bodies.push(b));check(bodies.length===1,'world must own one craft body');
  const grounds=[];world.colliders.forEach(c=>{if(!c.parent())grounds.push(c);});check(grounds.length<=1,'at most one static ground');
  const found={body:bodies[0],ground:grounds[0]};if(s){s.counts=counts;s.found=found;}return found;
 }
 function rust(world){
  let s=worlds.get(world);if(s)return s;
  const a=new WebAssembly.Instance(module,{}).exports;a.craft_reset();
  s={a,signature:null,index:new Map(),masses:[],colliders:[],geometry:-1,massVersion:-1,frames:0,counts:null,found:null};worlds.set(world,s);stats.worlds++;return s;
 }
 function syncGround(a,g){
  if(!g)return;const h=g.halfExtents(),q=g.rotation();check(h.x===2000&&h.y===1&&h.z===2000,'unsupported ground shape');
  check(a.craft_ground(g.isEnabled()?1:0,...vec(g.translation()),q.x,q.y,q.z,q.w,g.friction())===1,'ground rejected');
 }
 R.World.prototype.step=function(){
  const s=rust(this),a=s.a,{body,ground}=single(this,s);syncGround(a,ground);
  // Collider shape, pose and friction are fixed at creation (Flight rebuilds colliders, giving new
  // handles), so the handle sequence identifies the geometry; only masses change in place.
  const geometry=geometryVersion.get(this)??0;
  if(s.geometry!==geometry){s.geometry=geometry;s.colliders=[];for(let i=0;i<body.numColliders();i++)s.colliders.push(body.collider(i));s.massVersion=-1;}
  const colliders=s.colliders,signature=colliders.map(c=>c.handle).join(',');
  if(signature!==s.signature){
   if(s.signature!==null){check(a.craft_clear_shapes()===1,'shape clear rejected');stats.rebuilds++;}
   for(const c of colliders){
    const p=c.translationWrtParent(),q=c.rotationWrtParent(),ball=c.shapeType()===R.ShapeType.Ball;
    check(ball||c.shapeType()===R.ShapeType.Cuboid,'only box/ball colliders are supported');
    const h=ball?{x:c.radius(),y:0,z:0}:c.halfExtents();
    check(a.craft_shape(ball?1:0,h.x,h.y,h.z,p.x,p.y,p.z,q.x,q.y,q.z,q.w,c.mass(),c.friction())===1,'shape rejected');
   }
   s.signature=signature;s.index=new Map(colliders.map((c,i)=>[c.handle,i]));s.masses=colliders.map(c=>c.mass());
  }
  if(s.massVersion!==massVersion){s.massVersion=massVersion;colliders.forEach((c,i)=>{const m=c.mass();if(m!==s.masses[i]){check(a.craft_mass(i,m)===1,'mass rejected');s.masses[i]=m;}});}
  const p=this.integrationParameters,t=body.translation(),v=body.linvel(),r=body.rotation(),w=body.angvel();
  check(a.craft_state(t.x,t.y,t.z,v.x,v.y,v.z,r.x,r.y,r.z,r.w,w.x,w.y,w.z)===1,'state rejected');
  check(a.craft_solver_step(...vec(body.userForce()),...vec(body.userTorque()),...vec(this.gravity),this.timestep,p.lengthUnit,p.normalizedAllowedLinearError,p.normalizedPredictionDistance)===1,'step rejected');
  const out=Array.from({length:13},(_,i)=>a.craft_read(i));check(out.every(Number.isFinite),'nonfinite state');
  check(Math.abs(a.craft_read(13)-body.mass())<.02,'mass differs from JS');
  body.setTranslation({x:out[0],y:out[1],z:out[2]},true);body.setLinvel({x:out[3],y:out[4],z:out[5]},true);
  body.setRotation({x:out[6],y:out[7],z:out[8],w:out[9]},true);body.setAngvel({x:out[10],y:out[11],z:out[12]},true);
  exactRotation.set(body,new R.Quaternion(out[6],out[7],out[8],out[9]));
  s.frames++;stats.frames++;
 };
 R.World.prototype.contactPair=function(collider,other,callback){
  const s=worlds.get(this),{ground}=single(this,s);
  if(!s)return;// never stepped: no solver contacts yet, as in JS
  check(ground&&other.handle===ground.handle,'only craft-ground contact queries are supported');
  const i=s.index.get(collider.handle);check(i!==undefined,'collider is not a current craft shape');
  const n=s.a.craft_contact_count(i);check(Number.isInteger(n)&&n>=0,'contact count');stats.contactQueries++;
  if(n>0){stats.contactPoints+=n;callback({numContacts:()=>n,contactImpulse:k=>zeroImpulses()?0:s.a.craft_contact_impulse(i,k)},false);}
 };
 R.World.prototype.free=function(){const s=worlds.get(this);if(s){s.a.craft_dispose();worlds.delete(this);}return original.free.call(this);};
 // Test-only geometry oracle for non-game worlds (e.g. a fixed hollow part with free balls).
 R.World.prototype.referenceSolverStep=original.step;
 const pair=new WebAssembly.Instance(module,{}).exports;
 const controller={stats,worlds,pair,uninstall(){for(const {a}of worlds.values())a.craft_dispose();worlds.clear();Object.assign(R.World.prototype,original);Object.assign(R.RigidBody.prototype,body);R.World.prototype.createCollider=colliderApi.create;R.World.prototype.removeCollider=colliderApi.remove;R.Collider.prototype.setMass=colliderApi.setMass;delete R.World.prototype.referenceSolverStep;installed.delete(R);}};
 installed.set(R,controller);return controller;
}
