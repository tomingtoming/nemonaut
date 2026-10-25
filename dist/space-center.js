import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export class SpaceCenter {
 constructor(canvas,onSelect){
  this.canvas=canvas;this.onSelect=onSelect;this.renderer=new T.WebGLRenderer({canvas,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.scene=new T.Scene();this.scene.background=new T.Color('#98bfc7');this.scene.fog=new T.Fog('#98bfc7',750,1700);this.camera=new T.PerspectiveCamera(41,1,1,2500);this.camera.position.set(290,260,360);this.camera.lookAt(-20,8,25);
  this.scene.add(new T.HemisphereLight('#e8f2f1','#52643f',2));const sun=new T.DirectionalLight('#ffe4b6',3);sun.position.set(-150,250,150);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-260,right:260,top:260,bottom:-260,near:1,far:700});sun.shadow.bias=-.001;sun.shadow.normalBias=.2;this.scene.add(sun);
  this.ray=new T.Raycaster();this.pointer=new T.Vector2();this.model=null;this.selection=new T.Box3Helper(new T.Box3(),0xffb16c);this.selection.visible=false;this.scene.add(this.selection);
  canvas.addEventListener('pointermove',e=>{const facility=this.hit(e);canvas.style.cursor=facility?'pointer':'default';this.selection.visible=!!facility;if(facility)this.selection.box.setFromObject(facility);});canvas.addEventListener('pointerleave',()=>this.selection.visible=false);canvas.addEventListener('click',e=>{const facility=this.hit(e);if(facility)onSelect(facility.userData.facility);});
  new ResizeObserver(()=>this.resize()).observe(canvas);
 }
 async load(){const gltf=await new GLTFLoader().loadAsync('./assets/scenery/space-center.glb');this.model=gltf.scene;this.model.traverse(o=>{if(o.isMesh){let facility=false;for(let n=o;n;n=n.parent)if(n.userData.facility)facility=true;o.castShadow=facility;o.receiveShadow=o.name!=="Ocean";}});this.scene.add(this.model);this.resize();}
 hit(event){if(!this.model)return null;const rect=this.canvas.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);const hit=this.ray.intersectObject(this.model,true)[0];for(let o=hit?.object;o;o=o.parent)if(o.userData.facility)return o;return null;}
 resize(){const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 render(){this.renderer.render(this.scene,this.camera);}
}
