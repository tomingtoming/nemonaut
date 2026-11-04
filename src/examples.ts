// Cargo demonstration starts in orbital practice; not a launch-capable shuttle.
export const examples = {
  atlas: ['Atlas / 29', '異径2段ロケット', '2.5 m海面用下段 → 1.25 m真空用上段', 'land'],
  'tug-launcher': [
    'Tug Launcher / 28',
    '軌道ドッキング機',
    '2段式 · 地上から出発 · 上段11部品・RCS・正面ポート',
    'land'
  ],
  hopper: ['Hopper / 24', '精密着陸機', '四脚・単段式 · Spaceで点火 · 姿勢と推力を手動調整', 'land'],
  courier: ['Courier / 23', '観測機運搬ローバー', 'W/S駆動・A/D操舵・B停止 · Spaceで設置', 'land'],
  'orbital-tug': [
    'Orbital Tug / 22',
    'ランデブー・ドッキング',
    '相手機を20 km先に配置 · 主エンジン・RCS・正面ポート',
    'orbit',
    'rendezvous'
  ],
  'lunar-surface-expedition': [
    'Selene Expedition / 21',
    '月面往復ロケット（上級）',
    '55部品 · 真空用上段 · 着陸・再離陸・カプセル帰還',
    'land'
  ],
  'lunar-expedition': [
    'Luna Expedition / 20',
    '月往復ロケット',
    '地上から出発 · 3段式 · 月周回とカプセル帰還',
    'land'
  ],
  'lunar-return': [
    'Luna Return / 19',
    '月帰還カプセル',
    '月周回から帰還 · 熱シールド・分離・パラシュート',
    'moon-orbit'
  ],
  moonlander: [
    'Selene Ascent / 18',
    '月面離陸練習機',
    '月面から出発 · 姿勢と推力を手動操作 · 月周回へ',
    'moon-surface'
  ],
  lander: ['Selene / 17', '四脚月着陸機', '月高度20 kmから · 逆行減速と天頂降下 · 四脚で接地', 'moon-orbit'],
  transfer: [
    'Lunar Pathfinder / 16',
    '月遷移練習機',
    '母星80 kmから出発 · 60秒後に手動噴射 · 月フライバイ',
    'transfer'
  ],
  reentry: ['Entry Lab / 15', '再突入試験機', '熱シールド · SAS逆行で保護 · Hでパラシュート待機', 'entry'],
  docking: ['Docking Lab / 13', 'ドッキング試験機', '結合済み2機 · 右パネルで再分離と再結合', 'orbit'],
  rendezvous: ['Rendezvous / 12', '相対航法試験機', 'Spaceを2回で分離 · 相手を目標指定 · RCSで接近', 'orbit'],
  rcs: ['Attitude Lab / 11', 'RCS試験機', 'ホイール無効 · RでRCS · IJKLUOで並進', 'orbit'],
  twin: ['Gemini / 10', '双子探査機', 'Spaceを2回で分離 · 他機体へ操縦切替', 'orbit'],
  recovery: ['Recovery / 09', 'カプセル降下試験', '高度1 km · パラシュートをHで待機', 'drop'],
  returner: ['Pioneer Return / 08', '帰還ロケット', '2段式 · 熱シールド · パラシュート', 'land'],
  launcher: ['Pioneer Heavy / 07', '軌道投入ロケット', '2段式 · 下段4基 · 上段1基', 'land'],
  rocket: ['Pioneer / 01', 'ロケット', '45 kN · 4枚フィン', 'land'],
  orbiter: ['Surveyor / 02', '宇宙探査機', '無人コア · ソーラーパネル', 'land'],
  plane: ['Swift / 03', 'ジェット機', '独立操舵面 · 前輪1＋主脚2', 'runway'],
  rover: ['Nomad / 04', 'ローバー', '前輪操舵 · 4輪駆動', 'land'],
  boat: ['Tern / 05', '双胴艇', 'フロート · スクリュー · ラダー', 'water'],
  sub: ['Nautilus / 06', '潜水艇', '注排水タンク · 水中推進 · ラダー · 前後のエレベーター', 'water']
};
Object.assign(examples, {
  'transport-cargo': [
    'Colossus Cargo / 37',
    '貨物輸送機',
    '下面開閉貨物室 · 探査機搭載 · 6発・32輪',
    'runway'
  ],
  'cargo-lab': ['Cargo Lab / 36', '貨物搬出練習機', '軌道練習 · 貨物扉を開く → 内部リングを切離す', 'orbit'],
  transport: ['Colossus / 35', '超大型6発輸送機', '6 m胴体 · 連結高翼 · 双尾翼 · 32輪', 'runway'],
  'plane-large': ['Albatross / 32', '大型双発機', '大型胴体・主翼・独立舵面 · 90 kN ×2', 'runway'],
  'boat-large': ['Pelican / 33', '大型双胴船', '12 m船体 ×2 · 可動スクリュー', 'water'],
  'sub-large': ['Leviathan / 34', '大型潜水艦', '大型水密区画・バラスト・可動推進器', 'water']
});
export const exampleGroups = [
  {
    id: 'rocket',
    label: 'ロケット',
    keys: [
      'atlas',
      'tug-launcher',
      'hopper',
      'rocket',
      'launcher',
      'returner',
      'orbiter',
      'lunar-expedition',
      'lunar-surface-expedition'
    ]
  },
  {
    id: 'vehicle',
    label: '航空機・ローバー',
    keys: ['plane', 'plane-large', 'transport', 'transport-cargo', 'rover', 'courier']
  },
  {id: 'water', label: '船舶', keys: ['boat', 'boat-large', 'sub', 'sub-large']},
  {
    id: 'practice',
    label: '練習',
    keys: [
      'cargo-lab',
      'recovery',
      'reentry',
      'rcs',
      'twin',
      'rendezvous',
      'docking',
      'orbital-tug',
      'transfer',
      'lander',
      'moonlander',
      'lunar-return'
    ]
  }
];
