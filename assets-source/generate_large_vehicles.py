"""Large modular vehicle family. Run in an isolated Blender background process.
Uses our original detailed GLBs; bakes dimensions into editable meshes in meters.
No modifications to the source parts or an interactive Blender scene.
"""
import bpy,json
from pathlib import Path
from mathutils import Matrix
ROOT=Path(__file__).resolve().parent.parent
spec=json.loads((ROOT/'assets-source/large-parts-spec.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for ident,item in spec.items():
 bpy.ops.object.select_all(action='DESELECT')
 before=set(bpy.data.objects)
 bpy.ops.import_scene.gltf(filepath=str(ROOT/'dist/assets/parts'/f"{item['source']}.glb"))
 imported=set(bpy.data.objects)-before
 meshes=[o for o in imported if o.type=='MESH']
 bpy.context.view_layer.update()
 for o in meshes:
  transform=Matrix.Scale(item['scale'],4) @ o.matrix_world.copy()
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
 bpy.ops.export_scene.gltf(filepath=str(ROOT/'dist/assets/parts'/f'{ident}.glb'),export_format='GLB',use_selection=True,export_yup=True)
 # Keep exported node name unique before processing another asset.
 obj.name=ident
bpy.context.scene.unit_settings.system='METRIC'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets-source/large-vehicles.blend'))
