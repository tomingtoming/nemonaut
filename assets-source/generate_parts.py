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
def lathe(name,profile,m,n=64,cap=True):
 vs=[P((r*math.cos(i*2*math.pi/n),y,r*math.sin(i*2*math.pi/n))) for y,r in profile for i in range(n)]
 fs=[]
 for j in range(len(profile)-1):
  for i in range(n):a=j*n+i;b=j*n+(i+1)%n;fs.append((a,b,b+n,a+n))
 if cap:fs.extend([tuple(reversed(range(n))),tuple((len(profile)-1)*n+i for i in range(n))])
 fs=[tuple(reversed(f)) for f in fs]
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
 bpy.context.view_layer.update()
 objs=parts[id]['objects'];dim=parts[id]['dimensions'];vs=[o.matrix_world@v.co for o in objs for v in o.data.vertices]
 lo=Vector(tuple(min(v[i] for v in vs) for i in range(3)));hi=Vector(tuple(max(v[i] for v in vs) for i in range(3)));center=(lo+hi)/2
 if id=='wing':center.x=lo.x
 scale=Vector((dim[0]/(hi.x-lo.x),dim[2]/(hi.y-lo.y),dim[1]/(hi.z-lo.z)))
 for o in objs:
  mw=o.matrix_world.copy()
  for v in o.data.vertices:
   p=mw@v.co-center;v.co=Vector((p.x*scale.x,p.y*scale.y,p.z*scale.z))
  o.location=(0,0,0);o.rotation_euler=(0,0,0);o.scale=(1,1,1)
 groups=[objs]
 if id=='engine':
  moving=[o for o in objs if any(o.name.startswith(n) for n in ['Hollow regeneratively','Nozzle lip','Curved cooling','Throat clamp'])]
  groups=[[o for o in objs if o not in moving],moving]
 joined=[]
 for index,group in enumerate(groups):
  bpy.ops.object.select_all(action='DESELECT')
  for o in group:o.select_set(True)
  bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();ob=bpy.context.object
  if id=='engine':ob.name='EngineMount' if index==0 else 'GimbalNozzle'
  joined.append(ob)
 parts[id]['objects']=joined
 bpy.ops.object.select_all(action='DESELECT')
 for ob in joined:ob.select_set(True)
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,id+'.glb'),export_format='GLB',use_selection=True,export_yup=True)

def hollow(name,profile,m):return lathe(name,profile,m,cap=False)
def hoop(name,y,r,h,m):return hollow(name,[(y-h/2,r),(y+h/2,r),(y+h/2,r-.045),(y-h/2,r-.045),(y-h/2,r)],m)
def ellipsoid(name,p,d,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,radius=1,location=P(p));o=bpy.context.object;o.scale=(d[0],d[2],d[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,name,m)
 for f in o.data.polygons:f.use_smooth=True
 return o
def path(name,points,r,m):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=2;s=cu.splines.new('POLY');s.points.add(len(points)-1)
 for v,p in zip(s.points,points):v.co=(*P(p),1)
 o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return finish(bpy.context.object,name,m)
def swept_blade(a,y,rmax,m):
 vs=[];fs=[]
 for i in range(10):
  t=i/9;r=.10+(rmax-.10)*t;theta=a+.60*t;w=.08*math.sin(math.pi*(.12+.8*t))
  for side in [-1,1]:
   ang=theta+side*w/r;vs.append(P((r*math.cos(ang),y+side*.028+.035*t,r*math.sin(ang))))
 for i in range(9):fs.append((i*2,i*2+1,i*2+3,i*2+2))
 me=bpy.data.meshes.new('Swept aerofoil blade');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(me.name,me);bpy.context.collection.objects.link(o);finish(o,me.name,m);mod=o.modifiers.new('Metal thickness','SOLIDIFY');mod.thickness=.009;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
def canopy(name,m,scale=1):
 # Integrated blister: rear shoulder at y=-.34, low windscreen at +.65.
 vs=[];fs=[];sections=[(-.68,.03,.50,.02),(-.52,.22,.52,.15),(-.30,.34,.53,.26),(-.02,.32,.48,.26),(.27,.24,.40,.19),(.52,.12,.28,.10),(.68,.012,.20,.01)]
 for y,w,z,h in sections:
  for i in range(17):
   a=math.pi*i/16;vs.append(P((w*math.cos(a)*scale,y,z+(h*math.sin(a))*scale)))
 for j in range(len(sections)-1):
  for i in range(16):a=j*17+i;fs.append((a+17,a+18,a+1,a))
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);finish(o,name,m)
 for f in me.polygons:f.use_smooth=True
 return sections

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
# Rounded window patches parameterized on the conical shell, not tilted boxes.
def window_point(theta,y,offset):
 r=.61-(y+.48)*(.30/.86)+offset
 return (r*math.sin(theta),y,r*math.cos(theta))
def curved_window(name,theta,width,height,offset,m):
 N=64;R=12;vs=[P(window_point(theta,.12,offset+.006))];fs=[]
 for j in range(1,R+1):
  t=j/R
  for i in range(N):
   a=math.tau*i/N;c=math.cos(a);s=math.sin(a)
   u=math.copysign(abs(c)**.5,c);v=math.copysign(abs(s)**.5,s)
   vs.append(P(window_point(theta+t*width*u,.12+t*height*v,offset+.006*(1-t*t))))
 for i in range(N):fs.append((0,1+i,1+(i+1)%N))
 for j in range(R-1):
  a=1+j*N;b=a+N
  for i in range(N):k=(i+1)%N;fs.append((a+i,b+i,b+k,a+k))
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);finish(ob,name,m)
 for face in me.polygons:face.use_smooth=True
for theta in [-.43,.43]:
 curved_window('Conformal window gasket',theta,.325,.165,.007,dark)
 curved_window('Curved laminated glazing',theta,.275,.139,.014,blue)
 contour=[]
 for i in range(65):
  a=math.tau*i/64;c=math.cos(a);s=math.sin(a)
  contour.append(window_point(theta+.303*math.copysign(abs(c)**.5,c),.12+.154*math.copysign(abs(s)**.5,s),.017))
 path('Shell-following titanium window rim',contour,.005,silver)
box('Hatch frame',(0,-.19,-.53),(.4,.37,.055),silver,.045);box('Hatch inset',(0,-.19,-.565),(.32,.30,.025),white,.035)
cyl('Docking cap',(0,.62,0),.18,.06,dark);finalize('capsule')

build('engine',(1.25,1.2,1.25))
ring(.55,.625,.1);bolts(.6);cyl('Turbopump housing',(0,.28,0),.20,.40,dark)
profile=[(-.6,.53),(-.48,.485),(-.29,.37),(-.10,.25),(.08,.17),(.18,.18),(.18,.14),(.08,.13),(-.10,.21),(-.29,.33),(-.48,.45),(-.6,.495),(-.6,.53)]
hollow('Hollow regeneratively cooled bell',profile,silver);hoop('Nozzle lip',-.585,.535,.03,dark)
for i in range(32):
 a=i*math.tau/32;path('Curved cooling channel',[(r*math.cos(a),y,r*math.sin(a)) for y,r in profile[:6]],.009,gold if i%4==0 else dark)
for x in [-.39,.39]:
 ellipsoid('Turbopump casing',(x,.27,0),(.13,.17,.13),silver);path('Bent oxidizer feedline',[(x,.48,0),(x,.19,0),(x,-.02,0),(x*.82,-.13,0)],.037,orange);tube('Gimbal support',(x,.48,.22),(x*.4,.14,.12),.036,dark)
hoop('Throat clamp',.12,.205,.06,gold);finalize('engine')
build('nose',(1.25,1,1.25));lathe('Ogive fairing',[(-.5,.625),(-.3,.60),(.0,.45),(.27,.23),(.48,.035),(.5,.0)],white);ring(-.47,.625,.06,orange);bolts(-.42);finalize('nose')
build('decoupler',(1.25,.22,1.25));cyl('Separation collar',(0,0,0),.60,.22,dark)
for y in [-.085,.085]:ring(y,.625,.045,silver)
for i in range(12):
 a=i*math.tau/12;o=box('Separation charge cover',(.60*math.cos(a),0,.60*math.sin(a)),(.13,.12,.06),orange);o.rotation_euler[2]=-a-math.pi/2
bolts(.105);finalize('decoupler')
build('probe',(1.25,.4,1.25));cyl('Octagonal avionics',(0,0,0),.61,.35,gold,verts=8);ring(-.17);ring(.17);bolts(.2)
for x in [-.25,.25]:box('Flight computer',(x,0,.53),(.28,.25,.12),dark);box('Computer plate',(x,0,.60),(.22,.19,.02),silver)
finalize('probe')
build('cockpit',(1.25,2,1.25));lathe('Aircraft nose',[(-1,.56),(-.8,.59),(-.5,.58),(-.2,.55),(.15,.47),(.45,.34),(.72,.20),(.94,.06),(1,.018)],white)
sections=canopy('Flush smoked canopy',blue)
for sign in [-1,1]:path('Canopy perimeter seal',[(sign*w,y,z+.006) for y,w,z,h in sections],.018,dark)
for idx in [1,4]:
 y,w,z,h=sections[idx];path('Curved canopy hoop',[(w*math.cos(i*math.pi/24),y,z+h*math.sin(i*math.pi/24)+.008) for i in range(25)],.014,silver)
path('Canopy rear spine',[(0,y,z+h+.006) for y,w,z,h in sections[:3]],.012,dark)
ring(-.95);hoop('Airframe service seam',-.72,.585,.025,orange)
for x in [-.39,.39]:path('Fuselage panel seam',[(x,-.65,.43),(x,-.2,.39),(x*.7,.3,.34)],.006,dark)
finalize('cockpit')
build('jet',(1.25,1.2,1.25))
hollow('Open nacelle',[(-.6,.39),(-.35,.54),(.35,.61),(.54,.625),(.60,.60),(.60,.54),(.53,.52),(.28,.50),(-.3,.34),(-.6,.29),(-.6,.39)],white)
hoop('Rounded intake lip',.565,.625,.075,silver);hoop('Exhaust ring',-.54,.40,.10,dark);hoop('Nacelle accent',-.28,.56,.065,orange)
cyl('Recessed fan chamber',(0,.06,0),.485,.035,black)
for i in range(18):swept_blade(i*math.tau/18,.25,.495,silver)
lathe('Spinner cone',[(.22,.13),(.30,.125),(.40,.09),(.48,.015)],dark)
for i in range(6):
 a=i*math.tau/6;path('Nacelle panel joint',[(r*math.cos(a),y,r*math.sin(a)) for y,r in [(-.24,.564),(.1,.596),(.36,.615)]],.004,dark)
finalize('jet')
build('wing',(2,1.6,.12))
# Swept tapered NACA-style closed cross sections, rounded leading edge and knife trailing edge.
vs=[];fs=[];N=25
for x in [0,.4,1.0,1.6,2.0]:
 lead=.8-.53*x;chord=1.6-.52*x
 for side in [1,-1]:
  for i in range(N):
   t=(1-math.cos(math.pi*i/(N-1)))/2;th=.12*(.2969*math.sqrt(t)-.126*t-.3516*t*t+.2843*t**3-.1036*t**4)*2.5*(1-.28*x)
   vs.append(P((x,lead-t*chord,side*th)))
for j in range(4):
 for side in range(2):
  for i in range(N-1):a=j*N*2+side*N+i;b=a+N*2;fs.append((a,b,b+1,a+1) if side==0 else (a,a+1,b+1,b))
for j in [0,4]:fs.append(tuple(j*N*2+i for i in list(range(N))+list(range(2*N-1,N-1,-1))))
me=bpy.data.meshes.new('Tapered airfoil');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(me.name,me);bpy.context.collection.objects.link(o);finish(o,me.name,white)
path('Leading edge metal',[(x,.8-.53*x,0) for x in [0,.4,1,1.6,2]],.012,silver)
for x in [.20,1.70]:path('Wing panel seam',[(x,.8-.53*x-(1.6-.52*x)*t,.12*(.2969*math.sqrt(t)-.126*t-.3516*t*t+.2843*t**3-.1036*t**4)*2.5*(1-.28*x)+.003) for t in [.08,.15,.25,.4,.6,.75]],.004,silver)
box('Wing root spar',(.035,-.0,0),(.07,1.53,.10),dark,.01)
path('Tip safety stripe',[(1.84,.8-.53*1.84-(1.6-.52*1.84)*t,.035) for t in [.15,.3,.5,.7]],.026,orange)
finalize('wing')
build('wheel',(.34,.7,.7))
o=hollow('Rounded pneumatic tire',[(-.145,.22),(-.16,.27),(-.14,.32),(-.09,.347),(.09,.347),(.14,.32),(.16,.27),(.145,.22),(-.145,.22)],black);o.rotation_euler[1]=math.pi/2
for x in [-.145,.145]:
 o=hoop('Forged rim',x,.23,.028,silver);o.rotation_euler[1]=math.pi/2
 cyl('Axle hub',(x,0,0),.08,.035,orange,'X')
 for i in range(8):
  a=i*math.tau/8;tube('Forged wheel spoke',(x,.075*math.cos(a),.075*math.sin(a)),(x,.218*math.cos(a+.15),.218*math.sin(a+.15)),.024,silver)
for i in range(36):
 a=i*math.tau/36
 for sign in [-1,1]:path('Chevron tread',[(sign*x,r*math.cos(a+t),r*math.sin(a+t)) for x,r,t in [(.0,.351,0),(.055,.351,.045),(.11,.336,.08)]],.011,dark)
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
 a=i*math.tau/5;o=box('Hydrodynamic blade',(.23*math.cos(a),-.19,.23*math.sin(a)),(.34,.045,.12),gold,.05);o.rotation_euler[2]=-a;o.rotation_euler[0]=.25
cyl('Spinner',(0,-.22,0),.12,.08,orange);finalize('propeller')

# Independent fixed tailplane and movable aerodynamic surfaces. Centered origins.
for ident,span,chord,thickness in [('stabilizer',1.8,.65,.09),('elevator',1.8,.4,.08),('aileron',1.4,.3,.07),('rudder',.8,.4,.07)]:
 build(ident,(span,chord,thickness))
 # Closed lenticular section; chord +Y, span X, hinge along leading edge.
 section=[(.5,0),(.38,.35),(.12,.5),(-.22,.30),(-.5,.02),(-.5,-.02),(-.22,-.30),(.12,-.5),(.38,-.35)]
 vs=[]
 for x in [-span/2,span/2]:
  for y,z in section:vs.append(P((x,y*chord,z*thickness)))
 n=len(section);faces=[tuple(reversed(range(n))),tuple(n+j for j in range(n))]
 for j in range(n):k=(j+1)%n;faces.append((j,k,n+k,n+j))
 me=bpy.data.meshes.new(ident+' aerodynamic shell');me.from_pydata(vs,[],faces);me.update();ob=bpy.data.objects.new(me.name,me);bpy.context.collection.objects.link(ob);finish(ob,me.name,white)
 if ident!='stabilizer':
  tube('Hinge barrel',(-span*.45,chord*.47,0),(span*.45,chord*.47,0),thickness*.18,silver)
  for x in [-span*.3,0,span*.3]:box('Actuator clevis',(x,chord*.34,0),(span*.045,chord*.2,thickness*.65),dark,.004)
  box('Control surface stripe',(span*.38,-chord*.22,thickness*.32),(span*.07,chord*.25,thickness*.06),orange,.002)
 finalize(ident)

manifest={id:{'file':id+'.glb','dimensions':p['dimensions'],'coordinates':'Y up / nose +Y; meters','origin':'wing attachment at x=0; others centered' if id=='wing' else 'center'} for id,p in parts.items()}
with open(os.path.join(OUT,'manifest.json'),'w') as f:json.dump(manifest,f,indent=2)
# Preserve editable geometry and provide a studio contact sheet.
for i,(id,p) in enumerate(parts.items()):
 x=(i%5-2)*3.1;y=(i//5-1.5)*3.4
 for o in p['objects']:o.location+=Vector((x,y,1.65))
 font=bpy.data.curves.new(id+' label','FONT');font.body=id.upper();font.align_x='CENTER';font.size=.23;ob=bpy.data.objects.new(id+' label',font);bpy.context.collection.objects.link(ob);ob.location=(x,y-1.25,.03);ob.data.materials.append(white)
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.data.materials.append(mat('Studio slate',(.022,.035,.052),.15,.5))
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.21,.29,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5
for pos,power,size in [((2,-6,14),2600,9),((-8,-2,9),1800,8),((1,9,12),3000,8)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(9,-16,20));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=22;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.filepath=os.path.join(ROOT,'assets-source','parts-preview.png');bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets-source','orbital-parts.blend'));bpy.ops.render.render(write_still=True)
# Second camera: close inspection of canopy, open nozzle, turbine, and wheel.
for p in parts.values():
 for o in p['objects']:o.hide_render=True
for o in bpy.data.objects:
 if o.type=='FONT':o.hide_render=True
for id,pos in [('capsule',(-2.3,-1.8,1.0)),('cockpit',(-2.3,0,1.15)),('engine',(0,0,1.15)),('jet',(2.3,0,1.15)),('wheel',(0,-2.0,.65)),('wing',(2,-2.4,.85))]:
 for ob in parts[id]['objects']:
  ob.hide_render=False;ob.location=pos
  if id=='engine':ob.rotation_euler[0]=math.pi*1.30
  if id=='jet':ob.rotation_euler[0]=math.pi*.20
cam.location=(6,-10,9);cam.rotation_euler=(Vector((.4,-.4,1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=8.8
scene.render.filepath=os.path.join(ROOT,'assets-source','detail-preview.png');bpy.ops.render.render(write_still=True)
print('COMPLETE: 19 GLB parts, source blend, manifest, preview')
