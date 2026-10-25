"""Six-axis cold-gas block, authored in Blender. Coordinates export to game +Y up."""
import bpy, math, os
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def P(v): return Vector((v[0],-v[2],v[1]))
def material(name,color,metal,rough):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
ivory=material('Ceramic thermal housing',(.79,.81,.75),.15,.4)
steel=material('Titanium nozzle rims',(.32,.38,.43),.85,.27)
dark=material('Recessed graphite chambers',(.018,.025,.032),.3,.6)
orange=material('Propellant service markings',(.93,.24,.035),.25,.38)
def cube(name,scale,mat):
 bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 bevel=o.modifiers.new('Machined rounded edges','BEVEL');bevel.width=.015;bevel.segments=3
 o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');return o
cube('Integrated 12 kg monopropellant reservoir',(.32,.32,.32),ivory)
for axis in range(3):
 for sign in [-1,1]:
  v=[0,0,0];v[axis]=sign;out=P(v);q=out.to_track_quat('Z','Y')
  # Hollow bell wall; inner surface and lip remain visible down the nozzle.
  vertices=[];faces=[];rings=[(.15,.045),(.23,.075),(.24,.075),(.24,.063),(.165,.034)]
  for depth,radius in rings:
   for k in range(48):
    a=math.tau*k/48;vertices.append(q@Vector((radius*math.cos(a),radius*math.sin(a),depth)))
  for j in range(len(rings)-1):
   for k in range(48): faces.append((j*48+k,j*48+(k+1)%48,(j+1)*48+(k+1)%48,(j+1)*48+k))
  mesh=bpy.data.meshes.new('Hollow machined nozzle');mesh.from_pydata(vertices,[],faces);mesh.update();o=bpy.data.objects.new('Nozzle exhaust %s %s'%(axis,sign),mesh);bpy.context.collection.objects.link(o);o.data.materials.append(steel)
  for p in mesh.polygons:p.use_smooth=True
  bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=.034,depth=.003,location=out*.164);o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=q;o.data.materials.append(dark);o.name='Recessed injector'
  # Four fasteners per face, outside nozzle collar.
  for a in [math.pi/4+i*math.pi/2 for i in range(4)]:
   location=q@Vector((.125*math.cos(a),.125*math.sin(a),.163))
   bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.012,depth=.008,location=location);o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=q;o.data.materials.append(steel)
stripe=cube('Service band',(.326,.045,.326),orange)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'assets-source','rcs-block.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'dist/assets/parts','rcs.glb'),export_format='GLB',export_yup=True)
