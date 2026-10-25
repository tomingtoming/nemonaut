// Own only temporary material clones. Blender assets can share their source
// materials across many parts and across workshop/flight scenes.
export function mountStageVisibility(getObjects){
 let entries=[],signature=null,previousObjects=[];
 function restore(){for(const {mesh,original,temporary,shadow} of entries){mesh.material=original;mesh.castShadow=shadow;for(const m of temporary)m.dispose();}entries=[];}
 function update(ids){
  const objects=[...getObjects().entries()],next=ids?JSON.stringify([...ids].sort()):null;
  if(next===signature&&objects.length===previousObjects.length&&objects.every(([id,o],i)=>id===previousObjects[i][0]&&o===previousObjects[i][1]))return;
  restore();signature=next;previousObjects=objects;if(!ids)return;
  const retained=new Set(ids);
  for(const [id,object]of objects)object.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.material||mesh.userData.stageDiagnosticIgnore)return;
   const original=mesh.material,shadow=mesh.castShadow,temporary=[original].flat().map(source=>{
    const m=source.clone();
    if(retained.has(id)){m.color?.lerp({r:.12,g:1,b:.5},.3);if(m.emissive){m.emissive.setRGB(.02,.18,.08);m.emissiveIntensity=Math.max(source.emissiveIntensity||0,.7);}}
    else{m.transparent=true;m.opacity=Math.min(source.opacity,.12);m.depthWrite=false;}
    return m;
   });
   mesh.material=Array.isArray(original)?temporary:temporary[0];if(!retained.has(id))mesh.castShadow=false;
   entries.push({mesh,original,temporary,shadow});
  });
 }
 return {update,dispose(){restore();signature=null;previousObjects=[];}};
}
