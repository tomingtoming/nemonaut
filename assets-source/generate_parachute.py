"""Dedicated Blender source for packed and deployed recovery parachute; meters, GLB +Y up."""
import bpy, math, os
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.55;return m
white=mat('Woven ivory fabric',(.83,.84,.77));orange=mat('Rescue orange',(.95,.19,.025));metal=mat('Brushed aluminium',(.38,.44,.48),.7);dark=mat('Pack graphite',(.06,.08,.10),.4)
def P(x,y,z):return (x,-z,y)
def cylinder(name,xyz,r,depth,material):
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=r,depth=depth,location=P(*xyz));o=bpy.context.object;o.name=name;o.data.materials.append(material)
 for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
 return o
def export(objects,name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=os.path.join(root,'dist/assets/parts',name+'.glb'),export_format='GLB',use_selection=True,export_yup=True)
pack=[cylinder('Pressure sealed recovery pack',(0,0,0),.4,.32,dark),cylinder('Top release cap',(0,.18,0),.37,.04,white),cylinder('Attachment rim',(0,-.18,0),.4,.04,metal),cylinder('Safety band',(0,.09,0),.402,.045,orange)]
# Exact mounting envelope 0.8 x 0.4 x 0.8.
for o in pack:o.scale.x*=.4/.402;o.scale.y*=.4/.402
for i in range(12):
 a=math.tau*i/12;pack.append(cylinder('Cap fastener',(.31*math.cos(a),.199,.31*math.sin(a)),.018,.002,metal))
export(pack,'parachute')
canopy=[];segments=48;rings=10;radius=7
for gore in range(24):
 verts=[];faces=[]
 for j in range(rings+1):
  t=.05+(math.pi/2-.05)*j/rings
  for k in range(3):
   a=math.tau*(gore+k/2)/24;rad=radius*math.sin(t);y=9+3*math.cos(t);verts.append(P(rad*math.cos(a),y,rad*math.sin(a)))
 for j in range(rings):
  for k in range(2):a=j*3+k;faces.append((a,a+1,a+4,a+3))
 mesh=bpy.data.meshes.new('Stitched gore');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Canopy panel %02d'%gore,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(orange if gore%4<2 else white)
 for f in mesh.polygons:f.use_smooth=True
 canopy.append(o)
 a=math.tau*gore/24;start=Vector(P(.22*math.cos(a),.2,.22*math.sin(a)));end=Vector(P(radius*math.cos(a),9,radius*math.sin(a)));delta=end-start
 bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=.018,depth=delta.length,location=(start+end)/2);o=bpy.context.object;o.name='Suspension line %02d'%gore;o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();o.data.materials.append(white);canopy.append(o)
export(canopy,'parachute-open')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'assets-source','recovery-parachute.blend'))
print('Recovery pack and 24-gore canopy exported')
