"""BP-1000 radial battery, Blender Z-up / game Y-up, 0.8 x 0.3 x 0.5 m."""
import bpy, math, os
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system='METRIC'
def mat(name,color,metal=0,rough=.4):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
ivory=mat('Ceramic white insulation',(.79,.82,.77),.25)
dark=mat('Graphite case and gasket',(.035,.05,.055),.3)
steel=mat('Brushed mounting hardware',(.35,.42,.45),.8,.25)
yellow=mat('Electrical safety ochre',(.95,.52,.045),.15)
red=mat('Positive terminal insulator',(.55,.045,.025),.1)
def box(name,size,location,material,bevel=.008):
 bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
 if bevel:
  b=o.modifiers.new('Machined radii','BEVEL');b.width=bevel;b.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def bolt(name,position,radius=.012,depth=.009,material=steel):
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=depth,location=position);o=bpy.context.object;o.name=name;o.data.materials.append(material);return o
box('Lower battery enclosure',(.72,.44,.19),(0,0,-.025),dark,.018)
box('Sealed lid',(.73,.45,.055),(0,0,.0975),ivory,.012)
box('Lid gasket',(.734,.454,.009),(0,0,.066),dark,.004)
for x in [-.34,.34]:
 box('Structural mounting shoe',(.12,.50,.035),(x,0,-.1325),steel,.008)
 for y in [-.214,.214]:bolt('Mounting fastener',(x,y,-.108),.014,.012)
for x in [-.30,.30]:
 for y in [-.18,.18]:bolt('Lid captive screw',(x,y,.128),.012,.006)
for x in [-.24,-.16,-.08,0,.08,.16,.24]:
 for y in [-.222,.222]:box('Cooling rib',(.025,.018,.115),(x,y,-.025),steel,.004)
for x,material in [(-.25,red),(.25,dark)]:
 bolt('Insulated terminal collar',(x,.12,.130),.025,.025,material)
 bolt('Recessed power stud',(x,.12,.146),.013,.008,steel)
box('Electrical nameplate',(.29,.14,.003),(0,-.045,.127),yellow,.005)
bpy.ops.object.text_add(location=(0,-.065,.130));label=bpy.context.object;label.name='Capacity marking';label.data.body='1000 EC';label.data.align_x='CENTER';label.data.size=.044;label.data.extrude=.0003;label.data.materials.append(dark)
bpy.ops.object.convert(target='MESH')
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'dist/assets/parts','battery.glb'),export_format='GLB',export_yup=True)
# Preview rig is saved in the editable source, excluded from the exported part.
bpy.ops.object.camera_add(location=(1.25,-1.25,1.05));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=1.25;bpy.context.scene.camera=camera
for pos,energy,size in [((1,-2,3),240,3),((-2,-1,1),140,2),((0,2,2),200,2)]:
 bpy.ops.object.light_add(type='AREA',location=pos);light=bpy.context.object;light.data.energy=energy;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=32;s.render.resolution_x=800;s.render.resolution_y=600;s.render.resolution_percentage=100;s.render.film_transparent=False
s.world=bpy.data.worlds.new('Studio');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.065,.085,.10,1)
s.render.image_settings.file_format='PNG';s.render.filepath=os.path.join(root,'artifacts','battery146.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'assets-source','battery.blend'))
bpy.ops.render.render(write_still=True)
