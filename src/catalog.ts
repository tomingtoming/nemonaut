import {installCargoParts} from './cargo-parts.js';
import {installLargeParts} from './large-parts.js';
/** Catalog entry: base parts below, large variants (large-parts.ts) and the cargo bay (cargo-parts.ts) are installed at load. */
export type PartDefinition = {
  name: string;
  code: string;
  cat: string;
  mass: number;
  size: number[];
  desc: string;
  fuel?: number;
  shroudSupport?: boolean;
  decoupler?: boolean;
  thrust?: number;
  /** Medium required for thrust; independent engines carry their reaction mass. */
  thrustMedium?: 'independent' | 'air' | 'water';
  oxidizerSource?: 'onboard' | 'atmosphere' | 'none';
  isp?: number;
  ispSeaLevel?: number;
  gimbal?: number;
  gimbalPivot?: number[];
  battery?: number;
  landingLeg?: boolean;
  heatShield?: boolean;
  /** Body drag approximation: circular faces normal to local Y, independent of thermal protection. */
  bodyDragShape?: 'disc-y';
  shieldRadius?: number;
  shieldNormal?: number[];
  ablator?: number;
  noseRadius?: number;
  maxTemperature?: number;
  docking?: boolean;
  dockFace?: number;
  monoprop?: number;
  rcsThrust?: number;
  rcsIsp?: number;
  control?: boolean;
  /** Onboard surface observation instrument; independent of command capability. */
  surfaceObservation?: boolean;
  reactionTorque?: number;
  /** Assembly-local control frame; legacy-auto preserves existing probe craft until explicit frame selection. */
  commandFrame?: 'axial' | 'forward' | 'legacy-auto';
  streamlinedNose?: boolean;
  /** Node whose outward normal is aligned opposite the target during initial placement. */
  placementNode?: number;
  /** Local Euler rotation after mirror reflection, independent of the part datum. */
  mirrorRotation?: PartVector;
  wing?: number;
  ac?: number[];
  massCenter?: number[];
  chord?: number;
  model?: string;
  /** Position of the centered GLB in the current assembly frame (metres). */
  modelCenter?: number[];
  controlAxis?: PartControlAxis;
  maxDeflection?: number;
  /** Local control-surface pivot; defaults to the upper Y face. */
  hingePivot?: number[];
  wheel?: boolean;
  /** Wheel motor capability, independent of the part name or vessel type. */
  poweredWheel?: boolean;
  /** Landing gear that folds away in flight (BACKLOG 9c): G toggles it for the whole vessel. */
  retractable?: boolean;
  steer?: boolean;
  parachute?: number;
  solarPower?: number;
  volume?: number;
  /** Dimensionless resistance multipliers along the part's local X/Y/Z axes. */
  waterResistance?: PartVector;
  /** Planing bottom area (m²); the supported face points along local -Z. */
  planingArea?: number;
  ballast?: number;
  attachmentNodes?: readonly AttachmentNode[];
  /** Local surface mounting point and outward normal; default is the lower Y face. */
  surfaceMount?: AttachmentNode;
  /** Circular stack interfaces at node 0 (+Y) and node 1 (-Y), in metres; null and other nodes remain unspecified. */
  stackDiameters?: readonly [number | null, number | null];
  /** Rectangular +Y/-Y interfaces, local X/Z extents in metres. Mutually exclusive with diameters. */
  stackRectangles?: readonly [readonly [number, number] | null, readonly [number, number] | null];
  cargoBay?: {wall: number};
  heatCapacity?: number;
  emissivity?: number;
  breakPressure?: number;
  collisionBoxes?: import('./cargo-geometry.js').CargoBox[];
};
/** String-keyed view of PARTS, including the large and cargo parts installed at load. */
export type PartCatalog = Record<string, PartDefinition>;
export type PartControlAxis = 'auto' | 'pitch' | 'roll' | 'yaw';
/** Part type id: a base key of PARTS, a large variant installed by large-parts.ts, or the cargo bay. */
export type PartType =
  keyof typeof BASE_PARTS | keyof typeof import('./large-parts.js').LARGE_VARIANTS | 'cargoBay';
export type PartVector = [number, number, number];
/** Attachment node [x,y,z,nx,ny,nz]; slice(0,3)/slice(3) give the position/normal triples. */
export type AttachmentNode = readonly [number, number, number, number, number, number];
/** Position and outward direction of an attachment node, in part coordinates. */
export const nodePoint = (n: AttachmentNode): PartVector => [n[0], n[1], n[2]];
export const nodeAxis = (n: AttachmentNode): PartVector => [n[3], n[4], n[5]];
export interface PartAttachment {
  mode: 'node' | 'surface' | 'free';
  parentNode?: number;
  ownNode?: number;
}
/** A placed part as created by part() and passed around the workshop, saves and flight. */
export interface Part {
  id: string;
  type: PartType;
  p: PartVector;
  r: PartVector;
  parent: string | null;
  stage: number;
  referenceDirection?: number;
  reactionEnabled?: boolean;
  steeringEnabled?: boolean;
  fuelEnabled?: boolean;
  gimbalEnabled?: boolean;
  driveEnabled?: boolean;
  controlEnabled?: boolean;
  dockPartner?: string;
  attachment?: PartAttachment;
  symmetryGroup?: string;
  symmetryFrame?: number[];
  cargoOpen?: boolean;
}
// The literal table keeps its keys for PartType; PARTS is its string-keyed view (the same object).
const BASE_PARTS = {
  tankSmall: {
    stackDiameters: [0.625, 0.625],
    shroudSupport: true,
    name: '小型タンク',
    code: 'FT-225',
    cat: '燃料',
    mass: 25,
    fuel: 225,
    size: [0.625, 1, 0.625],
    desc: '直径0.625 m・推進剤225 kg。接続したエンジンへ供給。'
  },
  tankLarge: {
    stackDiameters: [2.5, 2.5],
    shroudSupport: true,
    name: '大型タンク',
    code: 'FT-14400',
    cat: '燃料',
    mass: 1200,
    fuel: 14400,
    size: [2.5, 4, 2.5],
    desc: '直径2.5 m・推進剤14400 kg。接続したエンジンへ供給。'
  },
  adapterSmall: {
    stackDiameters: [0.625, 1.25],
    shroudSupport: true,
    name: '異径アダプター 0.625–1.25',
    code: 'AD-125',
    cat: '構造',
    mass: 30,
    size: [1.25, 0.6, 1.25],
    desc: '上面0.625 m／下面1.25 m。燃料は通過。回転して逆向きにも接続可能。'
  },
  adapterLarge: {
    stackDiameters: [1.25, 2.5],
    shroudSupport: true,
    name: '異径アダプター 1.25–2.5',
    code: 'AD-250',
    cat: '構造',
    mass: 120,
    size: [2.5, 1, 2.5],
    desc: '上面1.25 m／下面2.5 m。燃料は通過。回転して逆向きにも接続可能。'
  },
  decouplerSmall: {
    stackDiameters: [0.625, 0.625],
    shroudSupport: true,
    name: '分離リング 0.625 m',
    code: 'DC-62',
    cat: '構造',
    mass: 15,
    size: [0.625, 0.16, 0.625],
    decoupler: true,
    desc: '直径0.625 m。ステージで接続枝を分離。燃料通過なし。'
  },
  decouplerLarge: {
    stackDiameters: [2.5, 2.5],
    shroudSupport: true,
    name: '分離リング 2.5 m',
    code: 'DC-250',
    cat: '構造',
    mass: 140,
    size: [2.5, 0.32, 2.5],
    decoupler: true,
    desc: '直径2.5 m。ステージで接続枝を分離。燃料通過なし。'
  },
  engineSeaSmall: {
    stackDiameters: [0.625, null],
    name: '小型海面用エンジン',
    code: 'SL-12',
    cat: '推進',
    mass: 70,
    thrust: 12000,
    thrustMedium: 'independent',
    oxidizerSource: 'onboard',
    isp: 310,
    ispSeaLevel: 285,
    size: [0.625, 0.8, 0.625],
    gimbal: 6,
    gimbalPivot: [0, 0.12, 0],
    desc: '直径0.625 m。推力 海面11.0／真空12 kN、比推力 285／310 s。ジンバル6°。'
  },
  engineVacSmall: {
    stackDiameters: [0.625, null],
    name: '小型真空用エンジン',
    code: 'VX-6',
    cat: '推進',
    mass: 35,
    thrust: 6000,
    thrustMedium: 'independent',
    oxidizerSource: 'onboard',
    isp: 350,
    ispSeaLevel: 100,
    size: [0.625, 1, 0.625],
    gimbal: 6,
    gimbalPivot: [0, 0.15, 0],
    desc: '直径0.625 m。推力 海面1.7／真空6 kN、比推力 100／350 s。ジンバル6°。'
  },
  engineSeaMedium: {
    stackDiameters: [1.25, null],
    name: '中型海面用エンジン',
    code: 'SL-90',
    cat: '推進',
    mass: 500,
    thrust: 90000,
    thrustMedium: 'independent',
    oxidizerSource: 'onboard',
    isp: 320,
    ispSeaLevel: 290,
    size: [1.25, 1.4, 1.25],
    gimbal: 6,
    gimbalPivot: [0, 0.21, 0],
    desc: '直径1.25 m。推力 海面81.6／真空90 kN、比推力 290／320 s。ジンバル6°。'
  },
  engineVacMedium: {
    stackDiameters: [1.25, null],
    name: '中型真空用エンジン',
    code: 'VX-60',
    cat: '推進',
    mass: 280,
    thrust: 60000,
    thrustMedium: 'independent',
    oxidizerSource: 'onboard',
    isp: 360,
    ispSeaLevel: 110,
    size: [1.25, 1.8, 1.25],
    gimbal: 6,
    gimbalPivot: [0, 0.27, 0],
    desc: '直径1.25 m。推力 海面18.3／真空60 kN、比推力 110／360 s。ジンバル6°。'
  },
  engineSeaLarge: {
    stackDiameters: [2.5, null],
    name: '大型海面用エンジン',
    code: 'SL-650',
    cat: '推進',
    mass: 2300,
    thrust: 650000,
    thrustMedium: 'independent',
    oxidizerSource: 'onboard',
    isp: 320,
    ispSeaLevel: 285,
    size: [2.5, 2.4, 2.5],
    gimbal: 6,
    gimbalPivot: [0, 0.36, 0],
    desc: '直径2.5 m。推力 海面578.9／真空650 kN、比推力 285／320 s。ジンバル6°。'
  },
  engineVacLarge: {
    stackDiameters: [2.5, null],
    name: '大型真空用エンジン',
    code: 'VX-250',
    cat: '推進',
    mass: 1200,
    thrust: 250000,
    thrustMedium: 'independent',
    oxidizerSource: 'onboard',
    isp: 365,
    ispSeaLevel: 120,
    size: [2.5, 3, 2.5],
    gimbal: 6,
    gimbalPivot: [0, 0.45, 0],
    desc: '直径2.5 m。推力 海面82.2／真空250 kN、比推力 120／365 s。ジンバル6°。'
  },
  battery: {
    name: 'バッテリー',
    code: 'BP-1000',
    cat: '装備',
    mass: 35,
    size: [0.8, 0.3, 0.5],
    battery: 1000,
    desc: '1000 ECの蓄電池。機体全体へ給電し、太陽電池から充電。姿勢制御装置は内蔵しません。'
  },
  landingLeg: {
    name: '固定式着陸脚',
    code: 'LL-16',
    cat: '構造',
    mass: 45,
    size: [0.65, 1.6, 0.65],
    landingLeg: true,
    desc: '幅65 cmの接地パッドと支柱。固定式。四脚で推進器を地面から離し、低速で接地してください。'
  },
  heatShield: {
    name: '熱シールド',
    code: 'HS-20',
    cat: '構造',
    mass: 70,
    size: [2, 0.28, 2],
    heatShield: true,
    bodyDragShape: 'disc-y',
    shieldRadius: 1,
    shieldNormal: [0, -1, 0],
    ablator: 40,
    noseRadius: 1,
    maxTemperature: 1800,
    desc: '直径2 mの曲面耐熱材。茶色の面（ローカル−Y）を進行方向へ。消耗材40 kgで加熱を吸収。'
  },
  dockingPort: {
    name: 'ドッキングポート',
    code: 'DP-12',
    cat: '構造',
    mass: 55,
    size: [1.25, 0.242, 1.25],
    docking: true,
    dockFace: 0.121,
    desc: '正面はローカル+Y。ポート面を向き合わせて低速で結合。'
  },
  rcs: {
    name: 'RCSブロック',
    code: 'RCS-6',
    cat: '推進',
    mass: 16,
    monoprop: 12,
    rcsThrust: 120,
    rcsIsp: 65,
    size: [0.48, 0.48, 0.48],
    desc: '6方向・各120 N。内蔵単一推進剤12 kg。配置と重心で姿勢制御の効きが変わります。'
  },
  capsule: {
    name: 'コマンドポッド',
    code: 'CP-1',
    cat: '指令',
    mass: 620,
    size: [1.25, 1.3, 1.25],
    control: true,
    commandFrame: 'axial',
    reactionTorque: 7000,
    battery: 1000,
    desc: '耐熱外殻と姿勢制御を備える有人カプセル。'
  },
  probe: {
    name: '探査コア',
    code: 'OC-4',
    cat: '指令',
    mass: 90,
    size: [1.25, 0.4, 1.25],
    control: true,
    commandFrame: 'legacy-auto',
    surfaceObservation: true,
    reactionTorque: 1200,
    battery: 200,
    desc: '小型無人機のための軽量制御ユニット。'
  },
  cockpit: {
    name: 'コックピット',
    code: 'FC-2',
    cat: '指令',
    mass: 510,
    size: [1.25, 2, 1.25],
    control: true,
    commandFrame: 'forward',
    battery: 500,
    desc: '航空機・ローバー向けの広視界キャノピー。'
  },
  tank: {
    stackDiameters: [1.25, 1.25],
    shroudSupport: true,
    name: '中型タンク',
    code: 'FT-1800',
    cat: '燃料',
    mass: 150,
    fuel: 1800,
    size: [1.25, 2, 1.25],
    desc: '直径1.25 m・推進剤1800 kg。同じ燃料系統へ推進剤を供給。分離リングを越えては流れません。'
  },
  engine: {
    stackDiameters: [1.25, null],
    name: '液体燃料エンジン',
    code: 'RE-45',
    cat: '推進',
    mass: 270,
    thrust: 45000,
    thrustMedium: 'independent',
    oxidizerSource: 'onboard',
    isp: 300,
    size: [1.25, 1.2, 1.25],
    gimbal: 6,
    gimbalPivot: [0, 0.16, 0],
    desc: '45 kN・最大6度のジンバル。ノズルを傾けて推力方向を制御。'
  },
  jet: {
    name: 'ターボジェット',
    code: 'TJ-18',
    cat: '推進',
    mass: 230,
    thrust: 18000,
    thrustMedium: 'air',
    oxidizerSource: 'atmosphere',
    isp: 1800,
    size: [1.25, 1.2, 1.25],
    desc: '大気中専用。高度とともに推力が低下する。'
  },
  propeller: {
    name: 'スクリュー',
    code: 'MP-6',
    cat: '推進',
    mass: 60,
    thrust: 6000,
    thrustMedium: 'water',
    oxidizerSource: 'none',
    isp: 3000,
    size: [0.8, 0.5, 0.8],
    desc: '水中専用推進器。船・潜水艇の推進に。'
  },
  nose: {
    streamlinedNose: true,
    name: 'ノーズコーン',
    code: 'NC-1',
    cat: '構造',
    mass: 65,
    size: [1.25, 1, 1.25],
    desc: '機首を覆う軽量の整流コーン。'
  },
  decoupler: {
    stackDiameters: [1.25, 1.25],
    shroudSupport: true,
    name: '分離リング',
    code: 'DC-12',
    cat: '構造',
    mass: 40,
    size: [1.25, 0.22, 1.25],
    decoupler: true,
    desc: 'ステージ実行時、この部品から先の接続枝を分離。'
  },
  truss: {
    stackRectangles: [
      [1, 1],
      [1, 1]
    ],
    name: '構造フレーム',
    code: 'TR-1',
    cat: '構造',
    mass: 65,
    size: [1, 1, 1],
    desc: 'ローバーや宇宙機の骨組み。6方向に接続可能。'
  },
  wing: {
    attachmentNodes: [
      [0, 0, 0, -1, 0, 0],
      [2, 0, 0, 1, 0, 0]
    ],
    surfaceMount: [0, 0, 0, -1, 0, 0],
    modelCenter: [1, 0, 0],
    placementNode: 0,
    mirrorRotation: [0, Math.PI, 0],
    name: '主翼・固定翼',
    code: 'SW-2',
    cat: '空力',
    mass: 55,
    size: [2, 1.6, 0.12],
    wing: 2.1,
    ac: [-0.2, 0.13, 0],
    massCenter: [-0.2, -0.2, 0],
    chord: 1.1,
    desc: '空気速度と迎角から揚力が発生。基部はローカルX=0。'
  },
  fin: {
    attachmentNodes: [
      [0, 0, 0, -1, 0, 0],
      [2, 0, 0, 1, 0, 0]
    ],
    surfaceMount: [0, 0, 0, -1, 0, 0],
    modelCenter: [1, 0, 0],
    placementNode: 0,
    mirrorRotation: [0, Math.PI, 0],
    name: '可動ロケットフィン',
    code: 'RF-2',
    cat: '空力',
    mass: 55,
    size: [2, 1.6, 0.12],
    model: 'wing',
    wing: 2.1,
    ac: [-0.2, 0.13, 0],
    massCenter: [-0.2, -0.2, 0],
    chord: 1.1,
    controlAxis: 'auto',
    maxDeflection: 18,
    hingePivot: [0, 0.13, 0],
    desc: '全遊動フィン。配置に合わせてピッチ・ヨー・ロールへ混合。気流が必要。'
  },
  stabilizer: {
    name: '水平・垂直安定板',
    code: 'ST-1',
    cat: '空力',
    mass: 25,
    size: [1.8, 0.65, 0.09],
    wing: 1.05,
    chord: 0.65,
    ac: [0, 0.16, 0],
    desc: '固定安定板。回転させて垂直尾翼にも使えます。'
  },
  elevator: {
    name: 'エレベーター',
    code: 'EL-1',
    cat: '空力',
    mass: 12,
    size: [1.8, 0.4, 0.08],
    wing: 0.72,
    chord: 0.4,
    ac: [0, 0.1, 0],
    controlAxis: 'pitch',
    maxDeflection: 25,
    desc: '水平尾翼の昇降舵。空気速度と重心からの腕で効きが変化。'
  },
  aileron: {
    name: 'エルロン',
    code: 'AL-1',
    cat: '空力',
    mass: 10,
    size: [1.4, 0.3, 0.07],
    wing: 0.42,
    chord: 0.3,
    ac: [0, 0.075, 0],
    controlAxis: 'roll',
    maxDeflection: 22,
    desc: '主翼後縁の独立した補助翼。左右の揚力差でロール。'
  },
  rudder: {
    name: 'ラダー',
    code: 'RD-1',
    cat: '空力',
    mass: 10,
    size: [0.8, 0.4, 0.07],
    wing: 0.32,
    chord: 0.4,
    ac: [0, 0.1, 0],
    controlAxis: 'yaw',
    maxDeflection: 28,
    desc: '垂直尾翼の方向舵。横方向の空気力でヨーを制御。'
  },
  nosegear: {
    name: '操向前脚',
    code: 'NG-1',
    cat: '走行',
    mass: 35,
    size: [0.34, 0.7, 0.7],
    wheel: true,
    retractable: true,
    steer: true,
    model: 'wheel',
    desc: '前輪1輪の操向脚。地上のA/D入力で操向。飛行中は格納可能。'
  },
  maingear: {
    name: '主脚',
    code: 'MG-1',
    cat: '走行',
    mass: 45,
    size: [0.34, 0.7, 0.7],
    wheel: true,
    retractable: true,
    model: 'wheel',
    desc: '航空機の自由転動する主脚。ブレーキ付き。飛行中は格納可能。'
  },
  wheel: {
    name: '駆動輪',
    code: 'RW-7',
    cat: '走行',
    mass: 45,
    size: [0.34, 0.7, 0.7],
    wheel: true,
    poweredWheel: true,
    steer: true,
    desc: '接地中に駆動・ブレーキ・操舵できるサスペンション輪。'
  },
  parachute: {
    name: '回収パラシュート',
    code: 'PC-14',
    cat: '装備',
    mass: 80,
    size: [0.8, 0.4, 0.8],
    parachute: 154,
    maxTemperature: 500,
    desc: '耐熱限界500 K。再突入中は熱シールドの背後に。Hで待機。高度5 km以下・250 m/s未満で縮帆、1.5 km以下・80 m/s未満で全開。'
  },
  solar: {
    name: 'ソーラーパネル',
    code: 'SP-2',
    cat: '装備',
    mass: 22,
    size: [2, 1, 0.08],
    solarPower: 0.8,
    desc: '最大0.8 EC/s。表面の向きと天体の影で発電量が変化。'
  },
  pontoon: {
    name: 'フロート',
    code: 'FL-3',
    cat: '船舶',
    mass: 85,
    size: [1, 3, 0.8],
    volume: 1.9,
    waterResistance: [1, 0.1, 1],
    planingArea: 3,
    desc: '水密の浮体。水没体積に応じた浮力を生む。'
  },
  ballast: {
    name: 'バラストタンク',
    code: 'BT-1',
    cat: '船舶',
    mass: 110,
    size: [1.25, 1, 1.25],
    volume: 1.05,
    ballast: 1050,
    desc: '注排水で質量を変え、浮上・潜航を調整する。'
  }
} satisfies PartCatalog;
export const PARTS: PartCatalog = BASE_PARTS;
installLargeParts(PARTS);
installCargoParts(PARTS);
export const CATEGORIES = ['すべて', '指令', '燃料', '推進', '構造', '空力', '走行', '装備', '船舶'];
export function nodes(type: PartType): AttachmentNode[] {
  const d = PARTS[type],
    [x, y, z] = d.size;
  if (d.attachmentNodes) return d.attachmentNodes.map(n => [...n]);
  return [
    [0, y / 2, 0, 0, 1, 0],
    [0, -y / 2, 0, 0, -1, 0],
    [x / 2, 0, 0, 1, 0, 0],
    [-x / 2, 0, 0, -1, 0, 0],
    [0, 0, z / 2, 0, 0, 1],
    [0, 0, -z / 2, 0, 0, -1]
  ];
}
export function part(
  type: PartType,
  p: PartVector = [0, 0, 0],
  r: PartVector = [0, 0, 0],
  parent: string | null = null,
  stage = 0
): Part {
  return {id: crypto.randomUUID(), type, p, r, parent, stage};
}
/** The preset part matching test (presets are fixed tables, so a miss is a broken preset). */
function presetPart(a: readonly Part[], test: (p: Part) => boolean): Part {
  const p = a.find(test);
  if (!p) throw Error('プリセットの部品が見つかりません');
  return p;
}
export function preset(kind: string): Part[] {
  let a: Part[] = [];
  const add = (t: PartType, p: PartVector, r: PartVector = [0, 0, 0], par = 0, stage = 0) => {
    const o = part(t, p, r, a[par]?.id ?? null, stage);
    a.push(o);
    return a.length - 1;
  };
  if (kind === 'atlas') {
    add('probe', [0, 0, 0]);
    const upper = add('tank', [0, -1.2, 0]);
    const upper2 = add('tank', [0, -3.2, 0], [0, 0, 0], upper);
    const vacuum = add('engineVacMedium', [0, -5.1, 0], [0, 0, 0], upper2, 1);
    const separator = add('decoupler', [0, -6.11, 0], [0, 0, 0], vacuum, 1);
    const adapter = add('adapterLarge', [0, -6.72, 0], [0, 0, 0], separator);
    const lower = add('tankLarge', [0, -9.22, 0], [0, 0, 0], adapter);
    const lower2 = add('tankLarge', [0, -13.22, 0], [0, 0, 0], lower);
    add('engineSeaLarge', [0, -16.42, 0], [0, 0, 0], lower2);
    for (const x of [-1.6, 1.6]) add('solar', [x, 0, 0]);
  }
  if (kind === 'rocket') {
    add('capsule', [0, 3.6, 0]);
    add('tank', [0, 1.95, 0]);
    add('engine', [0, 0.35, 0], [0, 0, 0], 1);
    for (let i = 0; i < 4; i++) {
      const t = (i * Math.PI) / 2;
      add('fin', [0.625 * Math.cos(t), 0.8, -0.625 * Math.sin(t)], [0, t, 0], 1);
    }
  }
  if (kind === 'launcher' || kind === 'returner') {
    add('capsule', [0, 5.6, 0]);
    add('tank', [0, 3.95, 0]);
    add('tank', [0, 1.95, 0], [0, 0, 0], 1);
    add('engine', [0, 0.35, 0], [0, 0, 0], 2, 1);
    add('decoupler', [0, -0.36, 0], [0, 0, 0], 3, 1);
    add('tank', [0, -1.47, 0], [0, 0, 0], 4);
    add('tank', [0, -3.47, 0], [0, 0, 0], 5);
    add('tank', [0, -5.47, 0], [0, 0, 0], 6);
    for (const x of [-0.7, 0.7]) for (const z of [-0.7, 0.7]) add('engine', [x, -7.07, z], [0, 0, 0], 7);
    for (let i = 0; i < 4; i++) {
      const t = (i * Math.PI) / 2;
      add('fin', [0.625 * Math.cos(t), -5.5, -0.625 * Math.sin(t)], [0, t, 0], 7);
    }
  }
  if (kind === 'returner') {
    for (let i = 1; i < a.length; i++) a[i].p[1] -= 0.5;
    const shield = part('heatShield', [0, 4.81, 0], [0, 0, 0], a[0].id);
    const separator = part('decoupler', [0, 4.56, 0], [0, 0, 0], shield.id, 2);
    a.push(shield);
    a[1].parent = separator.id;
    a.push(separator);
    a.push(part('parachute', [0, 6.45, 0], [0, 0, 0], a[0].id, 3));
  }
  if (kind === 'reentry') {
    add('capsule', [0, 0, 0]);
    add('heatShield', [0, -0.79, 0]);
    add('parachute', [0, 0.85, 0]);
  }
  if (kind === 'lunar-return') {
    add('capsule', [0, 0, 0]);
    add('heatShield', [0, -0.79, 0]);
    add('parachute', [0, 0.85, 0], [0, 0, 0], 0, 2);
    const separator = add('decoupler', [0, -1.04, 0], [0, 0, 0], 1, 1);
    const tank = add('tank', [0, -2.15, 0], [0, 0, 0], separator);
    add('engine', [0, -3.75, 0], [0, 0, 0], tank);
    for (const x of [-1.6, 1.6]) add('solar', [x, -2.15, 0], [0, 0, 0], tank);
  }
  if (kind === 'lunar-expedition') {
    a = preset('lunar-return');
    for (const p of a) {
      if (p.type === 'engine') p.stage = 2;
      else if (p.type === 'decoupler') p.stage = 3;
      else if (p.type === 'parachute') p.stage = 4;
    }
    const upper = a.findIndex(p => p.type === 'engine'),
      middleSeparator = add('decoupler', [0, -4.46, 0], [0, 0, 0], upper, 2);
    const middleTop = add('tank', [0, -5.57, 0], [0, 0, 0], middleSeparator),
      middleBottom = add('tank', [0, -7.57, 0], [0, 0, 0], middleTop);
    for (const x of [-0.7, 0.7]) add('engine', [x, -9.17, 0], [0, 0, 0], middleBottom, 1);
    const lowerSeparator = add('decoupler', [0, -9.88, 0], [0, 0, 0], middleBottom, 1);
    let tank = lowerSeparator;
    for (let i = 0; i < 5; i++) tank = add('tank', [0, -10.99 - 2 * i, 0], [0, 0, 0], tank);
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      add('engine', [1.25 * Math.cos(angle), -20.59, 1.25 * Math.sin(angle)], [0, 0, 0], tank);
    }
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      add('fin', [0.625 * Math.cos(angle), -18.99, -0.625 * Math.sin(angle)], [0, angle, 0], tank);
    }
  }
  if (kind === 'lunar-surface-expedition') {
    a = preset('lunar-expedition');
    const tank = presetPart(a, p => p.type === 'tank');
    for (const x of [-1.3, 1.3]) a.push(part('tank', [x, -2.15, 0], [0, 0, 0], tank.id));
    for (const [x, z] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const frame = part('truss', [x * 1.8, -3.2, z * 1.8], [0, 0, 0], tank.id);
      a.push(frame, part('landingLeg', [x * 1.8, -4.25, z * 1.8], [0, 0, 0], frame.id));
    }
    for (const p of a.filter(p => p.type === 'solar')) p.p[0] *= 1.8;
    const middle = presetPart(a, p => p.type === 'tank' && p.p[1] === -5.57),
      lower = presetPart(a, p => p.type === 'tank' && p.p[1] < -18);
    for (const x of [-1.3, 1.3]) a.push(part('tank', [x, -5.57, 0], [0, 0, 0], middle.id));
    for (const z of [-1.4, 1.4]) a.push(part('engine', [0, -9.17, z], [0, 0, 0], middle.id, 1));
    for (const x of [-1.3, 1.3])
      for (const y of [-14.99, -16.99]) a.push(part('tank', [x, y, 0], [0, 0, 0], lower.id));
    for (const [x, z] of [
      [2.5, 0],
      [-2.5, 0],
      [0, 2.5],
      [0, -2.5]
    ])
      a.push(part('engine', [x, -20.59, z], [0, 0, 0], lower.id));
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      a.push(part('engine', [2.5 * Math.cos(angle), -20.59, 2.5 * Math.sin(angle)], [0, 0, 0], lower.id));
    }
    // Vacuum upper stage: keep the tank socket fixed and extend the lower stack.
    const upperEngine = presetPart(a, p => p.type === 'engine' && p.stage === 2);
    upperEngine.type = 'engineVacMedium';
    upperEngine.p[1] -= 0.3;
    for (const p of a) if (p !== upperEngine && p.p[1] < -4.35) p.p[1] -= 0.6;
    for (const p of a) if (p.type === 'landingLeg' || p.type === 'truss') p.p[1] -= 0.6;
  }
  if (kind === 'recovery') {
    add('capsule', [0, 0, 0]);
    add('parachute', [0, 0.85, 0]);
  }
  if (kind === 'rcs') {
    add('probe', [0, 0, 0]);
    a[0].reactionEnabled = false;
    add('truss', [0, -0.7, 0]);
    for (const x of [-0.74, 0.74]) for (const y of [-1.2, 0.4]) add('rcs', [x, y, 0], [0, 0, 0], 1);
  }
  if (kind === 'orbiter' || kind === 'transfer') {
    add('probe', [0, 2.5, 0]);
    add('tank', [0, 1.3, 0]);
    add('engine', [0, -0.3, 0], [0, 0, 0], 1);
    add('solar', [1.6, 2.5, 0], [0, 0, 0]);
    add('solar', [-1.6, 2.5, 0], [0, 0, 0]);
  }
  if (kind === 'lander' || kind === 'moonlander' || kind === 'hopper') {
    add('probe', [0, 2.5, 0]);
    add('tank', [0, 1.3, 0]);
    add('engine', [0, -0.3, 0], [0, 0, 0], 1);
    add('solar', [1.6, 2.5, 0]);
    add('solar', [-1.6, 2.5, 0]);
    for (const [x, z] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const frame = add('truss', [x * 0.9, 0.3, z * 0.9], [0, 0, 0], 1);
      add('landingLeg', [x * 1.2, -0.8, z * 1.2], [0, 0, 0], frame);
    }
  }
  if (kind === 'twin') {
    add('probe', [0, 2.5, 0]);
    add('tank', [0, 1.3, 0]);
    add('engine', [0, -0.3, 0], [0, 0, 0], 1, 0);
    add('decoupler', [0, -1.01, 0], [0, 0, 0], 2, 1);
    add('probe', [0, -1.35, 0], [0, 0, 0], 3);
    add('tank', [0, -2.55, 0], [0, 0, 0], 4);
    add('engine', [0, -4.15, 0], [0, 0, 0], 5, 2);
    add('solar', [1.6, 2.5, 0]);
    add('solar', [-1.6, 2.5, 0]);
    add('solar', [1.6, -1.35, 0], [0, 0, 0], 4);
    add('solar', [-1.6, -1.35, 0], [0, 0, 0], 4);
  }
  if (kind === 'rendezvous') {
    a = preset('twin');
    for (const core of a.filter(p => p.type === 'probe')) {
      core.reactionEnabled = false;
      for (const x of [-0.9, 0.9])
        for (const y of [-1.2, 1.2]) a.push(part('rcs', [x, core.p[1] - 1.3 + y, 0], [0, 0, 0], core.id));
    }
  }
  if (kind === 'orbital-tug') {
    a = preset('orbiter');
    add('dockingPort', [0, 2.821, 0]);
    for (const z of [-0.9, 0.9]) for (const y of [0.2, 2.4]) add('rcs', [0, y, z], [0, 0, 0], 1);
  }
  if (kind === 'tug-launcher') {
    a = preset('orbital-tug');
    const engine = presetPart(a, p => p.type === 'engine');
    engine.stage = 1;
    const upper = add('tank', [0, -0.7, 0], [0, 0, 0], 1);
    engine.parent = a[upper].id;
    engine.p[1] -= 2;
    const separator = add('decoupler', [0, -3.01, 0], [0, 0, 0], a.indexOf(engine), 1);
    let tank = separator;
    for (let i = 0; i < 3; i++) tank = add('tank', [0, -4.12 - i * 2, 0], [0, 0, 0], tank);
    for (const x of [-0.7, 0.7]) for (const z of [-0.7, 0.7]) add('engine', [x, -9.72, z], [0, 0, 0], tank);
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      add('fin', [0.625 * Math.cos(angle), -8.15, -0.625 * Math.sin(angle)], [0, angle, 0], tank);
    }
  }
  if (kind === 'docking') {
    add('probe', [0, -1.4, 0]);
    add('truss', [0, -0.7, 0]);
    add('dockingPort', [0, -0.079, 0], [0, 0, 0], 1);
    add('dockingPort', [0, 0.163, 0], [Math.PI, 0, 0], 2);
    add('truss', [0, 0.784, 0], [Math.PI, 0, 0], 3);
    add('probe', [0, 1.484, 0], [Math.PI, 0, 0], 4);
    a[2].dockPartner = a[3].id;
    a[3].dockPartner = a[2].id;
    for (const [core, ys] of [
      [0, [-1.2, -0.2]],
      [5, [0.284, 1.284]]
    ] as const)
      for (const x of [-0.74, 0.74]) for (const y of ys) add('rcs', [x, y, 0], [0, 0, 0], core);
  }
  if (kind === 'plane') {
    const r: PartVector = [Math.PI / 2, 0, 0],
      left: PartVector = [Math.PI / 2, Math.PI, 0],
      vertical: PartVector = [Math.PI / 2, Math.PI / 2, 0];
    add('cockpit', [0, 1.3, 2.2], r);
    add('tank', [0, 1.3, 0.2], r);
    add('jet', [0, 1.3, -1.4], r, 1);
    add('wing', [0.625, 1.3, 0.45], [Math.PI / 2 - 0.045, 0, 0], 1);
    add('wing', [-0.625, 1.3, 0.45], [Math.PI / 2 - 0.045, Math.PI, 0], 1);
    add('aileron', [1.7, 1.3, -0.51], r, 3);
    add('aileron', [-1.7, 1.3, -0.51], left, 4);
    add('stabilizer', [0.95, 1.4, -1.6], r, 1);
    add('stabilizer', [-0.95, 1.4, -1.6], left, 1);
    add('elevator', [0.95, 1.4, -2.125], r, 7);
    add('elevator', [-0.95, 1.4, -2.125], left, 8);
    add('stabilizer', [0, 2.1, -1.6], vertical, 1);
    add('rudder', [0, 2.45, -2.125], vertical, 11);
    add('nosegear', [0, 0.4, 2.0], [0, 0, 0], 0);
    add('maingear', [1.05, 0.4, -0.25], [0, 0, 0], 1);
    add('maingear', [-1.05, 0.4, -0.25], [0, 0, 0], 1);
  }
  if (kind === 'transport') {
    const r: PartVector = [Math.PI / 2, 0, 0],
      left: PartVector = [Math.PI / 2, Math.PI, 0],
      vertical: PartVector = [Math.PI / 2, Math.PI / 2, 0];
    add('transportCockpit', [0, 5, 19.2], [Math.PI / 2, Math.PI, 0]);
    const front = add('transportFuselage', [0, 5, 9.6], r),
      mid = add('transportFuselage', [0, 5, 0], r, front),
      rear = add('transportFuselage', [0, 5, -9.6], r, mid);
    add('transportTail', [0, 5, -16.8], [-Math.PI / 2, 0, 0], rear);
    for (const sign of [-1, 1]) {
      const wr: PartVector = sign > 0 ? [Math.PI / 2 - 0.045, 0, 0] : [Math.PI / 2 - 0.045, Math.PI, 0],
        sr = sign > 0 ? r : left;
      const wing = add('transportWingRoot', [sign * 2.8, 7.5, 1], wr, mid);
      const outer = add('transportWing', [sign * 16.8, 7.5, 1], wr, wing);
      for (const x of [8, 16, 24]) {
        const pylon = add('enginePylon', [sign * x, 6.75, 1], [0, 0, 0], x < 17 ? wing : outer);
        add('transportJet', [sign * x, 4.5, 1], r, pylon);
      }
      for (const x of [12, 22, 28]) add('aileronLarge', [sign * x, 7.5, -4.4], sr, x < 17 ? wing : outer);
      const tail = add('transportStabilizer', [sign * 4.5, 6, -12.5], sr, rear);
      add('transportElevator', [sign * 4.5, 6, -15.125], sr, tail);
      const fin = add('transportStabilizer', [sign * 8, 10, -12.5], vertical, tail);
      add('rudderLarge', [sign * 8, 10, -14.7], vertical, fin);
      for (const z of [-6, -4, -2, 0, 2, 4, 6])
        for (const x of [3.2, 4.25]) add('maingearLarge', [sign * x, 1.05, z], [0, 0, 0], mid);
      for (const z of [15, 17]) add('nosegearLarge', [sign * 0.65, 1.05, z], [0, 0, 0], front);
    }
  }
  if (kind === 'courier') {
    add('probe', [0, 1.6, -1.345]);
    add('solar', [0, 1.6 + PARTS.probe.size[1] / 2 + PARTS.solar.size[2] / 2, -1.345], [-Math.PI / 2, 0, 0]);
    const sep = add('decoupler', [0, 1.6, -0.61], [Math.PI / 2, 0, 0], 0, 1);
    const chassis = add('truss', [0, 0.9, 0], [0, 0, 0], sep);
    add('truss', [0, 0.9, 1], [0, 0, 0], chassis);
    add('probe', [0, 1.6, 0.5], [0, 0, 0], chassis);
    for (const x of [-1.2, 1.2])
      for (const z of [-0.6, 1.6]) {
        const i = add('wheel', [x, 0.4, z], [0, 0, 0], chassis);
        if (z < 0) a[i].steeringEnabled = false;
      }
    add('battery', [0, 1.25, -1.345], [0, 0, 0], 0);
    for (const p of a) if (p.type === 'probe') p.reactionEnabled = false;
  }
  if (kind === 'rover') {
    add('truss', [0, 0.9, 0]);
    add('truss', [0, 0.9, 1], [0, 0, 0]);
    add('probe', [0, 1.6, 0.5], [0, 0, 0]);
    for (const x of [-0.7, 0.7])
      for (const z of [-0.4, 1.4]) {
        const i = add('wheel', [x, 0.4, z], [0, 0, 0]);
        if (z < 0.5) a[i].steeringEnabled = false;
      }
    add('solar', [0, 1.6 + PARTS.probe.size[1] / 2 + PARTS.solar.size[2] / 2, 0.3], [-Math.PI / 2, 0, 0], 2);
  }
  if (kind === 'boat' || kind === 'sub') {
    const r: PartVector = [Math.PI / 2, 0, 0];
    add('cockpit', [0, 1, 1], r);
    add('truss', [0, 0.8, -0.5]);
    if (kind === 'boat') for (const x of [-1, 1]) add('pontoon', [x, 0.3, 0], r, 1);
    add('propeller', [0, -0.15, -1.7], r, 1);
    // A rudder in the screw's wash, deep enough to stay in the water at the waterline (BACKLOG 9b): A/D turn.
    if (kind === 'boat') add('rudder', [0, -0.3, -2.2], [Math.PI / 2, Math.PI / 2, 0], 1);
    if (kind === 'sub') {
      add('ballast', [-0.65, 0.3, -0.3], r, 1);
      add('ballast', [0.65, 0.3, -0.3], r, 1);
      // A rudder behind the screw, low enough to stay in the water when surfaced (BACKLOG 9b): A/D turn.
      add('rudder', [0, -0.25, -2.65], [Math.PI / 2, Math.PI / 2, 0], 1);
      // Bow and stern planes (BACKLOG 9b): W/S and SAS hold the pitch, also when fully flooded. Equal arms
      // fore and aft keep the trim and cancel their drag moments while the hull rises or sinks.
      for (const [z, parent] of [
        [1.6, 0],
        [-1.6, 1]
      ]) {
        add('elevator', [0.95, -0.15, z], r, parent);
        add('elevator', [-0.95, -0.15, z], [Math.PI / 2, Math.PI, 0], parent);
      }
    }
  }
  if (kind === 'sub')
    for (const p of a) {
      if (p.type === 'cockpit') p.p = [0, 0, 0.3];
      // The buoyant frame sits a little aft to trim the rudder's weight at the stern when submerged.
      if (p.type === 'truss') p.p = [0, 1.2, -0.15];
      // The screw sits a little lower so that it keeps its surfaced thrust while the planes hold the hull level.
      if (p.type === 'propeller') p.p = [0, 0, -2.1];
      if (p.type === 'ballast') p.p = [Math.sign(p.p[0]) * 1.3, 0.2, 0];
    }
  if (['plane', 'boat', 'sub'].includes(kind)) {
    a[0].r = [Math.PI / 2, Math.PI, 0];
  }
  if (['plane-large', 'boat-large', 'sub-large'].includes(kind)) {
    const base = kind.replace('-large', ''),
      s = base === 'plane' ? 3 : 4;
    const mapping: Record<string, PartType> =
      base === 'plane'
        ? {
            cockpit: 'cockpitLarge',
            tank: 'fuselageLarge',
            jet: 'jetLarge',
            wing: 'wingLarge',
            stabilizer: 'stabilizerLarge',
            elevator: 'elevatorLarge',
            aileron: 'aileronLarge',
            rudder: 'rudderLarge',
            nosegear: 'nosegearLarge',
            maingear: 'maingearLarge'
          }
        : {
            cockpit: 'marineCabin',
            truss: 'marineFrame',
            pontoon: 'hullLarge',
            ballast: 'ballastLarge',
            propeller: 'propellerLarge'
          };
    // The large submarine turns with its gimballed screw; the small one's rudder has no large mapping.
    a = preset(base).filter(p => p.type in mapping);
    for (const p of a) {
      p.type = mapping[p.type];
      p.p = [p.p[0] * s, p.p[1] * s, p.p[2] * s];
    }
    // Raise the submarine thrust line to counter the bow-up moment under power.
    if (base === 'sub') presetPart(a, p => p.type === 'propellerLarge').p[1] = 1;
    if (base === 'plane') {
      const engine = presetPart(a, p => p.type === 'jetLarge');
      engine.p = [3, 2.7, -1.2];
      a.push(part('jetLarge', [-3, 2.7, -1.2], [...engine.r], engine.parent, engine.stage));
    }
  }
  if (kind === 'transport-cargo') {
    a = preset('transport');
    const bay = presetPart(a, p => p.type === 'transportFuselage' && p.p[2] === 0);
    bay.type = 'cargoBay';
    bay.r = [Math.PI / 2, 0, 0];
    // Belly doors clear the high wing; the payload hangs from the internal mount.
    const lab = preset('cargo-lab'),
      source = lab[0];
    const payload = lab.filter(p => p.id !== source.id && (p.parent !== source.id || p.type === 'decoupler'));
    for (const p of payload) {
      const [x, y, z] = p.p;
      p.p = [x, 5 - z, y];
      p.r = [p.r[0] + Math.PI / 2, p.r[1], p.r[2]];
      if (p.parent === source.id) p.parent = bay.id;
    }
    a.push(...payload);
  }
  if (kind === 'cargo-lab') {
    const bay = add('cargoBay', [0, 0, 0]);
    add('probe', [0, 5, 0], [0, 0, 0], bay);
    const ring = add('decoupler', [0, 0, -2.19], [Math.PI / 2, 0, 0], bay, 1);
    a[ring].attachment = {mode: 'node', parentNode: 6, ownNode: 1};
    const payload = add('probe', [0, 0, -1.88], [Math.PI / 2, 0, 0], ring);
    add('battery', [0, 0, -1.53], [Math.PI / 2, 0, 0], payload);
    for (const x of [-0.85, 0.85]) add('solar', [x, 0, -1.88], [0, 0, 0], payload);
  }
  return a;
}
