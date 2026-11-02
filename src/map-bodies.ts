import * as T from 'three';
import {PLANET,center} from './planet.js';
import {SUN_DIRECTION} from './power.js';
import {surfaceOrientation} from './surface-frame.js';
import {surfaceMaterial} from './flight-scenery.js';

// Inverse of projectTrackingPoint: screen right/up/toward camera to inertial.
export function mapViewVector(x:number,y:number,z:number,yaw:number,pitch:number):T.Vector3{
 const yy=Math.cos(pitch)*y+Math.sin(pitch)*z,zz=-Math.sin(pitch)*y+Math.cos(pitch)*z;
 return new T.Vector3(Math.cos(yaw)*x-Math.sin(yaw)*zz,yy,Math.sin(yaw)*x+Math.cos(yaw)*zz);
}
export type MapBodyKind='moon'|'water'|'land';
export interface MapBodyImage{canvas:HTMLCanvasElement;key:string|null}
// One small reusable WebGL context; the map's lines and picking remain Canvas.
// Surface colours reuse the flight material, not an independent fictional map.
export class MapBodies{
 declare cache:Map<MapBodyKind,MapBodyImage>;declare camera:T.OrthographicCamera;declare materials:Record<MapBodyKind,T.MeshStandardMaterial>;declare mesh:T.Mesh<T.SphereGeometry,T.MeshStandardMaterial>;declare renderer:T.WebGLRenderer;declare scene:T.Scene;
 constructor(){
  this.renderer=new T.WebGLRenderer({alpha:true,antialias:true});this.renderer.setSize(512,512);this.renderer.setClearColor(0,0);
  this.renderer.outputColorSpace=T.SRGBColorSpace;this.scene=new T.Scene();
  const r=PLANET.radius;this.camera=new T.OrthographicCamera(-r,r,r,-r,r*.1,r*6);
  this.materials={land:surfaceMaterial(false),water:surfaceMaterial(true),moon:new T.MeshStandardMaterial({color:0x999b9e,roughness:1})};
  this.mesh=new T.Mesh(new T.SphereGeometry(r,96,64),this.materials.land);this.mesh.position.copy(center);this.scene.add(this.mesh);
  const sun=new T.DirectionalLight(0xfff0d8,2.4);sun.position.copy(center).addScaledVector(SUN_DIRECTION,r*3);sun.target.position.copy(center);this.scene.add(sun,sun.target,new T.AmbientLight(0x8ca5cc,.08));
  this.cache=new Map();
 }
 image(body:Pick<import('./celestial.js').CelestialBody,'id'>,yaw:number,pitch:number,time:number,water=false):HTMLCanvasElement{
  const kind:MapBodyKind=body.id==='moon'?'moon':water?'water':'land',tick=Math.floor(time/10),key=[yaw,pitch,tick,kind].join(':');let entry=this.cache.get(kind);
  if(entry?.key===key)return entry.canvas;
  if(!entry){const canvas=document.createElement('canvas');canvas.width=canvas.height=512;entry={canvas,key:null};this.cache.set(kind,entry);}
  this.mesh.material=this.materials[kind];
  this.mesh.material.userData.rotation?.value.setFromMatrix4(new T.Matrix4().makeRotationFromQuaternion(surfaceOrientation(tick*10).invert()));
  this.camera.position.copy(center).addScaledVector(mapViewVector(0,0,1,yaw,pitch),PLANET.radius*3);this.camera.up.copy(mapViewVector(0,1,0,yaw,pitch));this.camera.lookAt(center);this.camera.updateMatrixWorld();
  this.renderer.render(this.scene,this.camera);const ctx=entry.canvas.getContext('2d');if(!ctx)throw Error('2D描画を初期化できません');ctx.clearRect(0,0,512,512);ctx.drawImage(this.renderer.domElement,0,0);entry.key=key;return entry.canvas;
 }
}
