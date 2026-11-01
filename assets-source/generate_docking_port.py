"""DP-12 docking port. Meters, game +Y is the active mating face."""
import bpy, math, os
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,rough=.4):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
white=mat('Thermal ivory',(.8,.82,.77),.15);metal=mat('Machined capture ring',(.4,.46,.5),.85,.25);dark=mat('Pressure seal rubber',(.025,.035,.04),.1,.7);orange=mat('Dock alignment markings',(.95,.23,.025),.25)
def cyl(name,r,depth,y,material):
 bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=r,depth=depth,location=(0,0,y));o=bpy.context.object;o.name=name;o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 return o
def ring(name,r,tube,y,material):
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=tube,major_segments=96,minor_segments=12,location=(0,0,y));o=bpy.context.object;o.name=name;o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=True
 return o
cyl('Rear mounting flange',.625,.04,-.10,metal)
cyl('Ivory pressure housing',.6,.12,-.02,white)
cyl('Recessed hatch face',.40,.025,.045,dark)
cyl('Pressure hatch',.355,.015,.065,metal)
ring('Outer capture ring',.60,.025,.075,metal)
ring('Inner face seal',.43,.018,.077,dark)
ring('Hatch lip',.36,.012,.075,metal)
for i in range(12):
 a=math.tau*i/12
 o=cyl('Flange fastener',.018,.012,.047,metal);o.location.x=.555*math.cos(a);o.location.y=.555*math.sin(a)
for i in range(3):
 a=math.tau*i/3
 bpy.ops.mesh.primitive_cube_add(size=1,location=(.50*math.cos(a),.50*math.sin(a),.09));o=bpy.context.object;o.name='Capture latch';o.scale=(.10,.12,.06);o.rotation_euler.z=a;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(metal)
 b=o.modifiers.new('Rounded latch edges','BEVEL');b.width=.008;b.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 bpy.ops.mesh.primitive_cube_add(size=1,location=(.505*math.cos(a),.505*math.sin(a),.121));o=bpy.context.object;o.name='Alignment stripe';o.scale=(.07,.022,.002);o.rotation_euler.z=a;o.data.materials.append(orange)
# Exact total height .242 m, front +.121, rear -.121 after centering.
for o in bpy.context.scene.objects:o.location.z-=.001
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'assets-source','docking-port.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'src/assets/parts','dockingPort.glb'),export_format='GLB',export_yup=True)
