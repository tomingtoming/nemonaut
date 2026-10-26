import * as T from 'three';
import {PLANET,center} from './planet.js';
import {SUN_DIRECTION,inEclipse} from './power.js';
import {surfaceOrientation} from './surface-frame.js';

const noise=`
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float terrain(vec3 p){return .55*noise(p)+.27*noise(p*2.03)+.12*noise(p*4.07)+.06*noise(p*8.11);}
`;
// Surface colour only: physics remains the existing smooth sphere. No painted
// oceans in land mode, or visual mountains that falsely promise collisions.
export function surfaceMaterial(water=false){
 const material=new T.MeshStandardMaterial({color:0xffffff,roughness:water?.38:1,metalness:water?.12:0,envMapIntensity:.15,side:water?T.DoubleSide:T.FrontSide});
 const rotation={value:new T.Matrix3()},time={value:0};material.userData.rotation=rotation;material.userData.time=time;
 material.onBeforeCompile=shader=>{
  shader.uniforms.surfaceRotation=rotation;shader.uniforms.surfaceTime=time;
  shader.vertexShader='varying vec3 terrainWorld;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nterrainWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader='varying vec3 terrainWorld; uniform mat3 surfaceRotation; uniform float surfaceTime;\n'+noise+shader.fragmentShader;
  const colors=water?'vec3 base=mix(vec3(.014,.07,.12),vec3(.035,.20,.26),n);':'vec3 base=mix(vec3(.095,.145,.07),vec3(.38,.32,.18),smoothstep(.35,.72,n));base=mix(base,vec3(.63,.67,.63),smoothstep(.83,.97,abs(p.x)));';
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 p=normalize(surfaceRotation*(terrainWorld-vec3(0.,-${PLANET.radius.toFixed(1)},0.)));
   float n=terrain(p*32.);${colors}
   float detail=terrain(p*1800.);diffuseColor.rgb*=base*(.78+.44*detail);`);
  if(!water){
   // Body-fixed metre coordinates: detail stays on the terrain as the camera
   // moves and the planet rotates. Fade subpixel grains to avoid distant shimmer.
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec3 groundCoord=surfaceRotation*(terrainWorld-vec3(0.,-${PLANET.radius.toFixed(1)},0.));
    float footprint=max(length(dFdx(groundCoord)),length(dFdy(groundCoord)));
    float patchFade=1.-smoothstep(3.,14.,footprint);
    float grainFade=1.-smoothstep(.12,.7,footprint);
    float patches=noise(groundCoord*.11);
    float grains=noise(groundCoord*1.7);
    float mottling=mix(.72,1.22,smoothstep(.23,.77,patches));
    diffuseColor.rgb*=mix(1.,mottling,patchFade)*mix(1.,.82+.36*grains,grainFade);
   `);
  }
  if(water){
   shader.vertexShader='varying vec2 waterCoord; uniform mat3 surfaceRotation;\n'+shader.vertexShader.replace('terrainWorld=(modelMatrix*vec4(transformed,1.)).xyz;','terrainWorld=(modelMatrix*vec4(transformed,1.)).xyz;waterCoord=(surfaceRotation*(terrainWorld-vec3(0.,-600000.,0.))).zx;');
   shader.fragmentShader='varying vec2 waterCoord;\n'+shader.fragmentShader;
   // Metre-scale shading gives motion cues without moving the physical sea level.
   shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
    vec2 waterUV=waterCoord;
    float nearWater=1.-smoothstep(300.,1800.,length(vViewPosition));
    float wave=.075*sin(dot(waterUV,vec2(.8,.35))-surfaceTime*1.3)
              +.04*sin(dot(waterUV,vec2(-1.2,.9))+surfaceTime*1.7)
              +.018*sin(dot(waterUV,vec2(2.6,1.7))-surfaceTime*2.1);
    vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
    vec3 rx=cross(dy,normal),ry=cross(normal,dx);float det=dot(dx,rx);
    normal=normalize(abs(det)*normal-sign(det)*(dFdx(wave)*rx+dFdy(wave)*ry)*nearWater);
   `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    roughnessFactor=.35;
   `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float ripple=sin(dot(waterCoord,vec2(.8,.35))-surfaceTime*1.3)*sin(dot(waterCoord,vec2(-1.2,.9))+surfaceTime*1.7);
    float closeWater=1.-smoothstep(300.,1800.,length(vViewPosition));
    diffuseColor.rgb*=1.+.45*ripple*closeWater;
   `);
  }
 };material.customProgramCacheKey=()=>water?'water-surface-v2':'land-surface-v1';return material;
}

export class FlightScenery{
 constructor(group){
  const planetarySun=new T.DirectionalLight(0xfff0d8,2.4);planetarySun.layers.set(1);planetarySun.position.copy(center).addScaledVector(SUN_DIRECTION,1000000);planetarySun.target.position.copy(center);group.add(planetarySun,planetarySun.target);
  const starlight=new T.AmbientLight(0x8ca5cc,.08);starlight.layers.set(1);group.add(starlight);
  this.waterFog=new T.FogExp2('#073a49',.035);
  const uniforms={waterDepth:{value:0},sunDir:{value:SUN_DIRECTION.clone()},up:{value:new T.Vector3(0,1,0)},air:{value:1},day:{value:1}};
  this.uniforms=uniforms;
  const material=new T.ShaderMaterial({side:T.BackSide,depthTest:false,depthWrite:false,uniforms,
   vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec3 direction;uniform vec3 sunDir,up;uniform float air,day,waterDepth;
    void main(){vec3 d=normalize(direction);float h=max(0.,dot(d,up));float s=max(0.,dot(d,sunDir));
    vec3 sky=mix(vec3(.36,.57,.75),vec3(.035,.18,.44),pow(h,.35));
    sky*=mix(.018,1.,day);sky+=vec3(.65,.22,.055)*pow(1.-h,5.)*(1.-abs(day*2.-1.))*.6;
    vec3 color=mix(vec3(.0006,.001,.003),sky,air);
    float disk=smoothstep(.99994,.99997,s);float halo=pow(s,350.)*.15+pow(s,35.)*.025;
    color+=vec3(1.,.88,.64)*(disk*5.+halo)*(1.-air*.25);
    if(waterDepth>0.)color=vec3(.027,.14,.18)*mix(.35,1.,day)*exp(-waterDepth/120.);
    gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`});
  this.sky=new T.Mesh(new T.SphereGeometry(10000000,48,24),material);this.sky.frustumCulled=false;this.sky.renderOrder=-1000;group.add(this.sky);
  let seed=87231;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const positions=[],colors=[];for(let i=0;i<2800;i++){const y=random()*2-1,a=random()*Math.PI*2,r=Math.sqrt(1-y*y),b=.25+random()*.75;positions.push(Math.cos(a)*r*9000000,y*9000000,Math.sin(a)*r*9000000);colors.push(b,b*(.82+random()*.18),b*(.7+random()*.3));}
  const starsGeometry=new T.BufferGeometry();starsGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));starsGeometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const starsMaterial=new T.PointsMaterial({size:1.5,sizeAttenuation:false,vertexColors:true,transparent:true,depthTest:true,depthWrite:false,toneMapped:false});
  // Transparent stars render after opaque surfaces. Treat their depth as infinity
  // so terrain, vessels and even bodies beyond the star sphere occlude them.
  starsMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <logdepthbuf_fragment>','#include <logdepthbuf_fragment>\n gl_FragDepth=1.0;');};
  starsMaterial.customProgramCacheKey=()=> 'stars-infinite-depth-v1';
  this.stars=new T.Points(starsGeometry,starsMaterial);this.stars.frustumCulled=false;this.stars.renderOrder=-999;group.add(this.stars);
  const shell=new T.ShaderMaterial({side:T.BackSide,transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{sunDir:uniforms.sunDir},
   vertexShader:`varying vec3 normalWorld;varying vec3 worldPos;
#include <common>
#include <logdepthbuf_pars_vertex>
    void main(){normalWorld=normalize(mat3(modelMatrix)*normal);worldPos=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
    #include <logdepthbuf_vertex>
   }`,
   fragmentShader:`varying vec3 normalWorld;varying vec3 worldPos;uniform vec3 sunDir;
    #include <logdepthbuf_pars_fragment>
    void main(){
    #include <logdepthbuf_fragment>
    vec3 n=normalize(normalWorld),v=normalize(cameraPosition-worldPos);float rim=pow(1.-abs(dot(n,v)),5.);float day=smoothstep(-.25,.35,dot(n,sunDir));vec3 c=cameraPosition-vec3(0.,-600000.,0.);vec3 ray=normalize(worldPos-cameraPosition);float impact=length(c-ray*dot(c,ray));float column=smoothstep(0.,.85,clamp((612000.-impact)/12000.,0.,1.));gl_FragColor=vec4(vec3(.12,.38,.9),rim*column*day*.65);}`});
  // Keep shader directives at line starts for WebGL implementations.
  shell.vertexShader=shell.vertexShader.replace(';#include',';\n#include');
  this.shell=new T.Mesh(new T.SphereGeometry(PLANET.radius+12000,128,64),shell);this.shell.position.copy(center);group.add(this.shell);
 }
 update(camera,time,light,ambient,materials,water=false){
  const radial=camera.position.clone().sub(center),alt=radial.length()-PLANET.radius,up=radial.normalize();
  const depth=water?Math.max(0,-alt):0;this.uniforms.waterDepth.value=depth;this.shell.visible=depth===0;
  const day=T.MathUtils.smoothstep(up.dot(SUN_DIRECTION),-.16,.18),air=Math.exp(-Math.max(0,alt)/16000);
  this.uniforms.up.value.copy(up);this.uniforms.air.value=air;this.uniforms.day.value=day;
  this.sky.position.copy(camera.position);this.stars.position.copy(camera.position);this.stars.material.opacity=depth>0?0:1-air*day;
  const attenuation=Math.exp(-depth/40);light.intensity=inEclipse(camera.position,time)?0:2.4*attenuation;ambient.intensity=(.12+.55*air*day)*Math.max(.08,attenuation);
  this.waterFog.color.setRGB(.027,.14,.18).multiplyScalar((.35+.65*day)*Math.exp(-depth/120));
  const inverse=new T.Matrix3().setFromMatrix4(new T.Matrix4().makeRotationFromQuaternion(surfaceOrientation(time).invert()));
  for(const m of materials){m?.userData.rotation?.value.copy(inverse);if(m?.userData.time)m.userData.time.value=time%(Math.PI*20);}
  return depth>0?this.waterFog:null;
 }
}
