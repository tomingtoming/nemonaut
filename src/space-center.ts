import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {CENTER_FACILITIES} from './center-facilities.js';
export type CenterFacilityId=keyof typeof CENTER_FACILITIES;
const isFacilityId=(id:unknown):id is CenterFacilityId=>typeof id==='string'&&id in CENTER_FACILITIES;
export class SpaceCenter {
 declare camera:T.PerspectiveCamera;declare canvas:HTMLCanvasElement;declare controls:OrbitControls;declare facilities:Map<string|null,T.Object3D>;declare focused:string|null;declare highlighted:string|null;declare hovered:string|null;declare model:T.Group|null;declare onHighlight:(id:string|null)=>void;declare onSelect:(id:string)=>void;declare pointer:T.Vector2;declare ray:T.Raycaster;declare renderer:T.WebGLRenderer;declare scene:T.Scene;declare selection:T.Box3Helper;
 constructor(canvas:HTMLCanvasElement,onSelect:(id:string)=>void,onHighlight:(id:string|null)=>void=()=>{}){
  this.onHighlight=onHighlight;this.hovered=null;this.focused=null;this.highlighted=null;this.facilities=new Map<string|null,T.Object3D>();
  this.canvas=canvas;this.onSelect=onSelect;this.renderer=new T.WebGLRenderer({canvas,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.scene=new T.Scene();this.scene.background=new T.Color('#98bfc7');this.scene.fog=new T.Fog('#98bfc7',750,1700);this.camera=new T.PerspectiveCamera(41,1,1,2500);this.camera.position.set(290,260,360);this.camera.lookAt(-20,8,25);
  this.controls=new OrbitControls(this.camera,canvas);this.controls.target.set(-20,8,25);this.controls.enablePan=false;this.controls.minDistance=180;this.controls.maxDistance=800;this.controls.minPolarAngle=.2;this.controls.maxPolarAngle=1.25;this.controls.update();canvas.title='施設をクリック · ドラッグで視点回転 · ホイールで拡大縮小';
  this.scene.add(new T.HemisphereLight('#e8f2f1','#52643f',1.5));const sun=new T.DirectionalLight('#ffe4b6',3);sun.position.set(-150,250,150);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-300,right:300,top:300,bottom:-300,near:1,far:700});sun.shadow.bias=-.001;sun.shadow.normalBias=.2;this.scene.add(sun);
  this.ray=new T.Raycaster();this.pointer=new T.Vector2();this.model=null;this.selection=new T.Box3Helper(new T.Box3(),0xffb16c);this.selection.visible=false;this.scene.add(this.selection);
  let origin:[number,number]|null=null,dragged=false;canvas.addEventListener('pointerdown',e=>{origin=[e.clientX,e.clientY];dragged=false;});
  canvas.addEventListener('pointermove',e=>{if(origin&&e.buttons&&Math.hypot(e.clientX-origin[0],e.clientY-origin[1])>5)dragged=true;const facility=this.hit(e);canvas.style.cursor=facility?'pointer':'grab';this.pointFacility(facility?.userData.facility||null);});canvas.addEventListener('pointerleave',()=>this.pointFacility(null));canvas.addEventListener('click',e=>{if(dragged)return;const facility=this.hit(e);if(facility)onSelect(facility.userData.facility);});
  canvas.addEventListener('focus',()=>this.focusFacility(this.focused||'vab'));canvas.addEventListener('blur',()=>this.focusFacility(null));
  canvas.addEventListener('keydown',e=>{const ids=Object.keys(CENTER_FACILITIES);if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();const current=Math.max(0,this.highlighted===null?-1:ids.indexOf(this.highlighted));let next=e.key==='Home'?0:e.key==='End'?ids.length-1:(current+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+ids.length)%ids.length;this.hovered=null;this.focusFacility(ids[next]);}else if(['Enter',' '].includes(e.key)){e.preventDefault();if(!e.repeat&&this.highlighted)onSelect(this.highlighted);}});
  if(document.activeElement===canvas)this.focusFacility('vab');
  new ResizeObserver(()=>this.resize()).observe(canvas);
 }
 async load(){const gltf=await new GLTFLoader().loadAsync('./assets/scenery/space-center.glb');this.model=gltf.scene;this.model.traverse(o=>{const facility:unknown=o.userData.facility;if(isFacilityId(facility))this.facilities.set(facility,o);if('isMesh' in o&&o.isMesh){o.castShadow=!/ocean|grass|shoreline|vegetation|meadow/i.test(o.name);o.receiveShadow=!/ocean/i.test(o.name);}});this.scene.add(this.model);this.refreshHighlight();this.resize();}
 pointFacility(id:string|null){this.hovered=isFacilityId(id)?id:null;this.refreshHighlight();}
 focusFacility(id:string|null){this.focused=isFacilityId(id)?id:null;this.refreshHighlight();}
 refreshHighlight(){const id=this.hovered||this.focused,object=this.facilities.get(id);this.selection.visible=!!object;if(object)this.selection.box.setFromObject(object);if(id!==this.highlighted){this.highlighted=id;this.onHighlight(id);}}
 hit(event:MouseEvent):T.Object3D|null{if(!this.model)return null;const rect=this.canvas.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);const hit=this.ray.intersectObject(this.model,true)[0];for(let o:T.Object3D|null|undefined=hit?.object;o;o=o.parent)if(o.userData.facility)return o;return null;}
 resize(){const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 render(){this.renderer.render(this.scene,this.camera);}
}
