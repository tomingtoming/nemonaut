import * as T from 'three';
// Keep the nozzle exit fixed while scaling the plume along its exhaust axis.
export interface EnginePlumeDefinition {
  size: readonly number[];
  thrust?: number;
  air?: boolean;
  gimbalPivot?: readonly number[];
}
function gimbalPivotY(d: EnginePlumeDefinition): number {
  if (!d.gimbalPivot) throw Error('ジンバル支点が定義されていません');
  return d.gimbalPivot[1];
}
export function createEnginePlume(
  definition: EnginePlumeDefinition,
  gimballed = false
): T.Mesh<T.ConeGeometry, T.MeshBasicMaterial> {
  const diameter = definition.size[0] / 1.25,
    length = (definition.air ? 2 : 2.8) * diameter,
    geometry = new T.ConeGeometry(0.32 * diameter, length, 20, 4);
  geometry.rotateZ(Math.PI);
  geometry.translate(0, -length / 2, 0);
  const position = geometry.attributes.position,
    colors: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const t = Math.min(1, Math.max(0, -position.getY(i) / length)),
      color = new T.Color(definition.air ? '#e5fbff' : '#fff5cf').lerp(
        new T.Color(definition.air ? '#399dff' : '#ff7524'),
        t
      );
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  const mesh = new T.Mesh(
    geometry,
    new T.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false
    })
  );
  mesh.position.y = -definition.size[1] / 2 - (gimballed ? gimbalPivotY(definition) : 0);
  mesh.userData.nominalThrust = definition.thrust;
  mesh.renderOrder = 5;
  mesh.visible = false;
  return mesh;
}

// Use delivered thrust, including fuel starvation, atmospheric loss and thrust limits.
export function updateEnginePlume(mesh: T.Object3D, thrust: number, crashed: boolean, now: number): void {
  const ratio = Math.min(1, Math.max(0, thrust / (mesh.userData.nominalThrust || 1)));
  mesh.visible = thrust > 1 && !crashed;
  mesh.scale.y = 0.5 + ratio * (1 + Math.sin(now * 0.09) * 0.08);
}
