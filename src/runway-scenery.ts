import * as T from 'three';
import {PLANET} from './planet.js';
import {RUNWAY} from './runway-navigation.js';

type Strip = [x: number, z: number, width: number, length: number];
function pavement(parent: T.Group, name: string, color: number, height: number, strips: Strip[]) {
  const vertices: number[] = [];
  for (const [x, z, width, length] of strips) {
    for (const [u, v] of [
      [-1, -1],
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, 1],
      [1, -1]
    ]) {
      const px = x + (u * width) / 2,
        pz = z + (v * length) / 2;
      vertices.push(px, height - (px * px + pz * pz) / (2 * PLANET.radius), pz);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial({color, roughness: 0.9}));
  mesh.name = name;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

// Segments run clockwise from the top, followed by the middle bar.
// Local coordinates are right and forward as seen on final approach.
const bars: Strip[] = [
  [0, 5, 2.8, 0.7],
  [1.1, 2.5, 0.6, 5],
  [1.1, -2.5, 0.6, 5],
  [0, -5, 2.8, 0.7],
  [-1.1, -2.5, 0.6, 5],
  [-1.1, 2.5, 0.6, 5],
  [0, 0, 2.8, 0.7]
];
const digits = {'0': '012345', '9': '012356', '2': '01346', '7': '012'} as const;

export function addRunwayMarkings(site: T.Group) {
  const edge = RUNWAY.width / 2;
  const apron = 43; // 0.5 m inside the SPH apron, in runway-site coordinates.
  pavement(site, 'SPH taxiway', 0x44494a, 0.025, [[(edge + apron) / 2, 0, apron - edge, 15]]);
  pavement(site, 'Taxiway centerline', 0xe6bd4a, 0.04, [[(edge + apron) / 2, 0, apron - edge, 0.24]]);
  const paint: Strip[] = [];
  for (let z = RUNWAY.center - RUNWAY.length / 2 + 65; z < RUNWAY.center + RUNWAY.length / 2 - 60; z += 22)
    paint.push([0, z, 0.25, 8]);
  pavement(site, 'Runway centerline', 0xd8d7bd, 0.04, paint);
  for (const end of [
    ['0', '9'],
    ['2', '7']
  ] as const) {
    const forward = end[0] === '0' ? 1 : -1;
    const threshold = RUNWAY.center - (forward * RUNWAY.length) / 2;
    const marks: Strip[] = [];
    for (const x of [-5.7, -3.4, 3.4, 5.7]) marks.push([x, threshold + forward * 10, 1, 12]);
    for (const [i, digit] of end.entries()) {
      for (const bar of digits[digit]) {
        const [x, z, width, length] = bars[Number(bar)];
        marks.push([-forward * (x + (i - 0.5) * 4.3), threshold + forward * (34 + z), width, length]);
      }
    }
    pavement(site, 'Runway ' + end.join(''), 0xe8e5d5, 0.04, marks);
  }
}
