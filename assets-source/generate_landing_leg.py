"""LL-16 fixed landing leg. Blender Z-up; exported game Y-up, 0.65 x 1.6 x 0.65 m."""
import bpy, math, os
from mathutils import Vector

root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Run in a disposable background Blender process; never overwrite input blend.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system='METRIC'

def material(name,color,metal=0,rough=.4):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

ivory=material('LL thermal ivory',(.80,.82,.77),.2)
metal=material('LL polished piston',(.42,.48,.53),.85,.22)
dark=material('LL pad tread',(.045,.055,.06),.25,.7)
orange=material('LL travel marks',(.95,.24,.035),.2)

def cylinder(name,radius,depth,z,mat,vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=(0,0,z))
    o=bpy.context.object;o.name=name;o.data.materials.append(mat)
    for face in o.data.polygons:face.use_smooth=len(face.vertices)==4
    bevel=o.modifiers.new('Machined edge bevel','BEVEL');bevel.width=.008;bevel.segments=2
    o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL')
    return o

def beam(name,a,b,radius,mat):
    a,b=Vector(a),Vector(b);o=cylinder(name,radius,(b-a).length,0,mat,24)
    o.location=(a+b)/2;o.rotation_mode='QUATERNION';o.rotation_quaternion=(b-a).to_track_quat('Z','Y')
    return o

cylinder('Wide tread pad',.325,.08,-.76,dark,64)
cylinder('Pad structural dish',.30,.055,-.6925,metal,64)
cylinder('Foot articulation cover',.13,.12,-.605,ivory)
cylinder('Exposed shock piston',.067,.63,-.23,metal)
cylinder('Hydraulic shock sleeve',.115,.64,.38,ivory)
cylinder('Lower sleeve seal',.124,.045,.075,dark)
cylinder('Upper mount flange',.19,.10,.75,metal)
cylinder('Mount cap',.15,.04,.72,ivory)
for z in [.12,.20,.28]:cylinder('Piston travel stripe',.117,.022,z,orange)
for angle in [0,math.pi/2,math.pi,3*math.pi/2]:
    x,y=.23*math.cos(angle),.23*math.sin(angle)
    beam('Pad stabilizer brace',(x,y,-.66),(0,0,-.30),.018,metal)
    bolt=cylinder('Pad bolt',.022,.018,-.658,orange,16);bolt.location.x=x;bolt.location.y=y
for angle in [math.pi/4,3*math.pi/4,5*math.pi/4,7*math.pi/4]:
    bolt=cylinder('Mount bolt',.022,.014,.793,metal,16)
    bolt.location.x=.145*math.cos(angle);bolt.location.y=.145*math.sin(angle)

bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'assets-source','landing-leg.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'src/assets/parts','landingLeg.glb'),export_format='GLB',export_yup=True)
