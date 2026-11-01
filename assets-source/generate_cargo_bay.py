"""Original modular cargo shell; isolated Blender process. Game axes: Y axial, +Z hatch."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent.parent
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color,metal=0,rough=.4):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
white=material('Ceramic white',(.72,.78,.8),.3)
dark=material('Graphite seals',(.035,.05,.065),.2)
metal=material('Brushed titanium',(.27,.34,.39),.75)
inner=material('Interior liner',(.35,.42,.46),.4)
gold=material('Safety amber',(.95,.46,.035),.35)
def xyz(p):return (p[0],-p[2],p[1])
def box(name,center,size,mat,parent=None,bevel=.025):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(center));o=bpy.context.object;o.name=name
 o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(mat)
 if bevel:
  b=o.modifiers.new('Machined edge','BEVEL');b.width=bevel;b.segments=3
  bpy.ops.object.modifier_apply(modifier=b.name)
  n=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=n.name)
 o.parent=parent
 return o
def arc(name,a,b,outer,thickness,length,parent,mat=white):
 N=max(8,round((b-a)*32));verts=[]
 for y in [-length/2,length/2]:
  for r in [outer,outer-thickness]:
   for i in range(N+1):
    theta=a+(b-a)*i/N;verts.append(xyz((r*math.sin(theta),y,r*math.cos(theta))))
 faces=[];materials=[];stride=2*(N+1)
 for i in range(N):
  faces.append((i,i+1,stride+i+1,stride+i));materials.append(0)
  j=N+1+i;faces.append((j,stride+j,stride+j+1,j+1));materials.append(1)
  for end in [0,stride]:faces.append((end+i,end+i+N+1,end+i+N+2,end+i+1));materials.append(2)
 for i in [0,N]:faces.append((i,i+N+1,stride+i+N+1,stride+i));materials.append(2)
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.parent=parent
 for m in [mat,inner,metal]:mesh.materials.append(m)
 for poly,index in zip(mesh.polygons,materials):poly.material_index=index;poly.use_smooth=index<2
 return obj
root=bpy.data.objects.new('CargoBayFrame',None);bpy.context.collection.objects.link(root)
arc('Lower pressure shell',math.pi/2,3*math.pi/2,2.993,.3,9.6,root)
for y in [-4.55,-3,-1.5,0,1.5,3,4.55]:
 rib=arc('Interior ring frame',math.pi/2,3*math.pi/2,2.72,.09,.09,root,metal);rib.location.z=y
for x in [-1.5,1.5]:box('Deck support',[x,0,-2.48],[.1,9.2,.3],metal,root)
box('Payload deck',[0,0,-2.38],[3,9.2,.16],inner,root)
for x in [-1.1,1.1]:box('Payload rail',[x,0,-2.28],[.1,9.0,.04],metal,root,.01)
for y in [-3,0,3]:
 box('Mount surround',[0,y,-2.295],[.45,.45,.01],gold,root,.002)
 box('Mount socket',[0,y,-2.285],[.23,.23,.01],dark,root,.002)
for y in [-4.3,4.3]:
 band=arc('Lower amber band',math.pi/2,3*math.pi/2,3.0,.009,.12,root,gold);band.location.z=y
for x in [-2.9,2.9]:box('Hatch guide rail',[x,0,0],[.13,9.6,.13],metal,root)
doors=[]
for name,side,a,b in [('CargoDoorLeft',-1,-math.pi/2,0),('CargoDoorRight',1,0,math.pi/2)]:
 door=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(door);doors.append((door,side))
 arc('Curved hatch',a,b,2.993,.3,9.6,door)
 for y in [-4.3,4.3]:
  band=arc('Hatch amber band',a,b,3.0,.009,.12,door,gold);band.location.z=y
 for y in [-4.55,-2.2,0,2.2,4.55]:
  rib=arc('Hatch inner brace',a,b,2.72,.08,.07,door,metal);rib.location.z=y
  seam=arc('Panel seam',a,b,2.996,.005,.018,door,dark);seam.location.z=y
 box('Central gasket',[side*.012,0,2.985],[.018,9.5,.025],dark,door,.003)
bpy.context.scene.unit_settings.system='METRIC'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT/'src/assets/parts/cargoBay.glb'),export_format='GLB',use_selection=True,export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets-source/cargo-bay.blend'))
# Render the open shell for visual inspection, without changing the saved/exported default.
for door,side in doors:door.location.x=side*3
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1100;scene.render.resolution_y=850;scene.render.resolution_percentage=100
scene.world.color=(.18,.18,.18)
for loc,power,size in [((8,-10,16),2200,10),((-8,-2,8),1700,8),((2,12,8),2600,7)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=xyz((13,13,12)));cam=bpy.context.object;cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=18;scene.camera=cam
scene.render.filepath=str(ROOT/'artifacts/cargo261-blender-open.png');bpy.ops.render.render(write_still=True)
