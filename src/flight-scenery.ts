import * as T from 'three';
import {PLANET, center} from './planet.js';
import {SUN_DIRECTION, inEclipse} from './power.js';
import {overWater, seaCenter, seaRadius, surfaceOrientation} from './surface-frame.js';

const noise = `
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float terrain(vec3 p){return .55*noise(p)+.27*noise(p*2.03)+.12*noise(p*4.07)+.06*noise(p*8.11);}
`;
export function surfaceMaterial() {
  const material = new T.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    envMapIntensity: 0.15,
    side: T.DoubleSide
  });
  const rotation = {value: new T.Matrix3()},
    time = {value: 0};
  material.userData.rotation = rotation;
  material.userData.time = time;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      surfaceRotation: rotation,
      surfaceTime: time,
      seaCenter: {value: seaCenter},
      seaChord: {value: 2 * Math.sin(seaRadius / (2 * PLANET.radius))}
    });
    shader.vertexShader =
      'varying vec3 terrainWorld;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nterrainWorld=(modelMatrix*vec4(transformed,1.)).xyz;'
      );
    shader.fragmentShader =
      'varying vec3 terrainWorld; uniform mat3 surfaceRotation; uniform float surfaceTime; uniform vec3 seaCenter; uniform float seaChord;\n' +
      noise +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec3 coords=surfaceRotation*(terrainWorld-vec3(0.,-${PLANET.radius.toFixed(1)},0.));
      vec3 p=normalize(coords);
      float shore=length(p-seaCenter)-seaChord;
      float edge=max(fwidth(shore),1e-8);
      float wet=1.-smoothstep(-edge,edge,shore);
      float n=terrain(p*32.);
      vec3 land=mix(vec3(.095,.145,.07),vec3(.38,.32,.18),smoothstep(.35,.72,n));
      land=mix(land,vec3(.63,.67,.63),smoothstep(.83,.97,abs(p.x)));
      float footprint=max(length(dFdx(coords)),length(dFdy(coords)));
      land*=mix(1.,mix(.72,1.22,smoothstep(.23,.77,noise(coords*.11))),1.-smoothstep(3.,14.,footprint));
      land*=mix(1.,.82+.36*noise(coords*1.7),1.-smoothstep(.12,.7,footprint));
      vec2 uv=coords.zx;
      float closeWater=1.-smoothstep(300.,1800.,length(vViewPosition));
      float a=dot(uv,vec2(.8,.35))-surfaceTime*1.3,b=dot(uv,vec2(-1.2,.9))+surfaceTime*1.7;
      vec3 water=mix(vec3(.014,.07,.12),vec3(.035,.20,.26),n)*(1.+.45*sin(a)*sin(b)*closeWater);
      diffuseColor.rgb*=mix(land,water,wet)*(.78+.44*terrain(p*1800.));
    `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.38,wet);'
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.12,wet);'
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
      float wave=.075*sin(a)+.04*sin(b)+.018*sin(dot(uv,vec2(2.6,1.7))-surfaceTime*2.1);
      vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
      vec3 rx=cross(dy,normal),ry=cross(normal,dx);float det=dot(dx,rx);
      normal=normalize(normal-sign(det)*(dFdx(wave)*rx+dFdy(wave)*ry)/max(abs(det),1e-10)*closeWater*wet);
    `
      );
  };
  return material;
}

/** Sky dome shader uniforms shared with the atmosphere shell. */
export interface SkyUniforms {
  waterDepth: T.IUniform<number>;
  sunDir: T.IUniform<T.Vector3>;
  up: T.IUniform<T.Vector3>;
  air: T.IUniform<number>;
  day: T.IUniform<number>;
}
export class FlightScenery {
  declare shell: T.Mesh<T.SphereGeometry, T.ShaderMaterial>;
  declare sky: T.Mesh<T.SphereGeometry, T.ShaderMaterial>;
  declare stars: T.Points<T.BufferGeometry, T.PointsMaterial>;
  declare uniforms: SkyUniforms;
  declare waterFog: T.FogExp2;
  constructor(group: T.Object3D) {
    const planetarySun = new T.DirectionalLight(0xfff0d8, 2.4);
    planetarySun.layers.set(1);
    planetarySun.position.copy(center).addScaledVector(SUN_DIRECTION, 1000000);
    planetarySun.target.position.copy(center);
    group.add(planetarySun, planetarySun.target);
    const starlight = new T.AmbientLight(0x8ca5cc, 0.08);
    starlight.layers.set(1);
    group.add(starlight);
    this.waterFog = new T.FogExp2('#073a49', 0.012);
    const uniforms = {
      waterDepth: {value: 0},
      sunDir: {value: SUN_DIRECTION.clone()},
      up: {value: new T.Vector3(0, 1, 0)},
      air: {value: 1},
      day: {value: 1}
    };
    this.uniforms = uniforms;
    const material = new T.ShaderMaterial({
      side: T.BackSide,
      depthTest: false,
      depthWrite: false,
      uniforms,
      vertexShader:
        'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 direction;uniform vec3 sunDir,up;uniform float air,day,waterDepth;
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
   }`
    });
    this.sky = new T.Mesh(new T.SphereGeometry(10000000, 48, 24), material);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    group.add(this.sky);
    let seed = 87231;
    const random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const positions = [],
      colors = [];
    for (let i = 0; i < 2800; i++) {
      const y = random() * 2 - 1,
        a = random() * Math.PI * 2,
        r = Math.sqrt(1 - y * y),
        b = 0.25 + random() * 0.75;
      positions.push(Math.cos(a) * r * 9000000, y * 9000000, Math.sin(a) * r * 9000000);
      colors.push(b, b * (0.82 + random() * 0.18), b * (0.7 + random() * 0.3));
    }
    const starsGeometry = new T.BufferGeometry();
    starsGeometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    starsGeometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    const starsMaterial = new T.PointsMaterial({
      size: 1.5,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false
    });
    // Transparent stars render after opaque surfaces. Treat their depth as infinity
    // so terrain, vessels and even bodies beyond the star sphere occlude them.
    starsMaterial.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <logdepthbuf_fragment>',
        '#include <logdepthbuf_fragment>\n gl_FragDepth=1.0;'
      );
    };
    starsMaterial.customProgramCacheKey = () => 'stars-infinite-depth-v1';
    this.stars = new T.Points(starsGeometry, starsMaterial);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -999;
    group.add(this.stars);
    const shell = new T.ShaderMaterial({
      side: T.BackSide,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      uniforms: {sunDir: uniforms.sunDir},
      vertexShader: `varying vec3 normalWorld;varying vec3 worldPos;
#include <common>
#include <logdepthbuf_pars_vertex>
    void main(){normalWorld=normalize(mat3(modelMatrix)*normal);worldPos=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
    #include <logdepthbuf_vertex>
   }`,
      fragmentShader: `varying vec3 normalWorld;varying vec3 worldPos;uniform vec3 sunDir;
    #include <logdepthbuf_pars_fragment>
    void main(){
    #include <logdepthbuf_fragment>
    vec3 n=normalize(normalWorld),v=normalize(cameraPosition-worldPos);float rim=pow(1.-abs(dot(n,v)),5.);float day=smoothstep(-.25,.35,dot(n,sunDir));vec3 c=cameraPosition-vec3(0.,-600000.,0.);vec3 ray=normalize(worldPos-cameraPosition);float impact=length(c-ray*dot(c,ray));float column=smoothstep(0.,.85,clamp((612000.-impact)/12000.,0.,1.));gl_FragColor=vec4(vec3(.12,.38,.9),rim*column*day*.65);}`
    });
    this.shell = new T.Mesh(new T.SphereGeometry(PLANET.radius + 12000, 128, 64), shell);
    this.shell.position.copy(center);
    group.add(this.shell);
  }
  update(
    camera: T.Camera,
    time: number,
    light: T.Light,
    ambient: T.Light,
    materials: Iterable<T.Material | null | undefined>
  ): T.FogExp2 | null {
    const radial = camera.position.clone().sub(center),
      alt = radial.length() - PLANET.radius,
      up = radial.normalize();
    const depth = alt < 0 && overWater(camera.position, time) ? -alt : 0;
    this.uniforms.waterDepth.value = depth;
    this.shell.visible = depth === 0;
    const day = T.MathUtils.smoothstep(up.dot(SUN_DIRECTION), -0.16, 0.18),
      air = Math.exp(-Math.max(0, alt) / 16000);
    this.uniforms.up.value.copy(up);
    this.uniforms.air.value = air;
    this.uniforms.day.value = day;
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.stars.material.opacity = depth > 0 ? 0 : 1 - air * day;
    const attenuation = Math.exp(-depth / 40);
    light.intensity = inEclipse(camera.position, time) ? 0 : 2.4 * attenuation;
    ambient.intensity = (0.12 + 0.55 * air * day) * Math.max(0.08, attenuation);
    this.waterFog.color
      .setRGB(0.027, 0.14, 0.18)
      .multiplyScalar((0.35 + 0.65 * day) * Math.exp(-depth / 120));
    const inverse = new T.Matrix3().setFromMatrix4(
      new T.Matrix4().makeRotationFromQuaternion(surfaceOrientation(time).invert())
    );
    for (const m of materials) {
      m?.userData.rotation?.value.copy(inverse);
      if (m?.userData.time) m.userData.time.value = time % (Math.PI * 20);
    }
    return depth > 0 ? this.waterFog : null;
  }
}
