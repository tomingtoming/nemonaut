import {mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
await mkdir('dist/vendor',{recursive:true});
for(const file of ['three.module.js','three.core.js']){await mkdir('dist/vendor/three',{recursive:true});await cp('node_modules/three/build/'+file,'dist/vendor/three/'+file);}
for(const file of ['controls/OrbitControls.js','controls/TransformControls.js','loaders/GLTFLoader.js','environments/RoomEnvironment.js','utils/BufferGeometryUtils.js']){const dest='dist/vendor/addons/'+file;await mkdir(path.dirname(dest),{recursive:true});await cp('node_modules/three/examples/jsm/'+file,dest);}
await cp('node_modules/three/LICENSE','dist/vendor/THREE-LICENSE.txt');
await mkdir('dist/vendor/rapier',{recursive:true});
await cp('node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs','dist/vendor/rapier/rapier.mjs');
await cp('node_modules/@dimforge/rapier3d-compat/LICENSE','dist/vendor/rapier/LICENSE.txt');
