import {mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
await mkdir('src/vendor',{recursive:true});
for(const file of ['three.module.js','three.core.js']){await mkdir('src/vendor/three',{recursive:true});await cp('node_modules/three/build/'+file,'src/vendor/three/'+file);}
for(const file of ['controls/OrbitControls.js','controls/TransformControls.js','loaders/GLTFLoader.js','environments/RoomEnvironment.js','utils/BufferGeometryUtils.js']){const dest='src/vendor/addons/'+file;await mkdir(path.dirname(dest),{recursive:true});await cp('node_modules/three/examples/jsm/'+file,dest);}
await cp('node_modules/three/LICENSE','src/vendor/THREE-LICENSE.txt');
