"""Orbital Foundry original modular parts. Run with Blender --background --python this.py.
Design coordinates are meters, +Y nose/up, +X starboard. GLB uses those coordinates.
"""
import bpy, math, json, os
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'dist','assets','parts'); os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,rough=.4):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
 return m
white=mat('Ceramic | warm white',(.78,.82,.82),.2,.32)
dark=mat('Graphite alloy',(.045,.065,.085),.75,.33)
silver=mat('Machined titanium',(.34,.42,.46),.82,.26)
orange=mat('Safety vermilion',(.95,.20,.035),.3,.3)
blue=mat('Optical blue',(.025,.21,.37),.65,.16)
black=mat('Heatshield & rubber',(.015,.022,.028),.05,.65)
gold=mat('Thermal foil',(.72,.4,.09),.8,.28)
cell=mat('Photovoltaic cobalt',(.018,.055,.21),.65,.22)
parts={}; current=[]
def P(p):return (p[0],-p[2],p[1])
def finish(o,name,m,bevel=0):
 o.name=name; o.data.materials.append(m); current.append(o)
 if bevel:
  mod=o.modifiers.new('Precision edge radius','BEVEL'); mod.width=bevel; mod.segments=2
  bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
 if o.type=='MESH':
  for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 return o
def box(name,p,d,m,bevel=.015):
 bpy.ops.mesh.primitive_cube_add(size=1,location=P(p));o=bpy.context.object;o.dimensions=(d[0],d[2],d[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,m,bevel)
def cyl(name,p,r,h,m,axis='Y',verts=40):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=h,location=P(p));o=bpy.context.object
 if axis=='X':o.rotation_euler[1]=math.pi/2
 elif axis=='Z':o.rotation_euler[0]=math.pi/2
 return finish(o,name,m,.008)
def lathe(name,profile,m,n=48):
 vs=[P((r*math.cos(i*2*math.pi/n),y,r*math.sin(i*2*math.pi/n))) for y,r in profile for i in range(n)]
 fs=[]
 for j in range(len(profile)-1):
  for i in range(n):a=j*n+i;b=j*n+(i+1)%n;fs.append((a,b,b+n,a+n))
 fs.extend([tuple(reversed(range(n))),tuple((len(profile)-1)*n+i for i in range(n))])
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);return finish(o,name,m)
def ring(y,r=.605,h=.065,m=silver):return cyl('Attachment flange',(0,y,0),r,h,m)
def bolts(y,r=.54,n=12):
 for i in range(n):
  a=i*math.tau/n;cyl('Hex captive fastener',(r*math.cos(a),y,r*math.sin(a)),.026,.027,dark,verts=6)
def tube(name,a,b,r,m):
 va=Vector(P(a));vb=Vector(P(b));bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=(vb-va).length,location=(va+vb)/2);o=bpy.context.object;o.rotation_euler=(vb-va).to_track_quat('Z','Y').to_euler();return finish(o,name,m)
def ports(y):
 for x in [-.24,.24]:
  cyl('Service port rim',(x,y,.554),.10,.065,silver,'Z',24);cyl('Service port seal',(x,y,.59),.064,.025,dark,'Z',24)
def build(id,dim):
 global current;current=[];parts[id]={'objects':current,'dimensions':dim}
def finalize(id):
 objs=parts[id]['objects'];dim=parts[id]['dimensions'];vs=[o.matrix_world@v.co for o in objs for v in o.data.vertices]
 lo=Vector(tuple(min(v[i] for v in vs) for i in range(3)));hi=Vector(tuple(max(v[i] for v in vs) for i in range(3)));center=(lo+hi)/2
 if id=='wing':center.x=lo.x
 scale=Vector((dim[0]/(hi.x-lo.x),dim[2]/(hi.y-lo.y),dim[1]/(hi.z-lo.z)))
 for o in objs:
  mw=o.matrix_world.copy()
  for v in o.data.vertices:
   p=mw@v.co-center;v.co=Vector((p.x*scale.x,p.y*scale.y,p.z*scale.z))
  o.location=(0,0,0);o.rotation_euler=(0,0,0);o.scale=(1,1,1)
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,id+'.glb'),export_format='GLB',use_selection=True,export_yup=True)

build('tank',(1.25,2,1.25))
lathe('Cryogenic vessel',[(-1,.54),(-.94,.60),(.94,.60),(1,.54)],white)
for y in [-.94,.94]:ring(y);bolts(y)
for y in [-.78,.78]:ring(y,.606,.09,orange)
for a in [0,math.pi]:
 x,z=.58*math.cos(a),.58*math.sin(a);tube('External feedline',(x,-.78,z),(x,.78,z),.035,silver)
ports(-.38);box('Avionics access panel',(0,.28,.6),(.32,.46,.025),dark)
for i in range(4):box('Panel radiator slit',(0,.12+i*.09,.62),(.26,.022,.015),silver,.002)
finalize('tank')

build('capsule',(1.25,1.3,1.25))
lathe('Reentry shell',[(-.65,.60),(-.48,.61),(.38,.31),(.57,.25),(.65,.20)],white)
ring(-.6,.625,.11,black);ring(.55,.25,.09,orange);bolts(-.52)
for x in [-.20,.20]:
 o=box('Window titanium surround',(x,.12,.445),(.29,.32,.055),dark,.045);o.rotation_euler[0]=-.32
 o=box('Blue laminated window',(x,.13,.48),(.23,.25,.024),blue,.035);o.rotation_euler[0]=-.32
box('Hatch frame',(0,-.19,-.53),(.4,.37,.055),silver,.045);box('Hatch inset',(0,-.19,-.565),(.32,.30,.025),white,.035)
cyl('Docking cap',(0,.62,0),.18,.06,dark);finalize('capsule')

build('engine',(1.25,1.2,1.25))
ring(.55,.625,.1);bolts(.6);cyl('Turbopump housing',(0,.25,0),.28,.5,dark)
lathe('Regeneratively cooled bell',[(-.6,.53),(-.52,.50),(-.25,.36),(.04,.21),(.14,.19),(.20,.23)],silver)
lathe('Bell dark interior',[(-.61,.485),(-.5,.46),(-.24,.32),(.04,.17)],black)
for i in range(20):
 a=i*math.tau/20;tube('Cooling channel',(.23*math.cos(a),.04,.23*math.sin(a)),(.50*math.cos(a),-.53,.50*math.sin(a)),.012,dark)
for x in [-.42,.42]:
 cyl('Pump',(x,.25,0),.10,.34,orange);tube('Feed pipe',(x,.4,0),(x,-.1,0),.04,silver);tube('Engine strut',(x,.5,0),(x*.48,.0,0),.045,dark)
finalize('engine')

build('nose',(1.25,1,1.25));lathe('Ogive fairing',[(-.5,.625),(-.3,.60),(.0,.45),(.27,.23),(.48,.035),(.5,.0)],white);ring(-.47,.625,.06,orange);bolts(-.42);finalize('nose')
build('decoupler',(1.25,.22,1.25));cyl('Separation collar',(0,0,0),.60,.22,dark)
for y in [-.085,.085]:ring(y,.625,.045,silver)
for i in range(12):
 a=i*math.tau/12;o=box('Separation charge cover',(.60*math.cos(a),0,.60*math.sin(a)),(.13,.12,.06),orange);o.rotation_euler[2]=-a-math.pi/2
bolts(.105);finalize('decoupler')
build('probe',(1.25,.4,1.25));cyl('Octagonal avionics',(0,0,0),.61,.35,gold,verts=8);ring(-.17);ring(.17);bolts(.2)
for x in [-.25,.25]:box('Flight computer',(x,0,.53),(.28,.25,.12),dark);box('Computer plate',(x,0,.60),(.22,.19,.02),silver)
finalize('probe')
build('cockpit',(1.25,2,1.25));lathe('Aircraft nose',[(-1,.58),(-.65,.62),(.1,.55),(.6,.34),(1,.035)],white)
box('Canopy frame',(0,.0,.50),(.80,.9,.18),dark,.13);box('Canopy glazing',(0,.04,.60),(.67,.76,.13),blue,.11)
box('Canopy center bar',(0,.04,.68),(.045,.80,.025),silver);ring(-.95);ports(-.62);finalize('cockpit')
build('jet',(1.25,1.2,1.25));lathe('Turbofan cowling',[(-.6,.44),(-.4,.56),(.48,.625),(.6,.6)],white);ring(.54,.625,.10,silver)
cyl('Intake darkness',(0,.58,0),.55,.04,dark);cyl('Fan spinner',(0,.62,0),.12,.09,silver)
for i in range(16):
 a=i*math.tau/16;o=box('Fan blade',(.31*math.cos(a),.61,.31*math.sin(a)),(.40,.025,.045),silver,.005);o.rotation_euler[1]=-a
ring(-.53,.44,.12,dark);ring(-.31,.55,.06,orange);finalize('jet')
build('wing',(2,1.6,.12))
vs=[(0,.8,-.05),(2,-.25,-.015),(1.8,-.8,-.015),(0,-.8,-.05),(0,.8,.05),(2,-.25,.015),(1.8,-.8,.015),(0,-.8,.05)]
me=bpy.data.meshes.new('Swept airfoil');me.from_pydata([P(v) for v in vs],[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);me.update();o=bpy.data.objects.new('Swept airfoil',me);bpy.context.collection.objects.link(o);finish(o,o.name,white)
tube('Carbon leading edge',(0,.79,0),(1.99,-.25,0),.026,dark);tube('Aileron hinge',(.3,-.66,.047),(1.7,-.66,.023),.014,silver);box('Wing root spar',(.045,0,0),(.09,1.5,.12),dark)
box('Identification stripe',(1.4,-.43,.03),(.22,.48,.018),orange,.002);finalize('wing')
build('wheel',(.34,.7,.7));cyl('Tire',(0,0,0),.35,.30,black,'X')
for x in [-.16,.16]:cyl('Wheel rim',(x,0,0),.23,.025,silver,'X');cyl('Hub',(x*1.05,0,0),.10,.04,orange,'X')
for i in range(28):
 a=i*math.tau/28;o=box('Tread block',(0,.343*math.cos(a),.343*math.sin(a)),(.31,.065,.035),dark,.008);o.rotation_euler[0]=a
finalize('wheel')
build('truss',(1,1,1))
for x in [-.45,.45]:
 for z in [-.45,.45]:tube('Longeron',(x,-.5,z),(x,.5,z),.04,silver)
for y in [-.46,.46]:
 for z in [-.45,.45]:tube('Cross member',(-.45,y,z),(.45,y,z),.045,dark)
 for x in [-.45,.45]:tube('Cross member',(x,y,-.45),(x,y,.45),.045,dark)
for z in [-.45,.45]:tube('Diagonal brace',(-.45,-.45,z),(.45,.45,z),.028,silver);tube('Diagonal brace',(.45,-.45,z),(-.45,.45,z),.028,silver)
for x in [-.45,.45]:tube('Diagonal brace',(x,-.45,-.45),(x,.45,.45),.028,silver)
finalize('truss')
build('solar',(2,1,.08));box('Array frame',(0,0,0),(2,1,.06),silver)
for x in range(8):
 for y in range(4):
  xx=-.87+x*.25;yy=-.36+y*.24;box('Solar cell',(xx,yy,.035),(.225,.215,.02),cell,.004)
  for j in [-.06,0,.06]:box('Cell busbar',(xx+j,yy,.047),(.004,.20,.003),gold,0)
finalize('solar')
build('pontoon',(1,3,.8));o=lathe('Sealed displacement hull',[(-1.5,0),(-1.35,.29),(-1,.45),(.9,.45),(1.28,.3),(1.5,.02)],white)
for y in [-.7,.7]:ring(y,.456,.11,orange)
box('Mounting saddle',(0,0,.4),(.55,1.5,.10),dark);box('Deck plate',(0,0,.47),(.45,.7,.04),silver);finalize('pontoon')
build('ballast',(1.25,1,1.25));cyl('Pressure tank',(0,0,0),.58,.9,dark);ring(-.45);ring(.45);bolts(.49)
for y in [-.25,.25]:ring(y,.59,.08,orange)
ports(0);tube('Flood manifold',(-.35,-.42,.51),(-.35,.42,.51),.045,silver);finalize('ballast')
build('propeller',(.8,.5,.8));cyl('Drive housing',(0,.1,0),.18,.3,dark);cyl('Prop shaft',(0,-.12,0),.08,.3,silver)
for i in range(5):
 a=i*math.tau/5;o=box('Hydrodynamic blade',(.23*math.cos(a),-.19,.23*math.sin(a)),(.34,.045,.12),gold,.05);o.rotation_euler[1]=-a;o.rotation_euler[2]=.25
cyl('Spinner',(0,-.22,0),.12,.08,orange);finalize('propeller')

manifest={id:{'file':id+'.glb','dimensions':p['dimensions'],'coordinates':'Y up / nose +Y; meters','origin':'wing attachment at x=0; others centered' if id=='wing' else 'center'} for id,p in parts.items()}
with open(os.path.join(OUT,'manifest.json'),'w') as f:json.dump(manifest,f,indent=2)
# Preserve editable geometry and provide a studio contact sheet.
for i,(id,p) in enumerate(parts.items()):
 x=(i%5-2)*3.1;y=(i//5-1)*3.4
 for o in p['objects']:o.location+=Vector((x,y,1.65))
 font=bpy.data.curves.new(id+' label','FONT');font.body=id.upper();font.align_x='CENTER';font.size=.23;ob=bpy.data.objects.new(id+' label',font);bpy.context.collection.objects.link(ob);ob.location=(x,y-1.25,.03);ob.data.materials.append(white)
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.data.materials.append(mat('Studio slate',(.022,.035,.052),.15,.5))
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.21,.29,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5
for pos,power,size in [((2,-6,14),2600,9),((-8,-2,9),1800,8),((1,9,12),3000,8)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(9,-16,20));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=19;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.filepath=os.path.join(ROOT,'assets-source','parts-preview.png');bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets-source','orbital-parts.blend'));bpy.ops.render.render(write_still=True)
print('COMPLETE: 15 GLB parts, source blend, manifest, preview')
