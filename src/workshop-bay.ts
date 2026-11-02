// Workshop bay geometry (BACKLOG 7c, moved from app.ts): the hangar room, the deck, the floor and the grid,
// and their fitting to the craft. No import-time side effects: app.ts calls buildWorkshopBay() where the
// geometry was built before.
import * as T from 'three';
import {workshopLayout,workshopFrame} from './workshop-layout.js';
import {state} from './app-state.js';
import {sceneCore,mat,box} from './scene.js';
let built:{room:T.Group;workshopDeck:T.Group;workshopGround:ReturnType<typeof box>;grid:T.GridHelper}|null=null;
export function buildWorkshopBay(){const {bay}=sceneCore();
const room=new T.Group(),workshopDeck=new T.Group();bay.add(room,workshopDeck);
const beamMat=mat('#25343d',.5,.5);
const workshopGround=box(bay,[90,.25,90],[0,-.3,0],mat('#334750',.3,.65));let grid=new T.GridHelper(80,80,'#647984','#435963');grid.position.y=-.16;bay.add(grid);
for(const x of [-18,18]){box(room,[.5,22,44],[x,10,-3],beamMat);for(let z=-22;z<=20;z+=7){box(room,[.65,20,.65],[x,10,z],beamMat);box(room,[.1,8,.25],[x-x/180,8,z],mat('#b07b43'));}}
for(let z=-22;z<=20;z+=7)box(room,[36,.45,.5],[0,19,z],beamMat);
box(room,[36,19,.5],[0,9.5,-25],mat('#243742'));
for(const x of [-12,-6,0,6,12]){box(room,[.1,18,.1],[x,9,-24.6],mat('#3a505b'));box(room,[2.7,.07,.1],[x,13,-24.4],new T.MeshStandardMaterial({color:'#d5f1fa',emissive:'#9dd9ef',emissiveIntensity:2}));}
const platform=new T.Mesh(new T.CylinderGeometry(4.7,4.9,.12,80),mat('#263940',.5,.55));platform.position.y=-.09;platform.receiveShadow=true;workshopDeck.add(platform);
const ring=new T.Mesh(new T.TorusGeometry(4.65,.025,6,100),mat('#e0ab62'));ring.rotation.x=Math.PI/2;ring.position.y=-.02;workshopDeck.add(ring);
for(let i=0;i<32;i++){const t=i*Math.PI/16;const m=box(workshopDeck,[.08,.015,.3],[4.35*Math.cos(t),-.015,4.35*Math.sin(t)],mat('#73878b'));m.rotation.y=-t+Math.PI/2;}
built={room,workshopDeck,workshopGround,grid};}
function workshopBay(){if(!built)throw Error('作業場がまだ作られていません');return built;}
export function updateWorkshop(){const {bay,camera,controls,craftRoot,scene}=sceneCore(),bayParts=workshopBay(),{room,workshopDeck,workshopGround}=bayParts;if(state.flight)return;const bounds=new T.Box3().setFromObject(craftRoot),layout=workshopLayout(bounds,camera.fov,camera.aspect);bay.position.fromArray(layout.origin);state.workshopFloor=layout.origin[1];room.scale.fromArray(layout.roomScale);workshopDeck.scale.set(layout.platformScale,1,layout.platformScale);workshopGround.scale.set((layout.gridSize+10)/90,1,(layout.gridSize+10)/90);if(state.workshopGridSize!==layout.gridSize){bayParts.grid.removeFromParent();bayParts.grid.geometry.dispose();for(const material of Array.isArray(bayParts.grid.material)?bayParts.grid.material:[bayParts.grid.material])material.dispose();state.workshopGridSize=layout.gridSize;const step=Math.max(1,Math.ceil(state.workshopGridSize/200));bayParts.grid=new T.GridHelper(state.workshopGridSize,Math.ceil(state.workshopGridSize/step),'#647984','#435963');bayParts.grid.position.y=-.16;bay.add(bayParts.grid);}const fit=workshopFrame(bounds,camera.fov,camera.aspect);if(fit){controls.maxDistance=fit.maxDistance;scene.fog=new T.Fog('#293c49',fit.fogNear,fit.fogFar);}}
