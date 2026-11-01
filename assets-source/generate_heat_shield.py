"""HS-20, 2 m convex ablative shield. Game -Y / Blender -Z faces the flow."""
import bpy, math, os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,rough=.6):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
char=mat('Charcoal ablative substrate',(.043,.029,.022),0,.94)
tiles=[mat('Phenolic tile '+str(i),(.16+i*.009,.092+i*.006,.048+i*.004),0,.88) for i in range(5)]
metal=mat('Titanium mounting rim',(.31,.34,.36),.85,.35)
ivory=mat('Insulated rear bulkhead',(.74,.72,.64),.12,.55)
def cyl(name,r,depth,z,material):
 bpy.ops.mesh.primitive_cylinder_add(vertices=128,radius=r,depth=depth,location=(0,0,z));o=bpy.context.object;o.name=name;o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 return o
cyl('Structural backing',.985,.12,.035,char)
cyl('Rear insulated disk',.94,.035,.103,ivory)
cyl('Stack mounting flange',.625,.04,.12,metal)
def tile(name,inner,outer,start,end,material):
 segments=max(4,int((end-start)*64));verts=[]
 for radius in [inner,outer]:
  for i in range(segments+1):
   a=start+(end-start)*i/segments;verts.append((radius*math.cos(a),radius*math.sin(a),-.14+.105*radius*radius))
 n=segments+1;faces=[(i,i+1,n+i+1,n+i) for i in range(segments)]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(material)
 for p in mesh.polygons:p.use_smooth=True
 solid=o.modifiers.new('Tile depth','SOLIDIFY');solid.thickness=.018;solid.offset=1
 return o
tile('Continuous dark substrate',0,1,0,math.tau,char)
tile('Central replaceable plug',0,.16,0,math.tau,tiles[2])
for ring,(lo,hi,num) in enumerate([(.164,.36,12),(.364,.61,20),(.614,.82,28),(.824,.992,36)]):
 for i in range(num):
  a=math.tau*i/num+ring*.087;gap=.003/lo
  tile('Ablator course %d tile %02d'%(ring,i),lo,hi,a+gap,a+math.tau/num-gap,tiles[(i+ring*2)%5])
for r,z in [(.975,.060),(.64,.114)]:
 bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=.009,major_segments=128,minor_segments=10,location=(0,0,z));o=bpy.context.object;o.name='Rear reinforcement bead';o.data.materials.append(metal)
 for p in o.data.polygons:p.use_smooth=True
for i in range(16):
 a=math.tau*i/16;o=cyl('Recessed flange fastener',.015,.009,.124,metal);o.location.x=.57*math.cos(a);o.location.y=.57*math.sin(a)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'assets-source','heat-shield.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'src/assets/parts','heatShield.glb'),export_format='GLB',export_yup=True)
