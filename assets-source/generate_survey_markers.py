"""Flush survey monuments and painted 30 m boundary. Blender metres, Z-up."""
import bpy, math, os
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(os.path.join(root,'src/assets/scenery'),exist_ok=True)
def material(name,color,metal=0,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.5;p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission;return m
def cylinder(name,radius,depth,z,mat,vertices=64):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=(0,0,z));o=bpy.context.object;o.name=name;o.data.materials.append(mat);return o
def box(name,size,location,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);return o
def arc(name,r0,r1,a0,a1,z,mat):
 verts=[];steps=8
 for i in range(steps+1):
  a=a0+(a1-a0)*i/steps
  for r in [r0,r1]:verts.append((r*math.cos(a),r*math.sin(a),z))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[(2*i,2*i+1,2*i+3,2*i+2) for i in range(steps)]);mesh.materials.append(mat);o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
for key,code in [('north','N 01'),('east','E 02')]:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.context.scene.unit_settings.system='METRIC'
 steel=material('Stainless survey monument',(.30,.35,.36),.8)
 dark=material('Engraved graphite face',(.035,.045,.05),.2)
 yellow=material('Reflective survey paint',(.9,.65,.12),.1,.18)
 white=material('Ceramic survey lettering',(.82,.87,.82),.1,.3)
 cylinder('Flush anchor plate',1.8,.012,.036,steel)
 cylinder('Inlaid instrument face',1.67,.008,.046,dark)
 for i in range(12):
  a=i*math.tau/12;o=cylinder('Recessed anchor bolt',.035,.004,.045,steel,12);o.location.x=1.735*math.cos(a);o.location.y=1.735*math.sin(a)
 for i in range(4):
  a=i*math.pi/2;arc('Survey quadrant',1.43,1.5,a+.08,a+math.pi/2-.08,.051,yellow)
 for x in [-1,1]:box('Precision datum cross',(.42,.035,.003),(x*.9,0,.053),white)
 for y in [-1,1]:box('Precision datum cross',(.035,.30,.003),(0,y*.95,.053),white)
 bpy.ops.object.text_add(location=(0,-.22,.054));label=bpy.context.object;label.name='Site identifier';label.data.body=code;label.data.align_x='CENTER';label.data.size=.65;label.data.extrude=.001;label.data.materials.append(white);bpy.ops.object.convert(target='MESH')
 # 30m outer radius; paint is flush and carries no collision obstacle.
 for i in range(48):
  a=i*math.tau/48;arc('Thirty metre painted boundary',29.65,30,a,a+math.tau/48*.65,.03,yellow)
 for i in range(4):
  a=i*math.pi/2;o=box('Cardinal approach stripe',(.22,3,.001),(0,0,.031),white);o.location.x=27.5*math.cos(a);o.location.y=27.5*math.sin(a);o.rotation_euler.z=a-math.pi/2
 bpy.context.view_layer.update()
 bpy.ops.export_scene.gltf(filepath=os.path.join(root,'src/assets/scenery',f'survey-{key}.glb'),export_format='GLB',export_yup=True)
 bpy.ops.object.camera_add(location=(4,-5,7));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.04))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=4.8;bpy.context.scene.camera=cam
 bpy.ops.object.light_add(type='AREA',location=(0,-3,6));bpy.context.object.data.energy=650;bpy.context.object.data.size=5
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=800;scene.render.resolution_y=600;scene.render.resolution_percentage=100;scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.15,.18,.2,1)
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'assets-source',f'survey-{key}.blend'))
 if key=='north':scene.render.filepath=os.path.join(root,'artifacts','survey-monument153.png');bpy.ops.render.render(write_still=True)
