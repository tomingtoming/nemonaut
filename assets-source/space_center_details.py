"""Executed by generate_space_center.py in its Blender scene/helper namespace."""
foliage=mat('Coastal tree canopy',(.12,.24,.115));bark=mat('Tree trunks',(.22,.16,.10));paving=mat('Paving stone',(.49,.51,.46));yellow=mat('Taxiway yellow',(.95,.63,.08));black=mat('Rubber',(.025,.03,.03));light=mat('Airfield lamps',(.85,.92,.75));p=light.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(.85,.92,.75,1);p.inputs['Emission Strength'].default_value=2
def beam(name,a,b,r,material):
 a,b=Vector(a),Vector(b);o=cyl(name,r,(b-a).length,(a+b)/2,material,8);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def label(text,pos,size,material,vertical=False):
 c=bpy.data.curves.new(text,'FONT');c.body=text;c.size=size;c.align_x='CENTER';c.extrude=.015;o=bpy.data.objects.new(text,c);bpy.context.collection.objects.link(o);o.location=pos;o.data.materials.append(material)
 if vertical:o.rotation_euler[0]=math.pi/2
 if parent:o.parent=parent
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
def building(name,x,y,w,d,h):
 box(name+' plinth',(w+2,d+2,.5),(x,y,1.25),concrete)
 box(name,(w,d,h),(x,y,1.5+h/2),white,.2)
 box(name+' roof',(w+1,d+1,.5),(x,y,h+1.8),steel)
 for z in range(4,int(h)+1,4):
  box(name+' front glazing',(w-3,.2,1.8),(x,y-d/2-.12,z),glass)
  box(name+' side glazing',(.2,d-3,1.8),(x+w/2+.12,y,z),glass)
 for xx in range(int(x-w/2)+2,int(x+w/2),4):box(name+' facade mullion',(.2,.4,h-2),(xx,y-d/2-.25,h/2+2),concrete)
 for xx in [-w/4,w/4]:box(name+' air handler',(3,4,1.4),(x+xx,y,h+2.7),concrete,.1)
def car(x,y,color=white,truck=False):
 box('Service vehicle chassis',(2.2,5 if truck else 4,1),(x,y,1.9),color,.15)
 box('Vehicle cabin',(2,2,1),(x,y-1,2.8),color,.15)
 box('Vehicle windshield',(1.8,.1,.6),(x,y-2.06,2.9),glass)
 for dx in [-1.1,1.1]:
  for dy in [-1.4,1.4]:
   o=cyl('Vehicle wheel',.5,.28,(x+dx,y+dy,1.6),black,12);o.rotation_euler[1]=math.pi/2
def tree(x,y,h=7,ground=1):
 cyl('Shelterbelt trunk',.35,h*.6,(x,y,ground+h*.3),bark,8)
 for dx,dy,z,r in [(0,0,h*.7,h*.37),(-1,0,h*.5,h*.25),(1,.6,h*.6,h*.28)]:
  bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=r,location=(x+dx,y+dy,ground+z));attach(bpy.context.object,'Wind shaped coastal tree',foliage)
def roadlink(a,b,width=8):
 x,y=a;xx,yy=b;length=math.hypot(xx-x,yy-y);o=box('Campus connecting road',(width,length,.1),((x+xx)/2,(y+yy)/2,1.07),road);o.rotation_euler[2]=-math.atan2(xx-x,yy-y)
 for i in range(1,int(length/12)):
  t=i*12/length;o=box('Road dash',(.18,4,.015),(x+(xx-x)*t,y+(yy-y)*t,1.13),paint);o.rotation_euler[2]=-math.atan2(xx-x,yy-y)
parent=bpy.data.objects['vab']
label('VAB',(-62,-6.85,57),5,white,True)
for x in range(-77,-45,4):box('Assembly wall panel rib',(.14,32,.25),(x,10,65.65),steel)
for y in range(-3,25,4):
 box('High bay side ribs',(.3,.22,58),(-43.7,y,33),steel)
 box('High bay clerestory',(.35,2.6,3),(-43.6,y,61),glass)
for z in [12,25,38,51]:
 box('Side maintenance walkway',(2,31,.22),(-81,10,z),steel)
 for y in range(-4,26,3):beam('Walkway guard post',(-81.8,y,z),(-81.8,y,z+1),.06,white)
 beam('Walkway railing',(-81.8,-5,z+1),(-81.8,25,z+1),.06,white)
box('VAB transporter deck',(14,18,2),(-62,-30,2.4),steel,.3)
for x in [-69,-55]:
 for y in [-36,-24]:box('Crawler track',(3,6,1.6),(x,y,1.9),black,.4)
for x in [-67,-57]:box('Crawler support',(1,15,1.2),(x,-30,4),yellow)
parent=bpy.data.objects['sph']
label('SPH',(62,-77.65,23),4,white,True)
for y in [-74,-68,-62,-56,-50,-44,-36]:
 for i in range(24):
  a=math.pi*i/24;b=math.pi*(i+1)/24
  beam('Hangar curved roof seam',(62+30.15*math.cos(a),y,18+14.15*math.sin(a)),(62+30.15*math.cos(b),y,18+14.15*math.sin(b)),.08,steel)
for x in [40,62,84]:
 box('Hangar apron stand line',(.2,13,.02),(x,-86,1.52),yellow)
 box('Hangar apron stop bar',(7,.2,.02),(x,-92,1.52),yellow)
car(93,-87,orange,True);car(86,-86)
parent=bpy.data.objects['tracking']
building('Mission operations',-175,-13,32,22,12)
label('MISSION CONTROL',(-175,-24.2,11),1.4,white,True)
for x,y in [(-151,20),(-122,28),(-160,47)]:
 cyl('Dish concrete apron',11,.15,(x,y,1.1),paving)
 for a in range(0,360,60):
  t=math.radians(a);beam('Reflector feed support',(x+8.8*math.cos(t),y+8.8*math.sin(t),13.8),(x,y,17.5),.09,steel)
parent=None
building('Administration',-118,-87,35,23,12)
building('Research wing',-170,-87,39,24,9)
building('Research cleanroom',-200,-82,16,34,15)
label('FLIGHT RESEARCH',(-170,-99.2,8),1.5,white,True)
building('Fire and rescue',-14,-92,28,18,7)
for x in [-23,-14,-5]:box('Rescue bay shutter',(7,.3,5),(x,-101.2,4),steel);car(x,-108,orange,True)
# Tower overlooks the taxiway; all glazing follows its octagonal cab.
cyl('Air traffic tower stem',3,22,(107,-47,12),concrete,8)
cyl('Air traffic balcony',7,1,(107,-47,23),steel,8)
cyl('Air traffic glazed cab',5.8,4,(107,-47,25.5),glass,8)
cyl('Air traffic roof',6.5,.7,(107,-47,28),white,8)
beam('Tower antenna',(107,-47,28),(107,-47,34),.1,steel)
for a in range(8):
 t=math.tau*a/8;beam('Cab window mullion',(107+5.8*math.cos(t),-47+5.8*math.sin(t),23.5),(107+5.8*math.cos(t),-47+5.8*math.sin(t),27.5),.12,white)
# Separated crawlerway, street network, parking and pedestrian approaches.
roadlink((-62,-40),(0,-40),14);roadlink((0,-40),(0,66),14);roadlink((0,66),(68,66),14)
for x in [-4,4]:box('Crawlerway gravel track',(3,106,.04),(x,13,1.16),sand)
roadlink((-215,-53),(-215,53));roadlink((-215,53),(-112,53));roadlink((-118,-53),(-118,-70));roadlink((-170,-53),(-170,-69));roadlink((-14,-53),(-14,-80))
box('Staff parking',(46,26,.12),(-170,-38,1.12),road)
for x in range(-190,-147,4):
 for y in [-47,-31]:box('Parking bay stripe',(.14,6,.02),(x,y,1.2),paint)
for x,y in [(-188,-44),(-180,-44),(-172,-44),(-160,-44),(-184,-30),(-168,-30),(-152,-30)]:car(x,y,white if x%3 else steel)
for x in range(-205,21,24):
 cyl('Street light pole',.16,8,(x,-61,5),steel,8);beam('Street light arm',(x,-61,9),(x,-58,9),.12,steel);box('Street luminaire',(1,2,.2),(x,-58,9),light)
for x in range(-210,20,20):tree(x,-118,6+(x%3))
for y in range(-115,100,18):tree(-235,y,7)
for x in range(-200,10,20):tree(x,94,6)
# Fuel depot behind the launch area, with pipes and containment berm.
box('Fuel depot containment',(50,30,1),(25,108,1.5),concrete)
for x in [8,24,40]:
 cyl('Propellant storage',5,13,(x,108,8.5),white)
 for z in [3,9,14]:cyl('Tank retaining band',5.08,.2,(x,108,z),steel)
 beam('Fuel manifold',(x,108,2),(x,92,2),.3,steel)
beam('Fuel transfer header',(8,92,2),(60,92,2),.4,steel)
for x in [-5,55]:box('Depot retaining wall',(.6,30,2),(x,108,2),concrete)
# Runway edge lighting and painted numbers, no false interactive facilities.
parent=bpy.data.objects['runway']
for x in range(-118,180,10):
 for y in [-157,-133]:cyl('Runway edge beacon',.22,.3,(x,y,1.3),light,8)
label('09',(-92,-149,1.24),5,paint);label('27',(150,-149,1.24),5,paint)
for y in range(-127,-94,8):box('Taxiway center line',(.3,5,.02),(60,y,1.2),yellow)
parent=None
# Breakwater and irregular rock edge soften the mainland/ocean boundary.
random.seed(167)
for i in range(85):
 y=-280+i*7;x=230+15*math.sin((y+40)/170)
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=random.uniform(1.4,3),location=(x+random.uniform(3,12),y,-.4));o=attach(bpy.context.object,'Coastal boulder',concrete);o.scale.z=.6
for x,y in [(180,15),(190,25),(180,35),(172,27)]:tree(x,y,5)
# Low dunes and wooded hills inland provide a horizon and a sense of scale.
meadow=mat('Dune meadow',(.29,.36,.20));hillgreen=mat('Inland vegetation',(.19,.29,.17))
def hill_height(x,y):
 edge=max(0,min(1,(y-120)/90,(800-y)/100,(150-x)/100,(x+900)/100))
 height=sum(h*math.exp(-((x-cx)/sx)**2-((y-cy)/sy)**2) for cx,cy,sx,sy,h in [(-380,380,210,180,45),(-70,480,160,170,60),(-650,570,220,150,75)])
 return .96+height*edge*edge
v=[];f=[];nx,ny=70,48
for j in range(ny+1):
 y=120+j*680/ny
 for i in range(nx+1):
  x=-900+i*1050/nx;v.append((x,y,hill_height(x,y)))
for j in range(ny):
 for i in range(nx):
  a=j*(nx+1)+i;f.append((a,a+1,a+nx+2,a+nx+1))
m=bpy.data.meshes.new('Continuous coastal terrain');m.from_pydata(v,[],f);m.update();o=bpy.data.objects.new('Continuous coastal terrain',m);bpy.context.collection.objects.link(o);attach(o,'Continuous coastal terrain',hillgreen)
for face in m.polygons:face.use_smooth=True
for i in range(70):
 x=random.uniform(-280,120);y=random.uniform(145,205)
 if x>-230:tree(x,y,random.uniform(5,9),hill_height(x,y))
# Small familiar objects make the scale of the industrial buildings legible.
beam('Flag pole',(-29,-28,1),(-29,-28,14),.12,steel)
box('Flag cloth',(4,.07,2),(-27,-28,12.6),orange)
beam('Windsock mast',(100,-116,1),(100,-116,7),.09,steel)
for i in range(5):
 a=(100+i*.5,-116,7-i*.1);b=(100+(i+1)*.5,-116,7-(i+1)*.1)
 beam('Windsock striped sleeve',a,b,.38-i*.045,orange if i%2==0 else white)
