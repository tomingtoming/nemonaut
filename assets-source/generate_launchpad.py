"""Launch complex 01: original editable Blender scenery, metre scale.
The launch deck stays flush with the existing ground. Central 16 m is clear.
"""
import bpy,math,os,random
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system='METRIC'
def mat(name,color,metal=0,rough=.7,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m
concrete=mat('Weathered warm concrete',(.43,.45,.41));tile=mat('Concrete variation',(.48,.49,.44));dark=mat('Scorched graphite',(.035,.043,.043));steel=mat('Oxidised blue steel',(.12,.21,.23),.65);white=mat('Warm white paint',(.78,.78,.67),.25);orange=mat('Safety ochre',(.92,.52,.07));rust=mat('Oxidised fasteners',(.3,.13,.055),.5);asphalt=mat('Service road',(.08,.095,.09));lamp=mat('Warm floodlight',(.98,.75,.35),0,.3,4);red=mat('Warning beacon',(.9,.025,.008),0,.4,3);grass=mat('Coastal scrub',(.23,.29,.12));stone=mat('Aggregate',(.34,.32,.25))
def finish(o,name,m):
 o.name=name;o.data.materials.append(m);return o
def box(name,p,d,m,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=finish(bpy.context.object,name,m);o.dimensions=d;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  b=o.modifiers.new('Worn edges','BEVEL');b.width=bevel;b.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=b.name)
 return o
def cyl(name,p,r,h,m,n=32):
 bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=h,location=p);o=finish(bpy.context.object,name,m)
 for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
 return o
def beam(name,a,b,r,m,n=8):
 va=Vector(a);vb=Vector(b);o=cyl(name,(va+vb)/2,r,(vb-va).length,m,n);o.rotation_euler=(vb-va).to_track_quat('Z','Y').to_euler();return o
def stencil(text,p,size,m):
 cu=bpy.data.curves.new(text,'FONT');cu.body=text;cu.size=size;cu.align_x='CENTER';cu.extrude=.001;ob=bpy.data.objects.new(text,cu);bpy.context.collection.objects.link(ob);ob.location=p;ob.data.materials.append(m)
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')

# Deck at ground level, with scored expansion joints and a heat-stained centre.
box('Apron foundation',(0,0,-.18),(72,76,.4),concrete,.1)
for x in range(-30,36,6):
 for y in range(-30,36,6):box('Individual apron slab',(x,y,.027),(5.96,5.96,.012),tile if (x+y)%12==0 else concrete)
cyl('Blast stained launch deck',(0,0,.043),8,.014,dark,96)
for x in [-4.5,4.5]:
 box('Exhaust grid border',(x,0,.059),(2.8,11,.018),steel)
 for y in range(-5,6):box('Refractory grate slat',(x,y,.073),(2.7,.17,.015),dark)
for a in range(0,360,10):
 theta=math.radians(a);o=box('Segmented safety ring',(9*math.cos(theta),9*math.sin(theta),.052),(.95,.16,.015),orange);o.rotation_euler[2]=theta+math.pi/2
stencil('01',(0,-16,.06),6,white);stencil('LAUNCH COMPLEX',(0,-19,.06),1,white)
for x in [-11,11]:
 for y in range(-8,10,2):
  o=box('Keep clear chevron',(x,y,.054),(1.5,.42,.012),orange);o.rotation_euler[2]=math.pi/4
# Flared exhaust channels and blast walls remain outside the launch clearance.
for x in [-14,14]:
 box('Refractory exhaust channel',(x,0,.04),(5,22,.05),dark)
 for dx in [-2.8,2.8]:box('Blast wall',(x+dx,0,.9),(.5,24,1.8),concrete,.12)
 for y in [-8,-4,0,4,8]:box('Channel expansion seam',(x,y,.08),(5,.08,.015),rust)

# Retracted service gantry: lattice, stair flights, caged lift, and platforms.
tx,ty=-22,12
for x in [tx-2.5,tx+2.5]:
 for y in [ty-2.5,ty+2.5]:
  box('Tower footing',(x,y,.45),(2,2,.9),concrete,.1);beam('Main gantry chord',(x,y,.6),(x,y,34),.22,steel)
for z in range(2,31,4):
 for y in [ty-2.5,ty+2.5]:
  beam('Gantry cross brace',(tx-2.5,y,z),(tx+2.5,y,z+3.8),.09,steel);beam('Gantry cross brace',(tx+2.5,y,z),(tx-2.5,y,z+3.8),.09,steel)
 for x in [tx-2.5,tx+2.5]:beam('Tower side brace',(x,ty-2.5,z),(x,ty+2.5,z+3.8),.09,steel)
 box('Service platform',(tx,ty,z),(6.6,6.6,.18),steel)
 for y in [ty-3.2,ty+3.2]:
  beam('Platform railing',(tx-3.2,y,z+1.1),(tx+3.2,y,z+1.1),.045,orange)
  for x in [tx-3.2,tx,tx+3.2]:beam('Railing post',(x,y,z),(x,y,z+1.1),.045,orange)
 for i in range(12):box('Gantry stair tread',(tx-1.5+i*.24,ty-1,z+i/3),(1.2,.8,.08),white)
box('Lift enclosure',(tx-1,ty+1,17),(1.3,1.3,32),dark)
for z in [10,22,30]:
 box('Retracted service arm',(tx+5,ty,z),(4,.8,.6),steel);beam('Arm stay',(tx+2.5,ty,z+2),(tx+7,ty,z),.09,steel)
box('Tower crown platform',(tx,ty,34),(6.6,6.6,.18),steel)
beam('Lightning mast',(tx,ty,34),(tx,ty,41),.09,white);cyl('Tower beacon',(tx,ty,35),.24,.4,red)

# Water and service infrastructure, positioned behind the launch zone.
cyl('Deluge water tank',(25,21,4),4,8,white,64)
for z in [.4,3.5,7.6]:cyl('Tank reinforcing band',(25,21,z),4.05,.18,steel,64)
for x in [23,27]:beam('Tank roof pipe',(x,21,8),(x,21,9),.16,steel)
beam('Water main',(25,17,.6),(25,-8,.6),.3,steel);beam('Deluge branch',(25,-8,.6),(12,-8,.6),.3,steel)
for y in [-4,4]:beam('Pad water manifold',(25,y,.6),(12,y,.6),.18,steel)
box('Pump house',(24,31,2.5),(13,7,5),white,.2);box('Pump roof',(24,31,5.2),(14,8,.4),steel)
for x in [20,24,28]:box('Service doors',(x,27.46,2),(2.8,.1,3.5),steel)
for x in [19,29]:cyl('Roof ventilator',(x,31,5.6),.6,.8,dark)
box('Control cabinet',(-29,-19,1.3),(2,1.2,2.6),white,.1)
for x in [-30.2,-27.8]:cyl('Cabinet bollard',(x,-20,.5),.14,1,orange,12)
# Road, perimeter fence, edge lights and bollards; south gate stays open.
box('Access road',(0,-77,-.015),(12,78,.08),asphalt)
for y in range(-40,-116,-9):box('Road centre dash',(0,y,.032),(.15,4,.012),white)
for x in [-6,6]:box('Road edge line',(x,-77,.035),(.12,78,.012),white)
for x in [-36,36]:
 for y in range(-36,37,6):beam('Perimeter post',(x,y,0),(x,y,2),.055,steel)
 for z in [.4,1.2,2]:beam('Fence wire',(x,-36,z),(x,36,z),.018,steel)
for y in [-36,36]:
 for x in range(-36,37,6):
  if y<0 and abs(x)<9:continue
  beam('Fence post',(x,y,0),(x,y,2),.055,steel)
 for a,b in ([(-36,-9),(9,36)] if y<0 else [(-36,36)]):
  for z in [.4,1.2,2]:beam('Fence wire',(a,y,z),(b,y,z),.018,steel)
for x in [-30,30]:
 for y in [-26,26]:
  beam('Floodlight mast',(x,y,0),(x,y,11),.12,steel)
  box('Floodlight crossbar',(x,y,10.8),(3,.3,.2),steel)
  for dx in [-.8,.8]:box('Floodlight housing',(x+dx,y,10.7),(.8,.65,.45),dark);box('Floodlight lens',(x+dx,y-.34,10.65),(.64,.03,.28),lamp)
for y in range(-28,33,8):
 for x in [-33,33]:cyl('Edge marker',(x,y,.13),.12,.26,orange,12);cyl('Edge lamp',(x,y,.28),.1,.05,lamp,12)
rng=random.Random(166)
for i in range(65):
 x=rng.choice([-1,1])*rng.uniform(38,53);y=rng.uniform(-37,43)
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(x,y,.12));o=finish(bpy.context.object,'Coastal grass and aggregate',grass if i%3 else stone);o.scale=(rng.uniform(.25,.8),rng.uniform(.25,.8),rng.uniform(.12,.45))

# Merge by material to keep the large scene cheap to render.
bpy.context.view_layer.update()
for material in list(bpy.data.materials):
 objs=[o for o in bpy.context.scene.objects if o.type=='MESH' and material in list(o.data.materials)]
 if not objs:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();bpy.context.object.name='Pad01 '+material.name
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'dist','assets','scenery','launchpad.glb'),export_format='GLB',use_selection=True,export_yup=True)
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('Coastal daylight');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.45,.6,1)
bpy.ops.object.light_add(type='AREA',location=(20,-30,60));o=bpy.context.object;o.data.energy=45000;o.data.size=45;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(70,-90,65));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,8))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=130;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1500;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'assets-source','launchpad.blend'));scene.render.filepath=os.path.join(root,'artifacts','launchpad166-studio.png');bpy.ops.render.render(write_still=True)
print('COMPLETE launchpad')
