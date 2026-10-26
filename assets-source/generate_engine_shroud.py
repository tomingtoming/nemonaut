"""Open-ended unit-diameter, unit-height shroud; scaled to each engine at runtime."""
import bpy, math, os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,c,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.48;return m
white=mat('Ivory shroud panels',(.81,.82,.76),.15);metal=mat('Shroud flange aluminium',(.42,.48,.49),.7);dark=mat('Panel joints',(.13,.17,.18))
def shell(name,profile,material):
 n=96;v=[];f=[]
 for z,r in profile:
  for i in range(n):a=math.tau*i/n;v.append((r*math.cos(a),r*math.sin(a),z))
 for j in range(len(profile)-1):
  for i in range(n):a=j*n+i;b=j*n+(i+1)%n;f.append((a,b,b+n,a+n))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(v,[],f);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(material)
 for face in mesh.polygons:face.use_smooth=True
 return o
# Thin wall with real interior and annular end faces, no disk over the nozzle.
shell('Hollow engine fairing',[(-.5,.506),(.5,.506),(.5,.498),(-.5,.498),(-.5,.506)],white)
for z in [-.485,.485]:shell('End flange',[(z-.015,.508),(z+.015,.508)],metal)
for i in range(8):
 a=math.tau*i/8;bpy.ops.mesh.primitive_cube_add(size=1,location=(.506*math.cos(a),.506*math.sin(a),0));o=bpy.context.object;o.name='Panel split';o.dimensions=(.003,.002,.93);o.rotation_euler[2]=a;o.data.materials.append(dark);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
for m in [white,metal,dark]:
 obs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials[0]==m];bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]
 if len(obs)>1:bpy.ops.object.join()
 bpy.context.object.name=m.name
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'assets-source','engine-shroud.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'dist','assets','parts','engine-shroud.glb'),export_format='GLB',export_yup=True)
