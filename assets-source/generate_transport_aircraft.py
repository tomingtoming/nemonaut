"""Large modular vehicle family. Run in an isolated Blender background process.
Uses our original detailed GLBs; bakes dimensions into editable meshes in meters.
No modifications to the source parts or an interactive Blender scene.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Matrix
ROOT=Path(__file__).resolve().parent.parent
spec=json.loads((ROOT/'assets-source/transport-parts-spec.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for ident,item in spec.items():
 bpy.ops.object.select_all(action='DESELECT')
 before=set(bpy.data.objects)
 bpy.ops.import_scene.gltf(filepath=str(ROOT/'src/assets/parts'/f"{item['source']}.glb"))
 imported=set(bpy.data.objects)-before
 meshes=[o for o in imported if o.type=='MESH']
 if ident in ['transportWingRoot','enginePylon']:
  materials=[m for o in meshes for m in o.data.materials if m]
  for o in imported:bpy.data.objects.remove(o,do_unlink=True)
  if ident=='transportWingRoot':
   # Full-chord modular inner wing; equal root/tip sections mate without gaps.
   vs=[];fs=[];N=33
   for x in [-7,-3.5,0,3.5,7]:
    for side in [1,-1]:
     for i in range(N):
      t=(1-math.cos(math.pi*i/(N-1)))/2
      thick=(.2969*math.sqrt(t)-.126*t-.3516*t*t+.2843*t**3-.1036*t**4)
      vs.append((x,-side*thick,5.6-11.2*t))
   maxth=max(abs(v[1]) for v in vs)
   vs=[(x,y*.42/maxth,z) for x,y,z in vs]
   for j in range(4):
    for side in range(2):
     for i in range(N-1):
      a=j*N*2+side*N+i;b=a+N*2
      fs.append((a,b,b+1,a+1) if side==0 else (a,a+1,b+1,b))
   for j in [0,4]:fs.append(tuple(j*N*2+i for i in list(range(N))+list(range(2*N-1,N-1,-1))))
   me=bpy.data.meshes.new('Continuous inner airfoil');me.from_pydata(vs,[],fs);me.update()
   obj=bpy.data.objects.new(ident,me);bpy.context.collection.objects.link(obj)
   white=next((m for m in materials if 'white' in m.name.lower()),materials[0]);me.materials.append(white)
   for face in me.polygons:face.use_smooth=len(face.vertices)==4
  else:
   bpy.ops.mesh.primitive_cube_add(size=1)
   obj=bpy.context.object;obj.scale=(1.5,1.5,1.5)
   bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
   obj.data.materials.append(next((m for m in materials if 'white' in m.name.lower()),materials[0]))
   mod=obj.modifiers.new('Rounded structural pylon','BEVEL');mod.width=.12;mod.segments=4
   bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
  imported={obj};meshes=[obj]

 bpy.context.view_layer.update()
 for o in meshes:
  transform=Matrix.Scale(1 if ident in ['transportWingRoot','enginePylon'] else item['scale'],4) @ o.matrix_world.copy()
  o.data=o.data.copy()
  o.data.transform(transform)
  o.parent=None;o.matrix_world=Matrix.Identity(4)
 for o in imported:
  if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
 collection=bpy.data.collections.new(ident)
 bpy.context.scene.collection.children.link(collection)
 for o in meshes:
  for c in list(o.users_collection):c.objects.unlink(o)
  collection.objects.link(o)
  o.name=ident+'.'+o.name
  o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0]
 bpy.ops.object.join()
 obj=bpy.context.object
 obj.name='GimbalNozzle' if ident=='propellerLarge' else ident
 bpy.ops.export_scene.gltf(filepath=str(ROOT/'src/assets/parts'/f'{ident}.glb'),export_format='GLB',use_selection=True,export_yup=True)
 # Keep exported node name unique before processing another asset.
 obj.name=ident
bpy.context.scene.unit_settings.system='METRIC'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets-source/transport-aircraft.blend'))

