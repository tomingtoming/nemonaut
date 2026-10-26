import * as T from 'three';
// Keep the nozzle exit fixed while scaling the plume along its exhaust axis.
export function createEnginePlume(definition,gimballed=false){
 const length=definition.air?2:2.8,geometry=new T.ConeGeometry(.32,length,20,4);
 geometry.rotateZ(Math.PI);geometry.translate(0,-length/2,0);
 const position=geometry.attributes.position,colors=[];
 for(let i=0;i<position.count;i++){const t=Math.min(1,Math.max(0,-position.getY(i)/length)),color=new T.Color(definition.air?'#e5fbff':'#fff5cf').lerp(new T.Color(definition.air?'#399dff':'#ff7524'),t);colors.push(color.r,color.g,color.b);}
 geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.9,depthWrite:false,toneMapped:false}));
 mesh.position.y=-definition.size[1]/2-(gimballed?definition.gimbalPivot[1]:0);
 mesh.renderOrder=5;mesh.visible=false;return mesh;
}
