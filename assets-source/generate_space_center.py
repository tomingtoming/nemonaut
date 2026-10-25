"""Orbital Foundry campus. Blender Z-up; GLB Y-up. Facility roots carry IDs."""
import bpy, math, os
from mathutils import Vector
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,rough=.65):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
concrete=mat('Warm limestone concrete',(.58,.60,.55));white=mat('Ivory cladding',(.83,.81,.72),.2);steel=mat('Blue grey steel',(.13,.22,.26),.6);glass=mat('Blue glazing',(.045,.19,.25),.55,.2);orange=mat('Signal vermilion',(.85,.24,.065),.2);road=mat('Asphalt',(.09,.13,.14));grass=mat('Coastal grass',(.23,.34,.22));water=mat('Blue ocean',(.045,.25,.34),.3,.25);paint=mat('Road markings',(.85,.83,.63));sand=mat('Shoreline',(.63,.59,.43))
parent=None
def attach(o,name,material):
 o.name=name;o.data.materials.append(material)
 if parent:o.parent=parent
 return o
def box(name,size,pos,material,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=attach(bpy.context.object,name,material);o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:b=o.modifiers.new('Soft structural edges','BEVEL');b.width=bevel;b.segments=2;o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return o
def cyl(name,r,depth,pos,material,vertices=48):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=pos);o=attach(bpy.context.object,name,material)
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 return o
def facility(identifier):
 global parent
 parent=bpy.data.objects.new(identifier,None);parent['facility']=identifier;bpy.context.collection.objects.link(parent)
box('Ocean',(1600,1600,1),(0,0,-2),water)
box('Coastal plateau',(500,420,3),(-75,0,-.6),sand,5)
box('Campus grass',(480,410,2),(-80,0,-.03),grass,4)
box('Main service avenue',(320,12,.15),(-60,-53,1),road)
box('Vertical service road',(10,170,.15),(25,10,1),road)
for i in range(22):box('Road center dash',(5,.25,.02),(-210+i*14,-53,1.09),paint)
facility('vab')
box('VAB foundation',(52,48,1.2),(-62,8,1.1),concrete,1)
box('VAB tall assembly hall',(35,32,64),(-62,10,33.5),white,.5)
box('VAB recessed launch door',(26,.55,51),(-62,-6.3,27),steel)
for i in range(10):box('VAB door horizontal leaf',(25,.3,.25),(-62,-6.65,3+i*5),concrete)
for x in [-80.2,-43.8]:box('VAB vertical external rib',(1.6,34,66),(x,10,34),concrete,.2)
box('VAB operations annex',(14,30,18),(-35,10,10.5),white,.4)
for z in [5,10,15]:box('VAB annex glass band',(14.1,.3,2),(-35,-5.1,z),glass)
box('VAB orange crest',(13,.4,4),(-62,-6.5,60),orange,.15)
box('VAB roof service block',(12,8,3),(-62,11,67),steel,.2)
for x in [-69,-54]:cyl('VAB roof ventilation',2,2,(x,17,67),steel)
box('Crawler apron',(32,31,.15),(-62,-30,1.15),concrete)
facility('sph')
box('SPH apron',(75,65,.6),(60,-70,1.2),concrete,1)
box('SPH hangar base',(58,42,2),(62,-55,2),steel,.3)
box('SPH side wall',(2,42,16),(33,-55,10),white,.3);box('SPH side wall',(2,42,16),(91,-55,10),white,.3)
# Curved barrel roof, closed by longitudinal end caps.
verts=[];faces=[];steps=40
for y in [-76,-34]:
 for i in range(steps+1):
  a=math.pi*i/steps;verts.append((62+30*math.cos(a),y,18+14*math.sin(a)))
for i in range(steps):faces.append((i,i+1,steps+2+i,steps+1+i))
mesh=bpy.data.meshes.new('Barrel roof');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('SPH curved roof',mesh);bpy.context.collection.objects.link(o);attach(o,'SPH curved roof',white);solid=o.modifiers.new('Roof skin','SOLIDIFY');solid.thickness=.3
for p in mesh.polygons:p.use_smooth=True
box('SPH front sliding door',(54,.5,16),(62,-76,10),steel)
for x in range(38,90,6):box('SPH door seams',(.18,.7,16),(x,-76.1,10),concrete)
box('SPH glass clerestory',(48,.5,2.3),(62,-76,19.2),glass)
box('SPH orange canopy',(61,3,.8),(62,-77,21.5),orange,.2)
box('SPH rear enclosure',(58,.5,17),(62,-34,10),white)
for y in [-60,-45]:box('SPH side glass',(2.1,9,3),(91,-55+(y+55),12),glass)
parent=None
box('Runway',(300,22,.2),(30,-145,1.1),road)
for x in range(-110,176,16):box('Runway center line',(8,.5,.02),(x,-145,1.22),paint)
for x in [-109,169]:
 for y in range(-153,-136,3):box('Runway threshold',(12,1,.02),(x,y,1.23),paint)
box('Taxiway',(15,55,.15),(60,-111,1.1),road)
facility('tracking')
box('Tracking operations',(23,18,8),(-145,-5,5.2),white,.4)
for x,y in [(-151,20),(-122,28),(-160,47)]:
 cyl('Dish pedestal',2,8,(x,y,5),concrete)
 # Radial paraboloid reflector with explicit curvature.
 v=[(x,y,11)];f=[];rings=8;n=48
 for j in range(1,rings+1):
  r=9*j/rings
  for i in range(n):a=math.tau*i/n;v.append((x+r*math.cos(a),y+r*math.sin(a),11+.035*r*r))
 for i in range(n):f.append((0,1+i,1+(i+1)%n))
 for j in range(rings-1):
  for i in range(n):a=1+j*n+i;b=1+j*n+(i+1)%n;f.append((a,b,b+n,a+n))
 m=bpy.data.meshes.new('Reflector');m.from_pydata(v,[],f);m.update();o=bpy.data.objects.new('Tracking parabolic dish',m);bpy.context.collection.objects.link(o);attach(o,'Tracking parabolic dish',white)
 for p in m.polygons:p.use_smooth=True
 cyl('Receiver mast',.2,7,(x,y,14),steel);cyl('Receiver',.65,1,(x,y,17.5),orange)
facility('pad')
cyl('Launch pad concrete',25,1,(107,66,1.5),concrete)
box('Flame trench',(8,38,1),(107,66,2.1),steel)
box('Launch table',(16,13,3),(107,66,4),white,.4)
for x in [93,97]:
 for y in [69,73]:box('Service tower leg',(1,1,43),(x,y,23),steel)
for z in range(5,46,5):box('Service gantry platform',(8,8,.6),(95,71,z),concrete)
box('Umbilical bridge',(18,3,1.5),(103,69,36),orange)
parent=None
box('Pad access road',(82,10,.15),(66,51,1.1),road)
os.makedirs(os.path.join(root,'dist/assets/scenery'),exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'assets-source','space-center.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'dist/assets/scenery','space-center.glb'),export_format='GLB',export_yup=True,export_extras=True)
