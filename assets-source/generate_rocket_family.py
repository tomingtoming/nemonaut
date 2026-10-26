"""Original 0.625 / 1.25 / 2.5 m rocket family. Run in a separate Blender process.
Reuses the established material/mesh helpers, never regenerates legacy exports.
"""
from pathlib import Path
import bmesh
source=Path(__file__).with_name('generate_parts.py').read_text(encoding='utf-8')
helpers=source.split("build('tank',(1.25,2,1.25))")[0]
helpers=helpers.replace("if id=='engine':", "if id.startswith('engine'):")
exec(compile(helpers,str(Path(__file__).with_name('generate_parts.py')),'exec'))
bpy.context.scene.unit_settings.system='METRIC'

def export_part(ident):
 for o in parts[ident]['objects']:
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
 finalize(ident)
 # Free shared animation node names before the next asset export.
 for o in parts[ident]['objects']:o.name=ident+'.'+o.name

for ident,d,h in [('tankSmall',.625,1),('tankLarge',2.5,4)]:
 build(ident,(d,h,d));r=d/2
 lathe('Insulated pressure vessel',[(-h/2,r*.9),(-h/2+.07,r*.97),(h/2-.07,r*.97),(h/2,r*.9)],white,n=96)
 for y in [-h/2+.035,h/2-.035]:ring(y,r,.07,silver);bolts(y,r*.86,16)
 for y in [-h*.39,h*.39]:ring(y,r*.98,.05,orange)
 for i in range(8 if d>1 else 4):
  a=math.tau*i/(8 if d>1 else 4);rr=r*.974
  path('Insulation panel seam',[(rr*math.cos(a),-h*.36,rr*math.sin(a)),(rr*math.cos(a),h*.36,rr*math.sin(a))],.004,dark)
 for x in [-r*.28,r*.28]:tube('External feed manifold',(x,-h*.4,r*.93),(x,h*.4,r*.93),d*.018,silver)
 box('Recessed service plate',(0,h*.08,r*.975),(d*.25,h*.22,.018),dark)
 for i in range(4):box('Service cover rib',(0,h*.02+i*h*.04,r*.99),(d*.21,h*.012,.012),silver,.002)
 export_part(ident)

for ident,top,bottom,h in [('adapterSmall',.625,1.25,.6),('adapterLarge',1.25,2.5,1)]:
 build(ident,(bottom,h,bottom));rt=top/2;rb=bottom/2
 lathe('Conical load bearing shell',[(-h/2,rb*.98),(-h*.4,rb*.98),(h*.4,rt*.98),(h/2,rt*.98)],white,n=96)
 ring(-h/2+.025,rb,.05,silver);ring(h/2-.025,rt,.05,silver)
 for i in range(16):
  a=i*math.tau/16
  tube('Tapered structural stiffener',(rb*.97*math.cos(a),-h*.38,rb*.97*math.sin(a)),(rt*math.cos(a),h*.38,rt*math.sin(a)),.009,silver)
 bolts(-h/2+.02,rb*.9,16);bolts(h/2-.02,rt*.86,12)
 ring(h*.39,rt,.035,orange);export_part(ident)

for ident,d,h in [('decouplerSmall',.625,.16),('decouplerLarge',2.5,.32)]:
 build(ident,(d,h,d));r=d/2
 hoop('Hollow separation collar',0,r*.96,h*.8,dark)
 for y in [-h*.4,h*.4]:hoop('Mating flange',y,r,h*.2,silver)
 for i in range(12):
  a=i*math.tau/12
  o=box('Pyrotechnic cover',(r*.94*math.cos(a),0,r*.94*math.sin(a)),(d*.09,h*.55,.035),orange,.008);o.rotation_euler[2]=-a-math.pi/2
 bolts(h*.4,r*.85,12);export_part(ident)

for suffix,d,hs,hv in [('Small',.625,.8,1),('Medium',1.25,1.4,1.8),('Large',2.5,2.4,3)]:
 for vacuum,h in [(False,hs),(True,hv)]:
  ident='engine'+('Vac' if vacuum else 'Sea')+suffix;build(ident,(d,h,d));r=d/2
  # Tall vacuum extension versus a short, narrow sea-level bell.
  exit_r=r*(.94 if vacuum else .66);throat=r*.21;y0=-h*.5;yt=h*.15
  ring(h*.5-.025,r,.05,dark);ring(h*.5-.07,r*.94,.045,orange)
  cyl('Combustion chamber',(0,h*.26,0),r*.24,h*.26,dark)
  profile=[(y0,exit_r),(y0+h*.12,exit_r*.94),(-h*.12,exit_r*.66),(h*.06,throat*1.12),(yt,throat)]
  thickness=d*.018
  shell=profile+[(y,max(.01,rr-thickness)) for y,rr in reversed(profile)]+[profile[0]]
  hollow('Hollow regeneratively cooled bell',shell,silver if not vacuum else dark)
  hoop('Nozzle lip',y0+h*.012,exit_r,h*.024,silver)
  for i in range(40 if vacuum else 28):
   a=i*math.tau/(40 if vacuum else 28)
   path('Curved cooling channel',[(rr*math.cos(a),y,rr*math.sin(a)) for y,rr in profile],d*.004,gold if i%5==0 else silver)
  hoop('Throat clamp',yt,throat*1.12,h*.035,gold)
  for sign in [-1,1]:
   x=sign*r*.55
   ellipsoid('Turbopump casing',(x,h*.3,0),(r*.18,h*.12,r*.18),silver)
   path('Bent oxidizer feedline',[(x,h*.46,0),(x,h*.24,0),(x*.6,h*.11,0)],d*.026,orange)
   for z in [-r*.36,r*.36]:tube('Gimbal truss',(x,h*.44,z),(sign*r*.2,yt,z*.4),d*.022,dark)
  export_part(ident)

# Additional exports have their own editable Blender source and manifest.
with open(os.path.join(OUT,'rocket-family-manifest.json'),'w') as f:
 json.dump({k:{'dimensions':v['dimensions'],'file':k+'.glb'} for k,v in parts.items()},f,indent=2)
for i,(ident,p) in enumerate(parts.items()):
 x=(i%4-1.5)*4;y=(i//4-1)*5
 for o in p['objects']:o.location=Vector((x,y,2.3));o.rotation_euler[0]=math.radians(-25) if ident.startswith('engine') else 0
 font=bpy.data.curves.new(ident+' label','FONT');font.body=ident; font.align_x='CENTER';font.size=.21
 ob=bpy.data.objects.new(ident+' label',font);bpy.context.collection.objects.link(ob);ob.location=(x,y-1.9,.02);ob.data.materials.append(white)
bpy.ops.mesh.primitive_plane_add(size=100);bpy.context.object.data.materials.append(mat('Studio',(.025,.035,.05),.2,.5))
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('Rocket studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.2,.25,.32,1)
for pos,power in [((4,-8,16),3500),((-9,-1,10),2500),((0,10,15),4000)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=9;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(9,-18,19));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=21;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1500;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets-source','rocket-family.blend'))
scene.render.filepath=os.path.join(ROOT,'artifacts','rocket-family165.png');bpy.ops.render.render(write_still=True)
print('COMPLETE rocket family: '+str(len(parts)))
