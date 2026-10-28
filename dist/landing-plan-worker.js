// dist/cargo-geometry.js
function cargoShellBoxes(d, open = false) {
  const [w, l, h] = d.size, t = d.cargoBay.wall, r = w / 2 - t / 2, N = 24, boxes = [];
  for (let i = 0; i < N; i++) {
    const theta = (i + 0.5) * 2 * Math.PI / N, x = r * Math.sin(theta), z = r * Math.cos(theta), side = Math.sign(x);
    boxes.push({ center: [x + (open && z > 0 ? side * w / 2 : 0), 0, z], size: [2 * r * Math.tan(Math.PI / N), l, t], rotation: [0, theta, 0] });
  }
  boxes.push({ center: [0, 0, -2.38], size: [3, 9.2, 0.16] });
  return boxes;
}
function cargoMassCenter(d) {
  const result = [0, 0, 0];
  let total = 0;
  for (const b of cargoShellBoxes(d)) {
    const v = b.size.reduce((a, b2) => a * b2, 1);
    total += v;
    b.center.forEach((n, i) => result[i] += n * v);
  }
  return result.map((n) => n / total);
}
function cargoCollisionBoxes(d, open = false) {
  return cargoShellBoxes(d, open).map((b) => ({ ...b, center: b.center.map((n, i) => n - (d.massCenter?.[i] || 0)) }));
}

// dist/cargo-parts.js
function installCargoParts(parts) {
  parts.cargoBay = { name: "\u5171\u7528\u8CA8\u7269\u80F4\u4F53", code: "CB-6", cat: "\u69CB\u9020", mass: 4200, size: [6, 9.6, 6], cargoBay: { wall: 0.3 }, desc: "6 m\u7D1A\u30FB\u5DE6\u53F3\u30B9\u30E9\u30A4\u30C9\u6249\u3002\u5185\u90E8\u5E8A\u306E\u63A5\u7D9A\u70B9\u306B\u5206\u96E2\u30EA\u30F3\u30B0\u3092\u53D6\u308A\u4ED8\u3051\u3001\u958B\u6249\u3057\u3066\u642C\u51FA\u3002\u8F38\u9001\u6A5F\u30FB\u5B87\u5B99\u6A5F\u5171\u7528\u3002\u8010\u71B1\u30B7\u30FC\u30EB\u30C9\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002", attachmentNodes: [
    [0, 4.8, 0, 0, 1, 0],
    [0, -4.8, 0, 0, -1, 0],
    [3, 0, 0, 1, 0, 0],
    [-3, 0, 0, -1, 0, 0],
    [0, 0, 3, 0, 0, 1],
    [0, 0, -3, 0, 0, -1],
    [0, 0, -2.3, 0, 0, 1],
    [0, 3, -2.3, 0, 0, 1],
    [0, -3, -2.3, 0, 0, 1]
  ] };
  parts.cargoBay.massCenter = cargoMassCenter(parts.cargoBay);
}

// dist/large-parts.js
var LARGE_VARIANTS = {
  transportCockpit: { base: "cockpit", scale: 4.8, factor: 25, name: "\u8F38\u9001\u6A5F\u30B3\u30C3\u30AF\u30D4\u30C3\u30C8", code: "TC-6" },
  transportFuselage: { base: "tank", scale: 4.8, factor: 25, name: "\u8F38\u9001\u6A5F\u71C3\u6599\u80F4\u4F53", code: "TF-45000" },
  transportTail: { base: "nose", scale: 4.8, factor: 25, name: "\u8F38\u9001\u6A5F\u30C6\u30FC\u30EB\u30B3\u30FC\u30F3", code: "TT-6" },
  transportWingRoot: { base: "wing", scale: 7, factor: 49, name: "\u5927\u578B\u5185\u7FFC\u533A\u753B", code: "WI-14" },
  enginePylon: { base: "truss", scale: 1.5, factor: 4, name: "\u30A8\u30F3\u30B8\u30F3\u30D1\u30A4\u30ED\u30F3", code: "PY-15" },
  transportWing: { base: "wing", scale: 7, factor: 49, name: "\u5927\u578B\u5916\u7FFC\u533A\u753B", code: "TW-14" },
  transportJet: { base: "jet", scale: 3, factor: 10, name: "\u8F38\u9001\u6A5F\u30BF\u30FC\u30DC\u30D5\u30A1\u30F3", code: "TF-180" },
  transportStabilizer: { base: "stabilizer", scale: 5, factor: 25, name: "\u5927\u578B\u5B89\u5B9A\u677F 9 m", code: "TS-9" },
  transportElevator: { base: "elevator", scale: 5, factor: 25, name: "\u5927\u578B\u30A8\u30EC\u30D9\u30FC\u30BF\u30FC 9 m", code: "TE-9" },
  cockpitLarge: { base: "cockpit", scale: 3, factor: 9, name: "\u5927\u578B\u30B3\u30C3\u30AF\u30D4\u30C3\u30C8", code: "FC-6" },
  fuselageLarge: { base: "tank", scale: 3, factor: 9, name: "\u5927\u578B\u822A\u7A7A\u71C3\u6599\u80F4\u4F53", code: "AF-16200" },
  jetLarge: { base: "jet", scale: 3, factor: 5, name: "\u5927\u578B\u30BF\u30FC\u30DC\u30D5\u30A1\u30F3", code: "TF-90" },
  wingLarge: { base: "wing", scale: 3, factor: 9, name: "\u5927\u578B\u4E3B\u7FFC", code: "SW-6" },
  stabilizerLarge: { base: "stabilizer", scale: 3, factor: 9, name: "\u5927\u578B\u5B89\u5B9A\u677F", code: "ST-3" },
  elevatorLarge: { base: "elevator", scale: 3, factor: 9, name: "\u5927\u578B\u30A8\u30EC\u30D9\u30FC\u30BF\u30FC", code: "EL-3" },
  aileronLarge: { base: "aileron", scale: 3, factor: 9, name: "\u5927\u578B\u30A8\u30EB\u30ED\u30F3", code: "AL-3" },
  rudderLarge: { base: "rudder", scale: 3, factor: 9, name: "\u5927\u578B\u30E9\u30C0\u30FC", code: "RD-3" },
  nosegearLarge: { base: "nosegear", scale: 3, factor: 9, name: "\u5927\u578B\u64CD\u5411\u524D\u811A", code: "NG-3" },
  maingearLarge: { base: "maingear", scale: 3, factor: 9, name: "\u5927\u578B\u4E3B\u811A", code: "MG-3" },
  marineCabin: { base: "cockpit", scale: 4, factor: 64, name: "\u5927\u578B\u6C34\u5BC6\u64CD\u7E26\u533A\u753B", code: "MC-8" },
  marineFrame: { base: "truss", scale: 4, factor: 64, name: "\u5927\u578B\u8239\u4F53\u30D5\u30EC\u30FC\u30E0", code: "MF-4" },
  hullLarge: { base: "pontoon", scale: 4, factor: 64, name: "\u5927\u578B\u6D6E\u529B\u8239\u4F53", code: "HL-12" },
  ballastLarge: { base: "ballast", scale: 4, factor: 64, name: "\u5927\u578B\u30D0\u30E9\u30B9\u30C8\u533A\u753B", code: "BT-67" },
  propellerLarge: { base: "propeller", scale: 4, factor: 64, name: "\u5927\u578B\u53EF\u52D5\u30B9\u30AF\u30EA\u30E5\u30FC", code: "MP-384" }
};
function installLargeParts(parts) {
  for (const [id, spec] of Object.entries(LARGE_VARIANTS)) {
    const { base, scale: s, factor: k, name, code } = spec, d = structuredClone(parts[base]);
    delete d.model;
    d.name = name;
    d.code = code;
    d.size = d.size.map((v) => v * s);
    for (const key of ["mass", "fuel", "thrust", "battery"]) if (d[key]) d[key] *= k;
    for (const key of ["volume", "ballast"]) if (d[key]) d[key] *= s ** 3;
    for (const key of ["ac", "massCenter"]) if (d[key]) d[key] = d[key].map((v) => v * s);
    for (const key of ["chord", "hingeY"]) if (d[key]) d[key] *= s;
    if (d.wing) d.wing *= s * s;
    if (id === "transportWingRoot") {
      d.wing = 156.8;
      d.chord = 11.2;
      d.ac = [7, 0, 0];
      d.massCenter = [7, 0, 0];
    }
    d.desc = d.wing ? `\u9762\u7A4D ${d.wing.toFixed(2)} m\xB2\u3002\u5927\u578B\u80F4\u4F53\u7528\u3002\u91CD\u5FC3\u304B\u3089\u306E\u914D\u7F6E\u3068\u6C17\u6D41\u3067\u52B9\u304D\u304C\u5909\u308F\u308A\u307E\u3059\u3002` : d.fuel ? `\u76F4\u5F84 ${d.size[0]} m\u30FB\u71C3\u6599 ${d.fuel} kg\u3002\u8907\u6570\u57FA\u306E\u822A\u7A7A\u30A8\u30F3\u30B8\u30F3\u3078\u4F9B\u7D66\u3002` : d.ballast ? `\u6392\u6C34\u5BB9\u7A4D ${d.volume.toFixed(1)} m\xB3\u3002\u6CE8\u6392\u6C34 ${d.ballast} kg\u3067\u6D6E\u6C88\u3092\u8ABF\u6574\u3002` : d.volume ? `\u9577\u3055 ${d.size[1]} m\u30FB\u6392\u6C34\u5BB9\u7A4D ${d.volume.toFixed(1)} m\xB3\u3002\u7D44\u307F\u5408\u308F\u305B\u3066\u8239\u4F53\u3092\u69CB\u6210\u3002` : d.thrust ? `\u63A8\u529B ${(d.thrust / 1e3).toFixed(0)} kN\u3002${d.water ? "\u6C34\u4E2D\u5C02\u7528\u30FB\u53EF\u52D5\u63A8\u9032\u5668\u3067\u64CD\u5411\u3002" : "\u5927\u6C17\u4E2D\u5C02\u7528\u3002\u63A5\u7D9A\u3057\u305F\u71C3\u6599\u80F4\u4F53\u304B\u3089\u4F9B\u7D66\u3002"}` : d.wheel ? "\u5927\u578B\u822A\u7A7A\u6A5F\u7528\u3002\u63A5\u5730\u30FB\u81EA\u7531\u8EE2\u52D5\u30FB\u5236\u52D5\u3002\u524D\u811A\u306E\u307FA/D\u64CD\u5411\u3002" : "\u5927\u578B\u6A5F\u306E\u72EC\u7ACB\u3057\u305F\u7D44\u7ACB\u90E8\u54C1\u3002\u63A5\u7D9A\u30FB\u4FDD\u5B58\u30FB\u8CEA\u91CF\u8A08\u7B97\u306B\u5BFE\u5FDC\u3002";
    if (id === "propellerLarge") {
      d.gimbal = 25;
      d.gimbalPivot = [0, 0, 0];
    }
    parts[id] = d;
  }
}

// dist/catalog.js
var PARTS = {
  tankSmall: { name: "\u5C0F\u578B\u30BF\u30F3\u30AF", code: "FT-225", cat: "\u71C3\u6599", mass: 25, fuel: 225, size: [0.625, 1, 0.625], desc: "\u76F4\u5F840.625 m\u30FB\u63A8\u9032\u5264225 kg\u3002\u63A5\u7D9A\u3057\u305F\u30A8\u30F3\u30B8\u30F3\u3078\u4F9B\u7D66\u3002" },
  tankLarge: { name: "\u5927\u578B\u30BF\u30F3\u30AF", code: "FT-14400", cat: "\u71C3\u6599", mass: 1200, fuel: 14400, size: [2.5, 4, 2.5], desc: "\u76F4\u5F842.5 m\u30FB\u63A8\u9032\u526414400 kg\u3002\u63A5\u7D9A\u3057\u305F\u30A8\u30F3\u30B8\u30F3\u3078\u4F9B\u7D66\u3002" },
  adapterSmall: { name: "\u7570\u5F84\u30A2\u30C0\u30D7\u30BF\u30FC 0.625\u20131.25", code: "AD-125", cat: "\u69CB\u9020", mass: 30, size: [1.25, 0.6, 1.25], desc: "\u4E0A\u97620.625 m\uFF0F\u4E0B\u97621.25 m\u3002\u71C3\u6599\u306F\u901A\u904E\u3002\u56DE\u8EE2\u3057\u3066\u9006\u5411\u304D\u306B\u3082\u63A5\u7D9A\u53EF\u80FD\u3002" },
  adapterLarge: { name: "\u7570\u5F84\u30A2\u30C0\u30D7\u30BF\u30FC 1.25\u20132.5", code: "AD-250", cat: "\u69CB\u9020", mass: 120, size: [2.5, 1, 2.5], desc: "\u4E0A\u97621.25 m\uFF0F\u4E0B\u97622.5 m\u3002\u71C3\u6599\u306F\u901A\u904E\u3002\u56DE\u8EE2\u3057\u3066\u9006\u5411\u304D\u306B\u3082\u63A5\u7D9A\u53EF\u80FD\u3002" },
  decouplerSmall: { name: "\u5206\u96E2\u30EA\u30F3\u30B0 0.625 m", code: "DC-62", cat: "\u69CB\u9020", mass: 15, size: [0.625, 0.16, 0.625], decoupler: true, desc: "\u76F4\u5F840.625 m\u3002\u30B9\u30C6\u30FC\u30B8\u3067\u63A5\u7D9A\u679D\u3092\u5206\u96E2\u3002\u71C3\u6599\u901A\u904E\u306A\u3057\u3002" },
  decouplerLarge: { name: "\u5206\u96E2\u30EA\u30F3\u30B0 2.5 m", code: "DC-250", cat: "\u69CB\u9020", mass: 140, size: [2.5, 0.32, 2.5], decoupler: true, desc: "\u76F4\u5F842.5 m\u3002\u30B9\u30C6\u30FC\u30B8\u3067\u63A5\u7D9A\u679D\u3092\u5206\u96E2\u3002\u71C3\u6599\u901A\u904E\u306A\u3057\u3002" },
  engineSeaSmall: { name: "\u5C0F\u578B\u6D77\u9762\u7528\u30A8\u30F3\u30B8\u30F3", code: "SL-12", cat: "\u63A8\u9032", mass: 70, thrust: 12e3, isp: 310, ispSeaLevel: 285, size: [0.625, 0.8, 0.625], gimbal: 6, gimbalPivot: [0, 0.12, 0], desc: "\u76F4\u5F840.625 m\u3002\u63A8\u529B \u6D77\u976211.0\uFF0F\u771F\u7A7A12 kN\u3001\u6BD4\u63A8\u529B 285\uFF0F310 s\u3002\u30B8\u30F3\u30D0\u30EB6\xB0\u3002" },
  engineVacSmall: { name: "\u5C0F\u578B\u771F\u7A7A\u7528\u30A8\u30F3\u30B8\u30F3", code: "VX-6", cat: "\u63A8\u9032", mass: 35, thrust: 6e3, isp: 350, ispSeaLevel: 100, size: [0.625, 1, 0.625], gimbal: 6, gimbalPivot: [0, 0.15, 0], desc: "\u76F4\u5F840.625 m\u3002\u63A8\u529B \u6D77\u97621.7\uFF0F\u771F\u7A7A6 kN\u3001\u6BD4\u63A8\u529B 100\uFF0F350 s\u3002\u30B8\u30F3\u30D0\u30EB6\xB0\u3002" },
  engineSeaMedium: { name: "\u4E2D\u578B\u6D77\u9762\u7528\u30A8\u30F3\u30B8\u30F3", code: "SL-90", cat: "\u63A8\u9032", mass: 500, thrust: 9e4, isp: 320, ispSeaLevel: 290, size: [1.25, 1.4, 1.25], gimbal: 6, gimbalPivot: [0, 0.21, 0], desc: "\u76F4\u5F841.25 m\u3002\u63A8\u529B \u6D77\u976281.6\uFF0F\u771F\u7A7A90 kN\u3001\u6BD4\u63A8\u529B 290\uFF0F320 s\u3002\u30B8\u30F3\u30D0\u30EB6\xB0\u3002" },
  engineVacMedium: { name: "\u4E2D\u578B\u771F\u7A7A\u7528\u30A8\u30F3\u30B8\u30F3", code: "VX-60", cat: "\u63A8\u9032", mass: 280, thrust: 6e4, isp: 360, ispSeaLevel: 110, size: [1.25, 1.8, 1.25], gimbal: 6, gimbalPivot: [0, 0.27, 0], desc: "\u76F4\u5F841.25 m\u3002\u63A8\u529B \u6D77\u976218.3\uFF0F\u771F\u7A7A60 kN\u3001\u6BD4\u63A8\u529B 110\uFF0F360 s\u3002\u30B8\u30F3\u30D0\u30EB6\xB0\u3002" },
  engineSeaLarge: { name: "\u5927\u578B\u6D77\u9762\u7528\u30A8\u30F3\u30B8\u30F3", code: "SL-650", cat: "\u63A8\u9032", mass: 2300, thrust: 65e4, isp: 320, ispSeaLevel: 285, size: [2.5, 2.4, 2.5], gimbal: 6, gimbalPivot: [0, 0.36, 0], desc: "\u76F4\u5F842.5 m\u3002\u63A8\u529B \u6D77\u9762578.9\uFF0F\u771F\u7A7A650 kN\u3001\u6BD4\u63A8\u529B 285\uFF0F320 s\u3002\u30B8\u30F3\u30D0\u30EB6\xB0\u3002" },
  engineVacLarge: { name: "\u5927\u578B\u771F\u7A7A\u7528\u30A8\u30F3\u30B8\u30F3", code: "VX-250", cat: "\u63A8\u9032", mass: 1200, thrust: 25e4, isp: 365, ispSeaLevel: 120, size: [2.5, 3, 2.5], gimbal: 6, gimbalPivot: [0, 0.45, 0], desc: "\u76F4\u5F842.5 m\u3002\u63A8\u529B \u6D77\u976282.2\uFF0F\u771F\u7A7A250 kN\u3001\u6BD4\u63A8\u529B 120\uFF0F365 s\u3002\u30B8\u30F3\u30D0\u30EB6\xB0\u3002" },
  battery: { name: "\u30D0\u30C3\u30C6\u30EA\u30FC", code: "BP-1000", cat: "\u88C5\u5099", mass: 35, size: [0.8, 0.3, 0.5], battery: 1e3, desc: "1000 EC\u306E\u84C4\u96FB\u6C60\u3002\u6A5F\u4F53\u5168\u4F53\u3078\u7D66\u96FB\u3057\u3001\u592A\u967D\u96FB\u6C60\u304B\u3089\u5145\u96FB\u3002\u59FF\u52E2\u5236\u5FA1\u88C5\u7F6E\u306F\u5185\u8535\u3057\u307E\u305B\u3093\u3002" },
  landingLeg: { name: "\u56FA\u5B9A\u5F0F\u7740\u9678\u811A", code: "LL-16", cat: "\u69CB\u9020", mass: 45, size: [0.65, 1.6, 0.65], landingLeg: true, desc: "\u5E4565 cm\u306E\u63A5\u5730\u30D1\u30C3\u30C9\u3068\u652F\u67F1\u3002\u56FA\u5B9A\u5F0F\u3002\u56DB\u811A\u3067\u63A8\u9032\u5668\u3092\u5730\u9762\u304B\u3089\u96E2\u3057\u3001\u4F4E\u901F\u3067\u63A5\u5730\u3057\u3066\u304F\u3060\u3055\u3044\u3002" },
  heatShield: { name: "\u71B1\u30B7\u30FC\u30EB\u30C9", code: "HS-20", cat: "\u69CB\u9020", mass: 70, size: [2, 0.28, 2], heatShield: true, shieldRadius: 1, shieldNormal: [0, -1, 0], ablator: 40, noseRadius: 1, maxTemperature: 1800, desc: "\u76F4\u5F842 m\u306E\u66F2\u9762\u8010\u71B1\u6750\u3002\u8336\u8272\u306E\u9762\uFF08\u30ED\u30FC\u30AB\u30EB\u2212Y\uFF09\u3092\u9032\u884C\u65B9\u5411\u3078\u3002\u6D88\u8017\u675040 kg\u3067\u52A0\u71B1\u3092\u5438\u53CE\u3002" },
  dockingPort: { name: "\u30C9\u30C3\u30AD\u30F3\u30B0\u30DD\u30FC\u30C8", code: "DP-12", cat: "\u69CB\u9020", mass: 55, size: [1.25, 0.242, 1.25], docking: true, dockFace: 0.121, desc: "\u6B63\u9762\u306F\u30ED\u30FC\u30AB\u30EB+Y\u3002\u30DD\u30FC\u30C8\u9762\u3092\u5411\u304D\u5408\u308F\u305B\u3066\u4F4E\u901F\u3067\u7D50\u5408\u3002" },
  rcs: { name: "RCS\u30D6\u30ED\u30C3\u30AF", code: "RC-6", cat: "\u63A8\u9032", mass: 16, monoprop: 12, rcsThrust: 120, rcsIsp: 65, size: [0.48, 0.48, 0.48], desc: "6\u65B9\u5411\u30FB\u5404120 N\u3002\u5185\u8535\u5358\u4E00\u63A8\u9032\u526412 kg\u3002\u914D\u7F6E\u3068\u91CD\u5FC3\u3067\u59FF\u52E2\u5236\u5FA1\u306E\u52B9\u304D\u304C\u5909\u308F\u308A\u307E\u3059\u3002" },
  capsule: { name: "\u30B3\u30DE\u30F3\u30C9\u30DD\u30C3\u30C9", code: "CP-1", cat: "\u6307\u4EE4", mass: 620, size: [1.25, 1.3, 1.25], control: true, reactionTorque: 7e3, battery: 1e3, desc: "\u8010\u71B1\u5916\u6BBB\u3068\u59FF\u52E2\u5236\u5FA1\u3092\u5099\u3048\u308B\u6709\u4EBA\u30AB\u30D7\u30BB\u30EB\u3002" },
  probe: { name: "\u63A2\u67FB\u30B3\u30A2", code: "OC-4", cat: "\u6307\u4EE4", mass: 90, size: [1.25, 0.4, 1.25], control: true, reactionTorque: 1200, battery: 200, desc: "\u5C0F\u578B\u7121\u4EBA\u6A5F\u306E\u305F\u3081\u306E\u8EFD\u91CF\u5236\u5FA1\u30E6\u30CB\u30C3\u30C8\u3002" },
  cockpit: { aircraftControl: true, name: "\u30B3\u30C3\u30AF\u30D4\u30C3\u30C8", code: "FC-2", cat: "\u6307\u4EE4", mass: 510, size: [1.25, 2, 1.25], control: true, battery: 500, desc: "\u822A\u7A7A\u6A5F\u30FB\u30ED\u30FC\u30D0\u30FC\u5411\u3051\u306E\u5E83\u8996\u754C\u30AD\u30E3\u30CE\u30D4\u30FC\u3002" },
  tank: { name: "\u4E2D\u578B\u30BF\u30F3\u30AF", code: "FT-200", cat: "\u71C3\u6599", mass: 150, fuel: 1800, size: [1.25, 2, 1.25], desc: "\u76F4\u5F841.25 m\u30FB\u63A8\u9032\u52641800 kg\u3002\u540C\u3058\u71C3\u6599\u7CFB\u7D71\u3078\u63A8\u9032\u5264\u3092\u4F9B\u7D66\u3002\u5206\u96E2\u30EA\u30F3\u30B0\u3092\u8D8A\u3048\u3066\u306F\u6D41\u308C\u307E\u305B\u3093\u3002" },
  engine: { name: "\u6DB2\u4F53\u71C3\u6599\u30A8\u30F3\u30B8\u30F3", code: "RE-45", cat: "\u63A8\u9032", mass: 270, thrust: 45e3, isp: 300, size: [1.25, 1.2, 1.25], gimbal: 6, gimbalPivot: [0, 0.16, 0], desc: "45 kN\u30FB\u6700\u59276\u5EA6\u306E\u30B8\u30F3\u30D0\u30EB\u3002\u30CE\u30BA\u30EB\u3092\u50BE\u3051\u3066\u63A8\u529B\u65B9\u5411\u3092\u5236\u5FA1\u3002" },
  jet: { name: "\u30BF\u30FC\u30DC\u30B8\u30A7\u30C3\u30C8", code: "TJ-18", cat: "\u63A8\u9032", mass: 230, thrust: 18e3, isp: 1800, air: true, size: [1.25, 1.2, 1.25], desc: "\u5927\u6C17\u4E2D\u5C02\u7528\u3002\u9AD8\u5EA6\u3068\u3068\u3082\u306B\u63A8\u529B\u304C\u4F4E\u4E0B\u3059\u308B\u3002" },
  propeller: { name: "\u30B9\u30AF\u30EA\u30E5\u30FC", code: "MP-6", cat: "\u63A8\u9032", mass: 60, thrust: 6e3, isp: 3e3, water: true, size: [0.8, 0.5, 0.8], desc: "\u6C34\u4E2D\u5C02\u7528\u63A8\u9032\u5668\u3002\u8239\u30FB\u6F5C\u6C34\u8247\u306E\u63A8\u9032\u306B\u3002" },
  nose: { streamlinedNose: true, name: "\u30CE\u30FC\u30BA\u30B3\u30FC\u30F3", code: "NC-1", cat: "\u69CB\u9020", mass: 65, size: [1.25, 1, 1.25], desc: "\u6A5F\u9996\u3092\u8986\u3046\u8EFD\u91CF\u306E\u6574\u6D41\u30B3\u30FC\u30F3\u3002" },
  decoupler: { name: "\u5206\u96E2\u30EA\u30F3\u30B0", code: "DC-12", cat: "\u69CB\u9020", mass: 40, size: [1.25, 0.22, 1.25], decoupler: true, desc: "\u30B9\u30C6\u30FC\u30B8\u5B9F\u884C\u6642\u3001\u3053\u306E\u90E8\u54C1\u304B\u3089\u5148\u306E\u63A5\u7D9A\u679D\u3092\u5206\u96E2\u3002" },
  truss: { name: "\u69CB\u9020\u30D5\u30EC\u30FC\u30E0", code: "TR-1", cat: "\u69CB\u9020", mass: 65, size: [1, 1, 1], desc: "\u30ED\u30FC\u30D0\u30FC\u3084\u5B87\u5B99\u6A5F\u306E\u9AA8\u7D44\u307F\u30026\u65B9\u5411\u306B\u63A5\u7D9A\u53EF\u80FD\u3002" },
  wing: { rootWing: true, name: "\u4E3B\u7FFC\u30FB\u56FA\u5B9A\u7FFC", code: "SW-2", cat: "\u7A7A\u529B", mass: 55, size: [2, 1.6, 0.12], wing: 2.1, ac: [0.8, 0.13, 0], massCenter: [0.8, -0.2, 0], chord: 1.1, desc: "\u7A7A\u6C17\u901F\u5EA6\u3068\u8FCE\u89D2\u304B\u3089\u63DA\u529B\u304C\u767A\u751F\u3002\u57FA\u90E8\u306F\u30ED\u30FC\u30AB\u30EBX=0\u3002" },
  fin: { rootWing: true, name: "\u53EF\u52D5\u30ED\u30B1\u30C3\u30C8\u30D5\u30A3\u30F3", code: "RF-2", cat: "\u7A7A\u529B", mass: 55, size: [2, 1.6, 0.12], model: "wing", wing: 2.1, ac: [0.8, 0.13, 0], massCenter: [0.8, -0.2, 0], chord: 1.1, controlAxis: "auto", maxDeflection: 18, hingeY: 0.13, desc: "\u5168\u904A\u52D5\u30D5\u30A3\u30F3\u3002\u914D\u7F6E\u306B\u5408\u308F\u305B\u3066\u30D4\u30C3\u30C1\u30FB\u30E8\u30FC\u30FB\u30ED\u30FC\u30EB\u3078\u6DF7\u5408\u3002\u6C17\u6D41\u304C\u5FC5\u8981\u3002" },
  stabilizer: { name: "\u6C34\u5E73\u30FB\u5782\u76F4\u5B89\u5B9A\u677F", code: "ST-1", cat: "\u7A7A\u529B", mass: 25, size: [1.8, 0.65, 0.09], wing: 1.05, chord: 0.65, ac: [0, 0.16, 0], desc: "\u56FA\u5B9A\u5B89\u5B9A\u677F\u3002\u56DE\u8EE2\u3055\u305B\u3066\u5782\u76F4\u5C3E\u7FFC\u306B\u3082\u4F7F\u3048\u307E\u3059\u3002" },
  elevator: { name: "\u30A8\u30EC\u30D9\u30FC\u30BF\u30FC", code: "EL-1", cat: "\u7A7A\u529B", mass: 12, size: [1.8, 0.4, 0.08], wing: 0.72, chord: 0.4, ac: [0, 0.1, 0], controlAxis: "pitch", maxDeflection: 25, desc: "\u6C34\u5E73\u5C3E\u7FFC\u306E\u6607\u964D\u8235\u3002\u7A7A\u6C17\u901F\u5EA6\u3068\u91CD\u5FC3\u304B\u3089\u306E\u8155\u3067\u52B9\u304D\u304C\u5909\u5316\u3002" },
  aileron: { name: "\u30A8\u30EB\u30ED\u30F3", code: "AL-1", cat: "\u7A7A\u529B", mass: 10, size: [1.4, 0.3, 0.07], wing: 0.42, chord: 0.3, ac: [0, 0.075, 0], controlAxis: "roll", maxDeflection: 22, desc: "\u4E3B\u7FFC\u5F8C\u7E01\u306E\u72EC\u7ACB\u3057\u305F\u88DC\u52A9\u7FFC\u3002\u5DE6\u53F3\u306E\u63DA\u529B\u5DEE\u3067\u30ED\u30FC\u30EB\u3002" },
  rudder: { name: "\u30E9\u30C0\u30FC", code: "RD-1", cat: "\u7A7A\u529B", mass: 10, size: [0.8, 0.4, 0.07], wing: 0.32, chord: 0.4, ac: [0, 0.1, 0], controlAxis: "yaw", maxDeflection: 28, desc: "\u5782\u76F4\u5C3E\u7FFC\u306E\u65B9\u5411\u8235\u3002\u6A2A\u65B9\u5411\u306E\u7A7A\u6C17\u529B\u3067\u30E8\u30FC\u3092\u5236\u5FA1\u3002" },
  nosegear: { name: "\u64CD\u5411\u524D\u811A", code: "NG-1", cat: "\u8D70\u884C", mass: 35, size: [0.34, 0.7, 0.7], wheel: true, steer: true, model: "wheel", desc: "\u524D\u8F2A1\u8F2A\u306E\u64CD\u5411\u811A\u3002\u5730\u4E0A\u306EA/D\u5165\u529B\u3067\u64CD\u5411\u3002" },
  maingear: { name: "\u4E3B\u811A", code: "MG-1", cat: "\u8D70\u884C", mass: 45, size: [0.34, 0.7, 0.7], wheel: true, model: "wheel", desc: "\u822A\u7A7A\u6A5F\u306E\u81EA\u7531\u8EE2\u52D5\u3059\u308B\u4E3B\u811A\u3002\u30D6\u30EC\u30FC\u30AD\u4ED8\u304D\u3002" },
  wheel: { name: "\u99C6\u52D5\u8F2A", code: "RW-7", cat: "\u8D70\u884C", mass: 45, size: [0.34, 0.7, 0.7], wheel: true, steer: true, desc: "\u63A5\u5730\u4E2D\u306B\u99C6\u52D5\u30FB\u30D6\u30EC\u30FC\u30AD\u30FB\u64CD\u8235\u3067\u304D\u308B\u30B5\u30B9\u30DA\u30F3\u30B7\u30E7\u30F3\u8F2A\u3002" },
  parachute: { name: "\u56DE\u53CE\u30D1\u30E9\u30B7\u30E5\u30FC\u30C8", code: "RC-14", cat: "\u88C5\u5099", mass: 80, size: [0.8, 0.4, 0.8], parachute: 154, maxTemperature: 500, desc: "\u8010\u71B1\u9650\u754C500 K\u3002\u518D\u7A81\u5165\u4E2D\u306F\u71B1\u30B7\u30FC\u30EB\u30C9\u306E\u80CC\u5F8C\u306B\u3002H\u3067\u5F85\u6A5F\u3002\u9AD8\u5EA65 km\u4EE5\u4E0B\u30FB250 m/s\u672A\u6E80\u3067\u7E2E\u5E06\u30011.5 km\u4EE5\u4E0B\u30FB80 m/s\u672A\u6E80\u3067\u5168\u958B\u3002" },
  solar: { name: "\u30BD\u30FC\u30E9\u30FC\u30D1\u30CD\u30EB", code: "SP-2", cat: "\u88C5\u5099", mass: 22, size: [2, 1, 0.08], solarPower: 0.8, desc: "\u6700\u59270.8 EC/s\u3002\u8868\u9762\u306E\u5411\u304D\u3068\u5929\u4F53\u306E\u5F71\u3067\u767A\u96FB\u91CF\u304C\u5909\u5316\u3002" },
  pontoon: { name: "\u30D5\u30ED\u30FC\u30C8", code: "FL-3", cat: "\u8239\u8236", mass: 85, size: [1, 3, 0.8], volume: 1.9, desc: "\u6C34\u5BC6\u306E\u6D6E\u4F53\u3002\u6C34\u6CA1\u4F53\u7A4D\u306B\u5FDC\u3058\u305F\u6D6E\u529B\u3092\u751F\u3080\u3002" },
  ballast: { name: "\u30D0\u30E9\u30B9\u30C8\u30BF\u30F3\u30AF", code: "BT-1", cat: "\u8239\u8236", mass: 110, size: [1.25, 1, 1.25], volume: 1.05, ballast: 1050, desc: "\u6CE8\u6392\u6C34\u3067\u8CEA\u91CF\u3092\u5909\u3048\u3001\u6D6E\u4E0A\u30FB\u6F5C\u822A\u3092\u8ABF\u6574\u3059\u308B\u3002" }
};
installLargeParts(PARTS);
installCargoParts(PARTS);
function nodes(type) {
  const d = PARTS[type], [x, y, z] = d.size;
  if (d.attachmentNodes) return d.attachmentNodes.map((n) => [...n]);
  if (d.rootWing) return [[0, 0, 0, -1, 0, 0], [x, 0, 0, 1, 0, 0]];
  return [[0, y / 2, 0, 0, 1, 0], [0, -y / 2, 0, 0, -1, 0], [x / 2, 0, 0, 1, 0, 0], [-x / 2, 0, 0, -1, 0, 0], [0, 0, z / 2, 0, 0, 1], [0, 0, -z / 2, 0, 0, -1]];
}

// dist/failure-events.js
var FAILURE_EVENT_LIMIT = 64;
function recordFailure(f, part, cause, { speed = 0, position } = {}) {
  if (!part || !["impact", "thermal", "structural"].includes(cause)) throw Error("Invalid failure cause");
  f.failureEvents ??= [];
  if (f.failureEvents.some((e) => e.partId === part.id)) return null;
  const d = PARTS[part.type], fuel = Math.max(0, f.fuel.get(part.id) || 0);
  const event = {
    id: crypto.randomUUID(),
    partId: part.id,
    type: part.type,
    cause,
    time: f.universalTime,
    position: position?.toArray() ?? f.pos.toArray(),
    velocity: f.vel.toArray(),
    speed: Math.max(0, speed),
    fuel,
    temperature: f.thermal.get(part.id)?.temperature ?? 288.15,
    effect: fuel > 0 && (d.fuel || d.monoprop) ? "fuel-burst" : "fragments"
  };
  f.failureEvents.push(event);
  if (f.failureEvents.length > FAILURE_EVENT_LIMIT) f.failureEvents.shift();
  return event;
}
function validateFailureEvents(value) {
  if (value === void 0) return [];
  const fail = () => {
    throw Error("\u7834\u640D\u5C65\u6B74\u304C\u4E0D\u6B63\u3067\u3059");
  }, ids = /* @__PURE__ */ new Set();
  if (!Array.isArray(value) || value.length > FAILURE_EVENT_LIMIT) fail();
  let last = -1;
  for (const e of value) {
    if (!e || typeof e.id !== "string" || !e.id.length || e.id.length > 200 || ids.has(e.id) || typeof e.partId !== "string" || !e.partId.length || e.partId.length > 200 || !Object.hasOwn(PARTS, e.type) || !["impact", "thermal", "structural"].includes(e.cause)) fail();
    ids.add(e.id);
    if (!["time", "speed", "fuel", "temperature"].every((k) => Number.isFinite(e[k]) && e[k] >= 0 && e[k] <= 1e12) || e.time < last) fail();
    last = e.time;
    for (const k of ["position", "velocity"]) if (!Array.isArray(e[k]) || e[k].length !== 3 || e[k].some((n) => !Number.isFinite(n) || Math.abs(n) > 1e12)) fail();
    const d = PARTS[e.type];
    if (e.fuel > (d.fuel || d.monoprop || 0) || e.effect !== (e.fuel > 0 && (d.fuel || d.monoprop) ? "fuel-burst" : "fragments")) fail();
  }
  return structuredClone(value);
}

// dist/orbital-ascent-settings.js
function orbitalAscentSettings(value = {}) {
  const altitude = value.altitude ?? 12e4, inclination = value.inclination ?? 0;
  if (!Number.isFinite(altitude) || altitude < 8e4 || altitude > 5e5 || !Number.isFinite(inclination) || inclination < 0 || inclination > 180) throw Error("\u9AD8\u5EA680\u301C500 km\u30FB\u50BE\u659C\u89D20\u301C180\xB0\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
  return { altitude, inclination };
}

// dist/runway-selection.js
function runwayEnd(value = "09") {
  if (!["09", "27"].includes(value)) throw Error("Unknown runway end");
  return value;
}
function createRunwaySelection() {
  let end = "09", flight = null;
  const listeners = /* @__PURE__ */ new Set();
  const publish = (value) => {
    if (value === end) return;
    end = value;
    for (const listener of listeners) listener(end);
  };
  return { get end() {
    return end;
  }, bind(next) {
    if (next === flight) return;
    const value = runwayEnd(next?.runwayEnd);
    flight = next;
    publish(value);
  }, set(value) {
    value = runwayEnd(value);
    if (flight) flight.runwayEnd = value;
    publish(value);
  }, subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  } };
}
var runwaySelection = createRunwaySelection();

// dist/cruise-pilot.js
import * as T6 from "./vendor/three/three.module.js";

// dist/celestial.js
import * as T2 from "./vendor/three/three.module.js";

// dist/planet.js
import * as T from "./vendor/three/three.module.js";
var PLANET = { radius: 6e5, mu: 35316e8, atmosphereTop: 7e4 };
var center = new T.Vector3(0, -PLANET.radius, 0);
var pressure = [[0, 101.325, 0, -0.01501631], [1241.025, 84.02916, -0.01289846, -0.01289826], [2439.593, 69.68138, -0.01107876, -0.01107859], [3597.11, 57.78001, -9515483e-9, -9515338e-9], [4714.942, 47.90862, -817254e-8, -8172415e-9], [5794.409, 39.72148, -701892e-8, -7018813e-9], [6836.791, 32.93169, -6027969e-9, -6027877e-9], [7843.328, 27.30109, -5176778e-9, -51767e-7], [8815.22, 22.63206, -4445662e-9, -4445578e-9], [10786.42, 15.3684, -3016528e-9, -301646e-8], [12101.4, 11.87313, -2329273e-9, -232922e-8], [13417.05, 9.172798, -1798594e-9, -1798554e-9], [16678.47, 4.842261, -9448537e-10, -9448319e-10], [21143.1, 2.050097, -3894095e-10, -3894005e-10], [26977.92, 0.6905929, -1252565e-10, -1252534e-10], [33593.82, 0.2201734, -3626878e-11, -3626788e-11], [42081.87, 0.05768469, -9063159e-12, -9062975e-12], [49312.13, 0.01753794, -3029397e-12, -3029335e-12], [56669.95, 4591824e-9, -8827175e-13, -8826996e-13], [62300.84, 1497072e-9, -3077091e-13, -3077031e-13], [7e4, 0, 0, 0]];
var temperature = [[0, 288.15, 0, -8125e-6], [8815.22, 216.65, -8096968e-9, 0], [16050.39, 216.65, 0, 1242164e-9], [25729.23, 228.65, 1237475e-9, 3464929e-9], [37879.44, 270.65, 344855e-8, 0], [41129.24, 270.65, 0, -3444189e-9], [57440.13, 214.65, -3422425e-9, -2444589e-9], [68797.88, 186.946, -2433851e-9, 0], [7e4, 186.946, 0, 0]];
function curve(points, h) {
  h = Math.max(0, h);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (h <= b[0]) {
      const width = b[0] - a[0], t = (h - a[0]) / width, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * width * a[3] + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * width * b[2];
    }
  }
  return points.at(-1)[1];
}
function atmosphere(h) {
  const temp = curve(temperature, h), p = h >= PLANET.atmosphereTop ? 0 : Math.max(0, curve(pressure, h)) * 1e3;
  return { pressure: p, temperature: temp, density: p * 0.0289644 / (8.314462618 * temp) };
}

// dist/celestial.js
var MOON = Object.freeze({ id: "moon", name: "\u6708", radius: 2e5, mu: 651383975207807e-4, atmosphereTop: 0, orbitRadius: 12e6, phase: 1.70000004768372, sphereOfInfluence: 242955911656475e-8 });
var PRIMARY = Object.freeze({ ...PLANET, id: "planet", name: "\u6BCD\u661F" });
var MOON_RATE = Math.sqrt(PRIMARY.mu / MOON.orbitRadius ** 3);
var MOON_PERIOD = 2 * Math.PI / MOON_RATE;
function bodyState(body, time = 0) {
  if (body.id === "planet") return { position: center.clone(), velocity: new T2.Vector3() };
  if (body.id !== "moon") throw Error("\u672A\u77E5\u306E\u5929\u4F53\u3067\u3059");
  const angle = MOON.phase + time % MOON_PERIOD * MOON_RATE, c = Math.cos(angle), s = Math.sin(angle), r = MOON.orbitRadius;
  return { position: center.clone().add(new T2.Vector3(0, r * c, r * s)), velocity: new T2.Vector3(0, -r * MOON_RATE * s, r * MOON_RATE * c) };
}
function referenceBody(position, time = 0) {
  return position.distanceToSquared(bodyState(MOON, time).position) < MOON.sphereOfInfluence ** 2 ? MOON : PRIMARY;
}
function relativeMotion(position, velocity, time = 0, body = referenceBody(position, time)) {
  const state = bodyState(body, time);
  return { body, center: state.position, bodyVelocity: state.velocity, r: position.clone().sub(state.position), velocity: velocity.clone().sub(state.velocity) };
}
function bodyAltitude(position, time = 0, body = referenceBody(position, time)) {
  return position.distanceTo(bodyState(body, time).position) - body.radius;
}
function bodyUp(position, time = 0, body = referenceBody(position, time)) {
  return position.clone().sub(bodyState(body, time).position).normalize();
}
function bodyGravity(position, time = 0, body = referenceBody(position, time)) {
  const r = position.clone().sub(bodyState(body, time).position);
  return r.multiplyScalar(-body.mu / Math.max(1, r.length()) ** 3);
}
function bodyOrbitState(position, velocity, time = 0, body = referenceBody(position, time)) {
  const relative = relativeMotion(position, velocity, time, body), r = relative.r, v = relative.velocity, radius = r.length(), h = r.clone().cross(v), evec = v.clone().cross(h).divideScalar(body.mu).sub(r.clone().divideScalar(radius)), e = evec.length(), energy = v.lengthSq() / 2 - body.mu / radius, p = h.lengthSq() / body.mu, a = energy < 0 ? -body.mu / (2 * energy) : Infinity;
  const periapsis = p / (1 + e) - body.radius, apoapsis = energy < 0 ? a * (1 + e) - body.radius : Infinity;
  return { body, bodyId: body.id, center: relative.center, bodyVelocity: relative.bodyVelocity, relativeVelocity: v, universalTime: time, altitude: radius - body.radius, speed: v.length(), vertical: v.dot(r) / radius, circularSpeed: Math.sqrt(body.mu / radius), gravity: body.mu / radius ** 2, eccentricity: e, energy, periapsis, apoapsis, period: energy < 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / body.mu) : Infinity, p, evec, normal: h.normalize(), radius, r, stable: energy < 0 && periapsis > body.atmosphereTop };
}
function localStep(r, v, acceleration, mu, dt) {
  const gravity = (r2) => r2.clone().multiplyScalar(-mu / Math.max(1, r2.length()) ** 3);
  const half = v.clone().addScaledVector(gravity(r).add(acceleration), dt / 2), next = r.clone().addScaledVector(half, dt);
  return { position: next, velocity: half.addScaledVector(gravity(next).add(acceleration), dt / 2) };
}
function advanceCelestialOrbit(position, velocity, acceleration, dt, time = 0) {
  const relative = relativeMotion(position, velocity, time), body = relative.body;
  const next = localStep(relative.r, relative.velocity, acceleration, body.mu, dt), end = bodyState(body, time + dt);
  const pos = next.position.add(end.position), vel = next.velocity.add(end.velocity);
  return { pos, vel, bodyId: referenceBody(pos, time + dt).id };
}
function lunarTrial(time = 0, altitude = 2e4) {
  const state = bodyState(MOON, time), r = MOON.radius + altitude;
  return { pos: state.position.add(new T2.Vector3(0, r, 0)), vel: state.velocity.add(new T2.Vector3(0, 0, Math.sqrt(MOON.mu / r))) };
}

// dist/surface-frame.js
import * as T3 from "./vendor/three/three.module.js";
var PRIMARY_ROTATION_PERIOD = 21549.4251830898;
var PRIMARY_ROTATION_RATE = 2 * Math.PI / PRIMARY_ROTATION_PERIOD;
function surfaceAngularVelocity(body = PRIMARY) {
  return new T3.Vector3(body.id === "planet" ? PRIMARY_ROTATION_RATE : 0, 0, 0);
}
function surfaceOrientation(time = 0, body = PRIMARY) {
  return new T3.Quaternion().setFromAxisAngle(new T3.Vector3(1, 0, 0), body.id === "planet" ? time % PRIMARY_ROTATION_PERIOD * PRIMARY_ROTATION_RATE : 0);
}
function launchSiteOrientation(environment) {
  return new T3.Quaternion().setFromAxisAngle(new T3.Vector3(0, 0, 1), (environment === "runway" ? -2e3 : environment === "water" ? 4e3 : 0) / PRIMARY.radius);
}
function fixedToInertial(point, time = 0, body = PRIMARY) {
  return point.clone().applyQuaternion(surfaceOrientation(time, body)).add(bodyState(body, time).position);
}
function inertialToFixed(point, time = 0, body = referenceBody(point, time)) {
  return point.clone().sub(bodyState(body, time).position).applyQuaternion(surfaceOrientation(time, body).invert());
}
function surfaceVelocity(point, time = 0, body = referenceBody(point, time)) {
  const state = bodyState(body, time);
  return surfaceAngularVelocity(body).cross(point.clone().sub(state.position)).add(state.velocity);
}
function surfaceRelativeVelocity(point, velocity, time = 0, body = referenceBody(point, time)) {
  return velocity.clone().sub(surfaceVelocity(point, time, body));
}
function rotatingFrameCorrection(point, relativeVelocity, time = 0, body = referenceBody(point, time)) {
  const omega = surfaceAngularVelocity(body), r = point.clone().sub(bodyState(body, time).position);
  return omega.clone().cross(relativeVelocity).multiplyScalar(-2).sub(omega.clone().cross(omega.clone().cross(r)));
}
function frozenSurfaceState(v, time, dt) {
  const body = referenceBody(v.pos, time), turn = surfaceOrientation(dt, body);
  const pos = fixedToInertial(inertialToFixed(v.pos, time, body), time + dt, body);
  const q = v.q.clone().premultiply(turn).normalize();
  const com = pos.clone().add(v.stats.com.clone().applyQuaternion(q));
  return { pos, q, vel: surfaceVelocity(com, time + dt, body), omega: surfaceAngularVelocity(body), turn };
}

// dist/navigation.js
import * as T4 from "./vendor/three/three.module.js";
var SAS_MODES = { dock: "\u30DD\u30FC\u30C8\u9762\u3092\u6574\u5217", target: "\u76EE\u6A19\u65B9\u5411", relativeRetrograde: "\u76F8\u5BFE\u901F\u5EA6\u3092\u6E1B\u3089\u3059\u65B9\u5411", maneuver: "\u4E88\u5B9A\u5674\u5C04", hold: "\u59FF\u52E2\u4FDD\u6301", prograde: "\u9806\u884C", retrograde: "\u9006\u884C", radial: "\u5929\u9802", antiradial: "\u5929\u5E95", normal: "\u8ECC\u9053\u9762\uFF0B", antinormal: "\u8ECC\u9053\u9762\u2212" };
function navigationVelocity(pos, vel, time = 0, frame = "orbit") {
  return frame === "surface" ? surfaceRelativeVelocity(pos, vel, time) : relativeMotion(pos, vel, time).velocity;
}
function navDirections(pos, vel, time = 0, frame = "orbit") {
  const velocity = navigationVelocity(pos, vel, time, frame), radial = bodyUp(pos, time), prograde = velocity.length() > 0.5 ? velocity.clone().normalize() : null, normal = prograde ? radial.clone().cross(prograde) : null;
  if (normal && normal.lengthSq() > 1e-8) normal.normalize();
  else if (normal) normal.set(0, 0, 0);
  return { radial, antiradial: radial.clone().negate(), prograde, retrograde: prograde?.clone().negate(), normal: normal?.lengthSq() ? normal : null, antinormal: normal?.lengthSq() ? normal.clone().negate() : null };
}
function attitudeTarget(q, forward, target) {
  if (!target) return null;
  return new T4.Quaternion().setFromUnitVectors(forward.clone().applyQuaternion(q).normalize(), target.clone().normalize()).multiply(q).normalize();
}

// dist/aero.js
import * as T5 from "./vendor/three/three.module.js";

// dist/resources.js
var engineMaxThrust = (p) => (PARTS[p.type].thrust || 0) * (p.thrustLimit ?? 1);
function engineIsp(p, pressure2 = 0) {
  const d = PARTS[p.type];
  return d.ispSeaLevel === void 0 ? d.isp : d.isp + (d.ispSeaLevel - d.isp) * Math.max(0, Math.min(1, pressure2 / 101325));
}
var createFuel = (parts) => new Map(parts.filter((p) => PARTS[p.type].fuel || PARTS[p.type].monoprop).map((p) => [p.id, (PARTS[p.type].fuel || PARTS[p.type].monoprop) * (p.fuelLoad ?? 1)]));
var fuelMass = (p, fuel) => fuel instanceof Map ? fuel.get(p.id) || 0 : (PARTS[p.type].fuel || PARTS[p.type].monoprop || 0) * fuel * (p.fuelLoad ?? 1);
function fuelNetworks(parts) {
  const byId = new Map(parts.map((p) => [p.id, p])), groups = /* @__PURE__ */ new Map(), network = /* @__PURE__ */ new Map();
  for (const p of parts) {
    let root = p;
    while (root.parent && byId.has(root.parent) && !PARTS[root.type].decoupler && !(PARTS[root.type].docking && root.fuelCrossfeed === false) && !(PARTS[byId.get(root.parent).type].docking && byId.get(root.parent).fuelCrossfeed === false)) root = byId.get(root.parent);
    if (!groups.has(root.id)) groups.set(root.id, { parts: [], tanks: [], engines: [] });
    const group = groups.get(root.id);
    group.parts.push(p);
    if (PARTS[p.type].fuel && p.fuelEnabled !== false) group.tanks.push(p);
    if (PARTS[p.type].thrust && !PARTS[p.type].water) group.engines.push(p);
    network.set(p.id, group);
  }
  return { groups: [...groups.values()], network };
}
function engineBurn(networks, fuel, active, throttle, density, dt, pressure2 = density / 1.225 * 101325) {
  const thrust = /* @__PURE__ */ new Map();
  for (const g of networks.groups) {
    const engines = g.engines.filter((p) => active.has(p.id)), requested = engines.map((p) => engineMaxThrust(p) * throttle * (PARTS[p.type].air ? density / 1.225 : engineIsp(p, pressure2) / PARTS[p.type].isp)), need = engines.reduce((s, p, i) => s + requested[i] * dt / (engineIsp(p, pressure2) * 9.81), 0), available = g.tanks.reduce((s, p) => s + (fuel.get(p.id) || 0), 0), fraction = need > 0 ? Math.min(1, available / need) : 0;
    engines.forEach((p, i) => thrust.set(p.id, requested[i] * fraction));
    if (available > 0 && need > 0) {
      const remaining = need >= available ? 0 : 1 - need / available;
      for (const p of g.tanks) fuel.set(p.id, (fuel.get(p.id) || 0) * remaining);
    }
  }
  return thrust;
}

// dist/aero.js
var partRotation = (p) => new T5.Quaternion().setFromEuler(new T5.Euler(...p.r));
function partMass(p, fuel = 1, ballast = 0, thermal = null) {
  const d = PARTS[p.type];
  return d.mass + fuelMass(p, fuel) + (d.ballast || 0) * ballast + (thermal?.get(p.id)?.ablator ?? d.ablator ?? 0);
}
function partCenter(p) {
  return new T5.Vector3(...PARTS[p.type].massCenter || [0, 0, 0]).applyQuaternion(partRotation(p)).add(new T5.Vector3(...p.p));
}
function aeroPoint(p) {
  return new T5.Vector3(...PARTS[p.type].ac || [0, 0, 0]).applyQuaternion(partRotation(p)).add(new T5.Vector3(...p.p));
}
function aeroAnalysis(parts, com) {
  const center2 = new T5.Vector3();
  let weight = 0, chord = 0, area = 0;
  for (const p of parts) {
    const d = PARTS[p.type];
    if (!d.wing) continue;
    const normal = new T5.Vector3(0, 0, 1).applyQuaternion(partRotation(p)), w = d.wing * normal.y ** 2;
    center2.addScaledVector(aeroPoint(p), w);
    weight += w;
    chord += w * (d.chord || 1);
    area += d.wing;
  }
  center2.divideScalar(weight || 1);
  chord /= weight || 1;
  return { center: center2, area, chord, weight, staticMargin: weight ? (com.z - center2.z) / (chord || 1) : null };
}
function surfaceForce(p, orientation, velocity, density, deflection = 0) {
  const d = PARTS[p.type], normal = new T5.Vector3(0, 0, 1), forward = new T5.Vector3(0, 1, 0), span = new T5.Vector3(1, 0, 0);
  const hinge = new T5.Quaternion().setFromAxisAngle(span, deflection);
  normal.applyQuaternion(hinge).applyQuaternion(orientation);
  forward.applyQuaternion(hinge).applyQuaternion(orientation);
  span.applyQuaternion(orientation);
  const flow = velocity.clone().addScaledVector(span, -velocity.dot(span)), speed = flow.length();
  if (speed < 0.05) return { force: new T5.Vector3(), alpha: 0, cl: 0, stalled: false };
  const alpha = Math.atan2(-flow.dot(normal), flow.dot(forward)), a = Math.abs(alpha), stall = 15 * Math.PI / 180;
  const cl = a <= stall ? 4.5 * alpha : Math.sign(alpha) * 1.18 * Math.cos(Math.min(Math.PI / 2, (a - stall) * 1.4));
  const cd = 0.022 + 0.065 * cl * cl + 1.2 * Math.sin(alpha) ** 2;
  const direction = flow.clone().normalize();
  const lift = normal.clone().addScaledVector(direction, -normal.dot(direction)).normalize();
  const q = 0.5 * density * speed * speed * d.wing;
  return { force: lift.multiplyScalar(q * cl).addScaledVector(direction, -q * cd), alpha, cl, stalled: a > stall };
}
function controlAxes(p) {
  const axis = PARTS[p.type].controlAxis;
  return Object.fromEntries(["pitch", "yaw", "roll"].map((name) => [name, p["control" + name[0].toUpperCase() + name.slice(1)] ?? (axis === "auto" || axis === name)]));
}
function controlDeflection(p, com, commands) {
  const d = PARTS[p.type];
  if (!d.controlAxis || p.controlEnabled === false) return 0;
  const n = new T5.Vector3(0, 0, 1).applyQuaternion(partRotation(p)), moment = aeroPoint(p).sub(com).cross(n), axes2 = controlAxes(p);
  const leverage = moment.length();
  moment.set(axes2.pitch ? moment.x : 0, axes2.yaw ? moment.y : 0, axes2.roll ? moment.z : 0);
  if (moment.length() < Math.max(1e-9, leverage * 1e-8)) return 0;
  moment.normalize();
  const intent = new T5.Vector3(commands.pitch || 0, commands.yaw || 0, commands.roll || 0);
  return T5.MathUtils.clamp(moment.dot(intent), -1, 1) * (d.maxDeflection || (d.controlAxis === "auto" ? 18 : 25)) * (p.controlLimit ?? 1) * Math.PI / 180;
}

// dist/cruise-pilot.js
var clamp = T6.MathUtils.clamp;
var rad = Math.PI / 180;
function cruiseSettings(value) {
  if (!value || !["altitude", "vertical"].includes(value.mode ?? "altitude") || !["speed", "altitude", "heading"].every((k) => Number.isFinite(value[k])) || value.speed < 40 || value.speed > 350 || value.altitude < 300 || value.altitude > 15e3 || value.heading < 0 || value.heading >= 360 || !Number.isFinite(value.vertical ?? 0) || Math.abs(value.vertical ?? 0) > 10) throw Error("\u5DE1\u822A\u76EE\u6A19\u306E\u7BC4\u56F2\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044");
  return { speed: value.speed, altitude: value.altitude, heading: value.heading, mode: value.mode ?? "altitude", vertical: value.vertical ?? 0 };
}

// dist/navigation-frame.js
function automaticNavigationFrame(altitude, body, previous = null) {
  const upper = Math.max(1e4, (body.atmosphereTop || 0) * 0.5), lower = upper * 0.8;
  if (previous === "orbit") return altitude <= lower ? "surface" : "orbit";
  return altitude >= upper ? "orbit" : "surface";
}
function setNavigationFrame(f, frame) {
  if (f.navigationFrame !== frame) {
    f.navigationFrame = frame;
    f.holdQ = f.q.clone();
  }
}
function updateNavigationFrame(f, { reset = false, time = f.universalTime } = {}) {
  if (f.navigationAuto === false) return f.navigationFrame;
  const point = f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), body = referenceBody(point, time);
  setNavigationFrame(f, automaticNavigationFrame(bodyAltitude(point, time, body), body, reset ? null : f.navigationFrame));
  return f.navigationFrame;
}

// dist/observation-quality.js
function copyObservationQuality(value, totals) {
  if (value === void 0) return void 0;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("\u89B3\u6E2C\u54C1\u8CEA\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059");
  const result = {};
  for (const key of ["day", "night"]) {
    const q = value[key];
    if (!q || !["received", "missed"].every((k) => Number.isFinite(q[k]) && q[k] >= 0 && q[k] <= 1e12) || q.received > totals[key] + 1e-5) throw Error("\u89B3\u6E2C\u54C1\u8CEA\u306E\u6E2C\u5B9A\u6642\u9593\u304C\u4E0D\u6B63\u3067\u3059");
    result[key] = { received: q.received, missed: q.missed };
  }
  return result;
}

// dist/delivery-sites.js
import * as T7 from "./vendor/three/three.module.js";
var DELIVERY_SITE = Object.freeze({ id: "north-station", name: "\u5317\u89B3\u6E2C\u70B9", north: 600, east: 0, radius: 30 });
var DELIVERY_SITES = Object.freeze([DELIVERY_SITE, Object.freeze({ id: "east-station", name: "\u6771\u89B3\u6E2C\u70B9", north: 0, east: 3e3, radius: 30 })]);
var deliverySite = (id) => DELIVERY_SITES.find((s) => s.id === id);
var selected = DELIVERY_SITE;
try {
  selected = deliverySite(localStorage.getItem("orbital-foundry-site")) ?? selected;
} catch {
}
function fixedSite(site) {
  const n = site.north / PRIMARY.radius, e = (site.east ?? 0) / PRIMARY.radius;
  return new T7.Vector3(Math.sin(n), Math.cos(n) * Math.cos(e), Math.cos(n) * Math.sin(e));
}
function deliveryDistance(point, time = 0, site = DELIVERY_SITE) {
  const fixed = inertialToFixed(point, time, PRIMARY);
  return fixed.angleTo(fixedSite(site)) * PRIMARY.radius;
}

// dist/observation.js
import * as T9 from "./vendor/three/three.module.js";

// dist/descent.js
import * as T8 from "./vendor/three/three.module.js";
function descentTelemetry(v) {
  const com = v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)), o = bodyOrbitState(com, v.vel, v.universalTime), up2 = o.r.clone().normalize();
  let clearance = Infinity;
  for (const p of v.parts) {
    const rotation = v.q.clone().multiply(partRotation(p)), c = partCenter(p).applyQuaternion(v.q).add(v.pos), [x, y, z] = PARTS[p.type].size;
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const d of [-1, 1]) {
      const corner = new T8.Vector3(a * x / 2, b * y / 2, d * z / 2).applyQuaternion(rotation).add(c);
      clearance = Math.min(clearance, corner.distanceTo(o.center) - o.body.radius);
    }
  }
  const air = o.bodyId === "planet" ? atmosphere(o.altitude) : { density: 0, pressure: 0 };
  const burns = engineBurn(v.networks, new Map(v.fuel), v.started ? v.active : /* @__PURE__ */ new Set(), 1, air.density, 1e-3, air.pressure), force = new T8.Vector3();
  for (const p of v.parts) {
    const thrust2 = burns.get(p.id) || 0;
    if (thrust2) force.addScaledVector(new T8.Vector3(0, 1, 0).applyQuaternion(partRotation(p)), thrust2);
  }
  const velocity = surfaceRelativeVelocity(com, v.vel, v.universalTime, o.body), speed = velocity.length();
  const thrust = force.length(), acceleration = thrust / v.stats.mass, netAcceleration = acceleration - o.gravity, vertical = velocity.dot(up2), horizontal = Math.sqrt(Math.max(0, speed ** 2 - vertical ** 2)), fall = Math.max(0, -vertical);
  const brakingDistance = netAcceleration > 0 ? speed ** 2 / (2 * netAcceleration) : Infinity, verticalBrakingDistance = netAcceleration > 0 ? fall * fall / (2 * netAcceleration) : Infinity;
  const tilt = force.lengthSq() ? force.normalize().applyQuaternion(v.q).angleTo(up2) * 180 / Math.PI : null;
  return { body: o.bodyId, energy: o.energy, periapsis: o.periapsis, apoapsis: o.apoapsis, clearance, vertical, horizontal, speed, gravity: o.gravity, thrust, acceleration, netAcceleration, hoverThrottle: acceleration > 0 ? o.gravity / acceleration : Infinity, brakingDistance, verticalBrakingDistance, tilt, landed: v.landed && !v.crashed, crashed: v.crashed, legs: v.parts.filter((p) => PARTS[p.type].landingLeg).length };
}

// dist/observation.js
var OBSERVATION_POWER = 0.1;
function createObservations(parts) {
  return new Map(parts.filter((p) => p.type === "probe").map((p) => [p.id, { enabled: false, day: 0, night: 0 }]));
}
function observationDemand(v, states = v.observations) {
  return v.crashed ? 0 : [...states].filter(([id, s]) => s.enabled && !v.thermal.get(id)?.failed).length * OBSERVATION_POWER;
}
function observationSite(v, id) {
  const p = v.parts.find((p2) => p2.id === id);
  if (!p) return null;
  const point = new T9.Vector3(...p.p).applyQuaternion(v.q).add(v.pos);
  return DELIVERY_SITES.find((site) => deliveryDistance(point, v.universalTime, site) <= site.radius) ?? null;
}
function observationReason(v, id) {
  const p = v.parts.find((p2) => p2.id === id), s = v.observations.get(id);
  if (!p || !s) return "\u89B3\u6E2C\u88C5\u7F6E\u306A\u3057";
  if (v.crashed || v.thermal.get(id)?.failed) return "\u6A5F\u4F53\u640D\u50B7";
  if (!s.enabled) return "\u505C\u6B62\u4E2D";
  const com = v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q));
  if (!observationSite(v, id)) return "\u89B3\u6E2C\u70B9\u306E\u7BC4\u56F2\u5916";
  if (!v.landed || surfaceRelativeVelocity(com, v.vel, v.universalTime).length() >= 0.5) return "\u63A5\u5730\u30FB\u9759\u6B62\u5F85\u3061";
  const d = descentTelemetry(v);
  if (d.body !== "planet" || Math.abs(d.clearance) > 0.5) return "\u63A5\u5730\u30FB\u9759\u6B62\u5F85\u3061";
  return "";
}
function advanceObservations(v, states, power, dt) {
  for (const [id, s] of states) {
    if (!s.enabled || observationReason({ ...v, observations: states }, id)) continue;
    const site = observationSite(v, id);
    if (!site) continue;
    const data = site.id === DELIVERY_SITE.id ? s : (s.sites ??= {})[site.id] ??= { day: 0, night: 0 };
    const key = power.eclipse ? "night" : "day";
    data[key] = Math.min(1e12, data[key] + dt * power.ratio);
    const quality = data.quality ??= { day: { received: 0, missed: 0 }, night: { received: 0, missed: 0 } };
    quality[key].received = Math.min(1e12, quality[key].received + dt * power.ratio);
    quality[key].missed = Math.min(1e12, quality[key].missed + dt * (1 - power.ratio));
  }
}

// dist/separation-name.js
function separationName(name, number) {
  if (!name) return "";
  const suffix = " / \u5206\u96E2 " + number;
  return name.slice(0, 80 - suffix.length) + suffix;
}
function restoreSeparationCounters(vessels) {
  for (const parent of vessels) for (const child of vessels) {
    if (parent === child) continue;
    const number = Number(child.vesselName?.match(/ \/ 分離 (\d+)$/)?.[1]);
    if (Number.isSafeInteger(number) && number > 0 && number <= 1e9 && child.vesselName === separationName(parent.vesselName, number)) parent.separationCount = Math.max(parent.separationCount, number);
  }
}

// dist/physics-migration.js
import * as T10 from "./vendor/three/three.module.js";
var PHYSICS_MODEL = "rotating-primary-v1";
function migrateLegacySurface(v) {
  const com = v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)), motion = relativeMotion(com, v.vel, v.universalTime);
  if (motion.body.id !== "planet") return false;
  const touching = v.parts.some((p) => {
    const point = partCenter(p).applyQuaternion(v.q).add(v.pos), up2 = bodyUp(point, v.universalTime, motion.body), q = v.q.clone().multiply(partRotation(p)), size = PARTS[p.type].size;
    const extent = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].reduce((sum, axis, i) => sum + Math.abs(new T10.Vector3(...axis).applyQuaternion(q).dot(up2)) * size[i] / 2, 0);
    const height = bodyAltitude(point, v.universalTime, motion.body);
    return height - extent < 0.5 && height + extent > -0.5;
  });
  if (!touching || motion.velocity.length() >= 0.8 || v.omega.length() >= 0.15) return false;
  v.vel.add(surfaceVelocity(com, v.universalTime, motion.body).sub(motion.bodyVelocity));
  v.omega.add(surfaceAngularVelocity(motion.body));
  return true;
}

// dist/universal-time.js
function validUniversalTime(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1e12) throw Error("\u5171\u901A\u6642\u523B\u304C\u4E0D\u6B63\u3067\u3059");
  return value;
}
function setUniversalTime(root, time) {
  validUniversalTime(time);
  root.universalTime = time;
  for (const child of root.detached) setUniversalTime(child, time);
  return time;
}

// dist/fleet.js
function fleet(root) {
  return [root, ...root.detached.flatMap(fleet)];
}
function canControl(vessel) {
  return !vessel.crashed && vessel.parts.some((p) => PARTS[p.type].control);
}

// dist/thermal.js
import * as T11 from "./vendor/three/three.module.js";
var THERMAL = { coefficient: 174e-6, sigma: 5670374419e-17, heatCapacity: 900, emissivity: 0.8, maxTemperature: 1100, ablatorEnergy: 2e7, ablationTemperature: 650, wakeTransmission: 0.025 };
function stagnationFlux(density, speed, radius) {
  return THERMAL.coefficient * Math.sqrt(Math.max(0, density) / Math.max(0.05, radius)) * Math.max(0, speed) ** 3;
}
function createThermal(parts, definitions = PARTS) {
  return new Map(parts.map((p) => [p.id, { temperature: 288.15, ablator: definitions[p.type].ablator || 0, failed: false }]));
}
function geometry(p, q, definitions) {
  const d = definitions[p.type], rotation = q.clone().multiply(new T11.Quaternion().setFromEuler(new T11.Euler(...p.r))), center2 = new T11.Vector3(...d.massCenter || [0, 0, 0]).applyQuaternion(rotation).add(new T11.Vector3(...p.p).applyQuaternion(q));
  return { p, d, rotation, center: center2 };
}
function projectedArea(g, direction) {
  const v = direction.clone().applyQuaternion(g.rotation.clone().invert()), [x, y, z] = g.d.size;
  return Math.abs(v.x) * y * z + Math.abs(v.y) * x * z + Math.abs(v.z) * x * y;
}
function shieldCoverage(part, shield, direction, q = new T11.Quaternion(), definitions = PARTS) {
  const g = geometry(part, q, definitions), s = geometry(shield, q, definitions);
  if (!s.d.heatShield || part.id === shield.id) return false;
  const n = new T11.Vector3(...s.d.shieldNormal || [0, -1, 0]).applyQuaternion(s.rotation), incidence = n.dot(direction);
  if (incidence < 0.5) return false;
  const face = s.center.clone().addScaledVector(n, s.d.size[1] / 2), [x, y, z] = g.d.size;
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
    const corner = new T11.Vector3(a * x / 2, b * y / 2, c * z / 2).applyQuaternion(g.rotation).add(g.center), distance = face.clone().sub(corner).dot(n) / incidence;
    if (distance < 0) return false;
    const hit = corner.addScaledVector(direction, distance);
    if (hit.distanceToSquared(face) > (s.d.shieldRadius || s.d.size[0] / 2) ** 2) return false;
  }
  return true;
}
function thermalStep(parts, states, q, velocity, air, dt, definitions = PARTS) {
  if (!Number.isFinite(dt) || dt <= 0) throw Error("Thermal step requires a positive finite duration");
  const speed = velocity.length(), direction = speed ? velocity.clone().divideScalar(speed) : new T11.Vector3(0, 1, 0), geometries = parts.map((p) => geometry(p, q, definitions)), shields = parts.filter((p) => definitions[p.type].heatShield && !states.get(p.id)?.failed), readings = /* @__PURE__ */ new Map();
  let hottest = null, consumed = 0;
  const count = Math.ceil(dt / 0.05), h = dt / count;
  for (const g of geometries) {
    const { p, d } = g, state = states.get(p.id);
    if (!state) throw Error("Missing thermal state: " + p.id);
    const area = projectedArea(g, direction), surface = 2 * (d.size[0] * d.size[1] + d.size[1] * d.size[2] + d.size[0] * d.size[2]), shielded = shields.some((s) => shieldCoverage(p, s, direction, q, definitions)), flux = stagnationFlux(air.density, speed, d.noseRadius || Math.min(...d.size) / 2), transmission = shielded ? THERMAL.wakeTransmission : 1, capacity = Math.max(1, d.mass) * (d.heatCapacity || THERMAL.heatCapacity), ambient = air.density > 1e-9 ? air.temperature : 3;
    let incoming = 0, radiated = 0, ablated = 0;
    for (let i = 0; i < count; i++) {
      const recovery = air.temperature + speed * speed / (2 * 1005), hotWall = Math.max(0, 1 - (state.temperature - air.temperature) / Math.max(1, recovery - air.temperature)), heat = flux * area * transmission * hotWall;
      const radiation = (d.emissivity || THERMAL.emissivity) * THERMAL.sigma * surface * (state.temperature ** 4 - ambient ** 4), convection = air.density * 10 * surface * (state.temperature - air.temperature), loss = radiation + convection;
      let energy = (heat - loss) * h;
      const ablativeFace = d.heatShield && new T11.Vector3(...d.shieldNormal || [0, -1, 0]).applyQuaternion(g.rotation).dot(direction) > 0.5;
      if (ablativeFace && state.ablator > 0 && energy > 0) {
        const sensible = Math.max(0, (d.ablationTemperature || THERMAL.ablationTemperature) - state.temperature) * capacity, available = Math.max(0, energy - sensible), burn = Math.min(state.ablator, available / (d.ablatorEnergy || THERMAL.ablatorEnergy));
        state.ablator -= burn;
        ablated += burn;
        energy -= burn * (d.ablatorEnergy || THERMAL.ablatorEnergy);
      }
      state.temperature = Math.max(Math.min(ambient, state.temperature), state.temperature + energy / capacity);
      if (state.temperature > (d.maxTemperature || THERMAL.maxTemperature)) state.failed = true;
      incoming += heat * h;
      radiated += loss * h;
    }
    consumed += ablated;
    const reading = { temperature: state.temperature, limit: d.maxTemperature || THERMAL.maxTemperature, flux, shielded, heat: incoming / dt, loss: radiated / dt, ablated, failed: state.failed };
    readings.set(p.id, reading);
    if (!hottest || reading.temperature / reading.limit > hottest.ratio) hottest = { id: p.id, temperature: reading.temperature, ratio: reading.temperature / reading.limit };
  }
  return { parts: readings, hottest, consumed, failed: [...states].filter(([, s]) => s.failed).map(([id]) => id) };
}

// dist/relative-navigation.js
import * as T12 from "./vendor/three/three.module.js";
var TARGET_MODES = ["target", "relativeRetrograde", "dock"];
function centerOfVessel(v) {
  const center2 = new T12.Vector3();
  let mass = 0;
  for (const p of v.parts) {
    const m = partMass(p, v.fuel, v.ballast, v.thermal);
    mass += m;
    center2.addScaledVector(partCenter(p), m);
  }
  return center2.divideScalar(mass || 1).applyQuaternion(v.q).add(v.pos);
}
function relativeState(v, target) {
  if (!target || v === target) return null;
  const offset = centerOfVessel(target).sub(centerOfVessel(v)), velocity = target.vel.clone().sub(v.vel), distance = offset.length(), speed = velocity.length(), direction = distance > 1e-6 ? offset.clone().divideScalar(distance) : null;
  return { distance, speed, closing: direction ? -velocity.dot(direction) : 0, direction, braking: speed > 0.01 ? velocity.clone().divideScalar(speed) : null, offset, velocity };
}
function resolveTargets(root, options = {}) {
  return resolveWorldTargets(fleet(root), options);
}
function resolveWorldTargets(vessels, { strict = false } = {}) {
  const owners = new Map(vessels.flatMap((v) => v.parts.map((p) => [p.id, v])));
  for (const v of vessels) {
    const target = v.targetPartId ? owners.get(v.targetPartId) : null;
    if (v.targetPartId && (!target || target === v)) {
      if (strict) throw Error("\u4FDD\u5B58\u3055\u308C\u305F\u76EE\u6A19\u304C\u5B58\u5728\u3057\u306A\u3044\u304B\u81EA\u6A5F\u3092\u6307\u3057\u3066\u3044\u307E\u3059");
      v.targetPartId = null;
    }
    v.navigationTarget = target && target !== v ? target : null;
    if (!v.navigationTarget && TARGET_MODES.includes(v.sasMode)) {
      if (strict) throw Error("\u76EE\u6A19\u306A\u3057\u306E\u76F8\u5BFESAS\u306F\u5FA9\u5E30\u3067\u304D\u307E\u305B\u3093");
      v.sasMode = "hold";
      v.holdQ = v.q.clone();
    }
    if (v.dockingPorts) {
      const a = v.parts.find((p) => p.id === v.dockingPorts.own), b = v.navigationTarget?.parts.find((p) => p.id === v.dockingPorts.target);
      if (!a || !b || !PARTS[a.type].docking || !PARTS[b.type].docking || a.dockPartner || b.dockPartner) {
        if (strict) throw Error("\u4FDD\u5B58\u3055\u308C\u305F\u30DD\u30FC\u30C8\u9078\u629E\u304C\u4E0D\u6B63\u3067\u3059");
        v.dockingPorts = null;
        v.portTranslationEnabled = false;
      }
    }
    if (!v.dockingPorts && (v.sasMode === "dock" || v.portTranslationEnabled)) {
      if (strict) throw Error("\u30DD\u30FC\u30C8\u306A\u3057\u306E\u8A98\u5C0E\u306F\u5FA9\u5E30\u3067\u304D\u307E\u305B\u3093");
      v.sasMode = "hold";
      v.holdQ = v.q.clone();
      v.portTranslationEnabled = false;
    }
  }
}

// dist/power.js
import * as T13 from "./vendor/three/three.module.js";
var SUN_DIRECTION = new T13.Vector3(12, 24, 12).normalize();
function createCharge(parts) {
  return new Map(parts.filter((p) => PARTS[p.type].battery).map((p) => [p.id, PARTS[p.type].battery]));
}
function powerTotals(parts, charge) {
  return { stored: parts.reduce((s, p) => s + (charge.get(p.id) || 0), 0), capacity: parts.reduce((s, p) => s + (PARTS[p.type].battery || 0), 0) };
}
function inEclipse(pos, time = 0) {
  return [PRIMARY, MOON].some((body) => {
    const r = pos.clone().sub(bodyState(body, time).position), along = r.dot(SUN_DIRECTION);
    return along < 0 && r.lengthSq() - along * along < body.radius ** 2;
  });
}
function solarGeneration(parts, pos, q, time = 0) {
  if (inEclipse(pos, time)) return 0;
  return parts.reduce((sum, p) => {
    const rate = PARTS[p.type].solarPower || 0;
    if (!rate) return sum;
    const normal = new T13.Vector3(0, 0, 1).applyEuler(new T13.Euler(...p.r)).applyQuaternion(q);
    return sum + rate * Math.max(0, normal.dot(SUN_DIRECTION));
  }, 0);
}
function powerStep(parts, charge, pos, q, commands, enabled, dt, time = 0, load = 0) {
  const { stored, capacity } = powerTotals(parts, charge), generation = solarGeneration(parts, pos, q, time), reaction = enabled ? parts.reduce((s, p) => s + (p.reactionEnabled === false ? 0 : PARTS[p.type].reactionTorque || 0), 0) : 0, demand = load + reaction / 1e3 * Math.hypot(commands.pitch, commands.yaw, commands.roll), available = stored + generation * dt, consumed = Math.min(available, demand * dt), ratio = demand > 0 ? Math.min(1, available / (demand * dt)) : 1, next = Math.max(0, Math.min(capacity, available - consumed)), change = next - stored;
  for (const p of parts) {
    const cap = PARTS[p.type].battery || 0;
    if (!cap) continue;
    const current = charge.get(p.id) || 0, share = change >= 0 ? capacity > stored ? (cap - current) / (capacity - stored) : 0 : stored ? current / stored : 0;
    charge.set(p.id, Math.max(0, Math.min(cap, current + change * share)));
  }
  return { stored: next, capacity, generation, demand, consumption: consumed / dt, ratio, eclipse: inEclipse(pos, time), net: change / dt };
}

// dist/rendezvous-burn.js
function validateRendezvousBurn(value) {
  if (!value || ![null, 0.1].includes(value.burnThrottle) || !Number.isFinite(value.duration) || value.duration <= 0 || value.duration > 1200 || typeof value.targetPartId !== "string" || !value.targetPartId.length || value.targetPartId.length > 200) throw Error("\u4F1A\u5408\u5674\u5C04\u8A08\u753B\u306E\u4FDD\u5B58\u5024\u304C\u4E0D\u6B63\u3067\u3059");
  return value;
}

// dist/maneuver-node.js
import * as T14 from "./vendor/three/three.module.js";
function maneuverDirection(node) {
  return node ? new T14.Vector3(...node.complete ? node.impulse : node.remaining).normalize() : null;
}
function advanceManeuver(node, engineDeltaV) {
  if (!node) return;
  const before = new T14.Vector3(...node.remaining), fraction = engineDeltaV.lengthSq() ? Math.max(0, Math.min(1, before.dot(engineDeltaV) / engineDeltaV.lengthSq())) : 0, closest = before.clone().addScaledVector(engineDeltaV, -fraction), remaining = before.sub(engineDeltaV);
  node.remaining = remaining.toArray();
  node.complete = node.complete || closest.length() < (node.tolerance ?? 0.5);
}
function validateManeuverNode(value) {
  if (value == null) return null;
  if (value.rendezvous !== void 0) {
    if (!Number.isFinite(value.universalTime)) throw Error("\u4F1A\u5408\u5674\u5C04\u6642\u523B\u304C\u4E0D\u6B63\u3067\u3059");
    validateRendezvousBurn(value.rendezvous);
    if (value.plannedThrottle !== void 0 || value.capture !== void 0 || value.returnPlan !== void 0 || value.departure !== void 0 || value.tolerance !== 0.05) throw Error("\u4F1A\u5408\u5674\u5C04\u5951\u7D04\u304C\u4E0D\u6B63\u3067\u3059");
  }
  if (value.plannedThrottle !== void 0 && ![0.01, 0.1, 1].includes(value.plannedThrottle)) throw Error("\u8A08\u753B\u63A8\u529B\u306E\u4FDD\u5B58\u5024\u304C\u4E0D\u6B63\u3067\u3059");
  if (value.tolerance !== void 0 && ![0.5, 0.05].includes(value.tolerance)) throw Error("\u5674\u5C04\u7CBE\u5EA6\u306E\u4FDD\u5B58\u5024\u304C\u4E0D\u6B63\u3067\u3059");
  if (value.stopAtTarget !== void 0 && typeof value.stopAtTarget !== "boolean") throw Error("\u5674\u5C04\u505C\u6B62\u652F\u63F4\u306E\u4FDD\u5B58\u5024\u304C\u4E0D\u6B63\u3067\u3059");
  if (value.universalTime !== void 0 && (!Number.isFinite(value.universalTime) || value.universalTime < 0 || value.universalTime > 1e12)) throw Error("\u30DE\u30CB\u30E5\u30FC\u30D0\u6642\u523B\u304C\u4E0D\u6B63\u3067\u3059");
  const validArray = (a, limit) => Array.isArray(a) && a.length === 3 && a.every((v) => Number.isFinite(v) && Math.abs(v) <= limit);
  if (!Number.isFinite(value.time) || value.time < 0 || value.time > 1e12 || typeof value.complete !== "boolean" || !validArray(value.position, 1e10) || !validArray(value.velocity, 1e6) || !validArray(value.impulse, 1e4) || !validArray(value.remaining, 1e6) || (new T14.Vector3(...value.impulse).length() < 0.5 || new T14.Vector3(...value.impulse).length() > 10000.001) || !value.complete && new T14.Vector3(...value.remaining).length() < (value.tolerance ?? 0.5)) throw Error("\u30DE\u30CB\u30E5\u30FC\u30D0\u8A08\u753B\u306E\u4FDD\u5B58\u5024\u304C\u4E0D\u6B63\u3067\u3059");
  if (value.capture !== void 0) {
    const c = value.capture;
    if (!c || !Number.isFinite(value.universalTime) || !["midTime", "duration", "deltaV", "periapsis"].every((k) => Number.isFinite(c[k])) || c.duration <= 0 || c.duration > 1200 || c.deltaV < 0.5 || c.deltaV > 1e4 || c.periapsis < 1e3 || c.periapsis > 25e5 || Math.abs(c.midTime - value.universalTime - c.duration / 2) > 1e-3 || Math.abs(c.deltaV - new T14.Vector3(...value.impulse).length()) > 1e-3) throw Error("\u6708\u5468\u56DE\u8A08\u753B\u306E\u4FDD\u5B58\u5024\u304C\u4E0D\u6B63\u3067\u3059");
  }
  if (value.returnPlan !== void 0) {
    const r = value.returnPlan;
    if (r?.targetPeriapsis !== void 0 && (!Number.isFinite(r.targetPeriapsis) || r.targetPeriapsis < 1e4 || r.targetPeriapsis >= 7e4)) throw Error("\u5E30\u9084\u76EE\u6A19\u8FD1\u70B9\u306E\u4FDD\u5B58\u5024\u304C\u4E0D\u6B63\u3067\u3059");
    if (value.capture !== void 0 || !r || !Number.isFinite(value.universalTime) || !["midTime", "duration", "deltaV", "predictedPeriapsis", "exitTime"].every((k) => Number.isFinite(r[k])) || r.duration <= 0 || r.duration > 1200 || r.deltaV < 0.5 || r.deltaV > 1e4 || r.predictedPeriapsis < 1e4 || r.predictedPeriapsis >= 7e4 || r.exitTime <= r.midTime || r.exitTime - r.midTime > 604800 || Math.abs(r.midTime - value.universalTime - r.duration / 2) > 1e-3 || Math.abs(r.deltaV - new T14.Vector3(...value.impulse).length()) > 1e-3) throw Error("\u6BCD\u661F\u5E30\u9084\u8A08\u753B\u306E\u4FDD\u5B58\u5024\u304C\u4E0D\u6B63\u3067\u3059");
  }
  if (value.departure !== void 0) {
    const d = value.departure;
    if (value.capture !== void 0 || value.returnPlan !== void 0 || !d || !Number.isFinite(value.universalTime) || !["midTime", "duration", "deltaV", "periapsis"].every((k) => Number.isFinite(d[k])) || d.duration <= 0 || d.duration > 1200 || d.deltaV < 0.5 || d.deltaV > 1500 || d.periapsis < 1e4 || d.periapsis > 1e6 || Math.abs(d.midTime - value.universalTime - d.duration / 2) > 1e-3 || Math.abs(d.deltaV - new T14.Vector3(...value.impulse).length()) > 1e-3) throw Error("\u6708\u9077\u79FB\u8A08\u753B\u306E\u4FDD\u5B58\u5024\u304C\u4E0D\u6B63\u3067\u3059");
  }
  return structuredClone(value);
}

// dist/flight-save.js
import * as T29 from "./vendor/three/three.module.js";

// dist/lunar-transfer.js
import * as T15 from "./vendor/three/three.module.js";
function lunarTransferSeed(time, { mass, thrust, isp, radius = 68e4, phaseOffset = 0.26, preparation = 0 } = {}) {
  if (![time, mass, thrust, isp, radius, phaseOffset, preparation].every(Number.isFinite) || time < 0 || preparation < 0 || preparation > 3600 || mass <= 0 || thrust <= 0 || isp <= 0 || radius <= PLANET.radius + PLANET.atmosphereTop || radius >= MOON.orbitRadius) throw Error("\u6708\u9077\u79FB\u306E\u521D\u671F\u6761\u4EF6\u304C\u4E0D\u6B63\u3067\u3059");
  const a = (radius + MOON.orbitRadius) / 2, circularSpeed = Math.sqrt(PLANET.mu / radius), deltaV = Math.sqrt(PLANET.mu * (2 / radius - 1 / a)) - circularSpeed, coastTime = Math.PI * Math.sqrt(a ** 3 / PLANET.mu), exhaustVelocity = isp * 9.81;
  const fuelRequired = mass * (1 - Math.exp(-deltaV / exhaustVelocity)), burnTime = fuelRequired * exhaustVelocity / thrust, orbitalRate = circularSpeed / radius;
  const moon = bodyState(MOON, time + preparation + coastTime + burnTime / 2).position.sub(center), phase = Math.atan2(moon.z, moon.y) - Math.PI - orbitalRate * (preparation + burnTime / 2) + phaseOffset;
  const radial = new T15.Vector3(0, Math.cos(phase), Math.sin(phase)), direction = new T15.Vector3(0, -Math.sin(phase), Math.cos(phase));
  return { position: center.clone().addScaledVector(radial, radius), velocity: direction.clone().multiplyScalar(circularSpeed), direction, deltaV, burnTime, fuelRequired, coastTime, phaseOffset, time, burnStart: time + preparation };
}
function createTransferGuide(seed) {
  return { startTime: seed.burnStart, target: seed.deltaV, burnTime: seed.burnTime, delivered: 0, firstBurnTime: null };
}
function advanceTransferGuide(guide, force, velocity, mass, dt, time) {
  if (!guide || force.lengthSq() === 0) return;
  if (guide.firstBurnTime === null) guide.firstBurnTime = time;
  guide.delivered += force.dot(velocity.clone().normalize()) / mass * dt;
}
function validateTransferGuide(value) {
  if (value == null) return null;
  if (!["startTime", "target", "burnTime", "delivered"].every((k) => Number.isFinite(value[k])) || value.startTime < 0 || value.startTime > 1e12 || value.target <= 0 || value.target > 1e4 || value.burnTime <= 0 || value.burnTime > 1e6 || Math.abs(value.delivered) > 1e8 || value.firstBurnTime !== null && (!Number.isFinite(value.firstBurnTime) || value.firstBurnTime < 0 || value.firstBurnTime > 1e12)) throw Error("\u6708\u9077\u79FB\u30AC\u30A4\u30C9\u306E\u4FDD\u5B58\u5024\u304C\u4E0D\u6B63\u3067\u3059");
  return { startTime: value.startTime, target: value.target, burnTime: value.burnTime, delivered: value.delivered, firstBurnTime: value.firstBurnTime };
}

// dist/cargo-access.js
import * as T16 from "./vendor/three/three.module.js";
function containingCargoBay(parts, p) {
  const seen = /* @__PURE__ */ new Set();
  let current = p;
  while (current?.parent && !seen.has(current.id)) {
    seen.add(current.id);
    current = parts.find((q) => q.id === current.parent);
    if (current && PARTS[current.type].cargoBay) {
      const local = new T16.Vector3(...p.p).sub(new T16.Vector3(...current.p)).applyQuaternion(new T16.Quaternion().setFromEuler(new T16.Euler(...current.r)).invert());
      const d = PARTS[current.type];
      if (local.toArray().every((v, i) => Math.abs(v) < d.size[i] / 2)) return current;
    }
  }
  return null;
}
function cargoReleaseAllowed(parts, p) {
  const bay = containingCargoBay(parts, p);
  return !bay || bay.cargoOpen === true;
}
function cargoReleaseDirection(parts, p) {
  const bay = containingCargoBay(parts, p);
  return bay ? new T16.Vector3(0, 0, 1).applyQuaternion(new T16.Quaternion().setFromEuler(new T16.Euler(...bay.r))) : null;
}

// dist/part-colliders.js
import * as T17 from "./vendor/three/three.module.js";
import RAPIER from "./vendor/rapier/rapier.mjs";
function createPartColliders(world, body, part, mass) {
  const d = PARTS[part.type], rotation = partRotation(part), center2 = partCenter(part);
  const boxes = d.cargoBay ? cargoCollisionBoxes(d, part.cargoOpen) : d.collisionBoxes;
  let pieces;
  if (boxes) {
    if (!Array.isArray(boxes) || !boxes.length) throw Error("Empty compound collider");
    let volume = 0;
    const centroid = new T17.Vector3();
    for (const box of boxes) {
      if (!Array.isArray(box.center) || box.center.length !== 3 || !box.center.every(Number.isFinite) || !Array.isArray(box.size) || box.size.length !== 3 || !box.size.every((n) => Number.isFinite(n) && n > 0)) throw Error("Invalid collision box");
      const v = box.size.reduce((a, b) => a * b, 1);
      volume += v;
      centroid.addScaledVector(new T17.Vector3(...box.center), v);
    }
    if (centroid.divideScalar(volume).length() > 1e-7) throw Error("Compound collider must preserve part mass center");
    pieces = boxes.map((box) => ({ shape: RAPIER.ColliderDesc.cuboid(...box.size.map((n) => n / 2)), offset: new T17.Vector3(...box.center), localRotation: new T17.Quaternion().setFromEuler(new T17.Euler(...box.rotation || [0, 0, 0])), weight: box.size.reduce((a, b) => a * b, 1) / volume }));
  } else pieces = [{ shape: d.wheel ? RAPIER.ColliderDesc.ball(d.size[1] / 2) : RAPIER.ColliderDesc.cuboid(...d.size.map((n) => Math.max(0.02, n / 2))), offset: new T17.Vector3(), weight: 1 }];
  return pieces.map(({ shape, offset, weight, localRotation }) => ({ weight, collider: world.createCollider(shape.setTranslation(...offset.applyQuaternion(rotation).add(center2).toArray()).setRotation(rotation.clone().multiply(localRotation || new T17.Quaternion())).setMass(mass * weight).setFriction(d.wheel ? 0.015 : 0.35).setRestitution(0), body) }));
}

// dist/flight-input.js
function attitudeCommands(input = {}, rocketAxes = false) {
  const scale = input.precision === true ? 0.25 : 1;
  return { pitch: (input.pitch || 0) * scale, yaw: ((rocketAxes ? input.roll : input.yaw) || 0) * scale, roll: ((rocketAxes ? input.yaw : input.roll) || 0) * scale };
}

// dist/sas-trim.js
import * as T18 from "./vendor/three/three.module.js";
var memory = /* @__PURE__ */ new WeakMap();
var pending = /* @__PURE__ */ new WeakMap();
function sasTrim(v, error, base, axes2, dt, enabled) {
  if (!enabled) {
    memory.delete(v);
    pending.delete(v);
    return new T18.Vector3();
  }
  let state = memory.get(v);
  if (!state || state.mode !== v.sasMode) {
    state = { mode: v.sasMode, value: new T18.Vector3() };
    memory.set(v, state);
  }
  const seed = pending.get(v);
  pending.delete(v);
  if (seed?.mode === v.sasMode) for (const axis of ["x", "y", "z"]) state.value[axis] = axes2[axis] ? T18.MathUtils.clamp(seed.value[axis] - base[axis], -0.8, 0.8) : 0;
  for (const axis of ["x", "y", "z"]) {
    if (!axes2[axis]) {
      state.value[axis] = 0;
      continue;
    }
    const output = base[axis] + state.value[axis];
    if (Math.abs(output) < 1 || Math.sign(error[axis]) !== Math.sign(output))
      state.value[axis] = T18.MathUtils.clamp(state.value[axis] + error[axis] * 0.8 * dt, -0.8, 0.8);
  }
  return state.value;
}

// dist/sas-attitude.js
import * as T19 from "./vendor/three/three.module.js";
function followBankHeading(current, target, up2) {
  const forward = new T19.Vector3(0, 0, 1).applyQuaternion(current);
  const wanted = new T19.Vector3(0, 0, 1).applyQuaternion(target);
  forward.addScaledVector(up2, -forward.dot(up2));
  wanted.addScaledVector(up2, -wanted.dot(up2));
  if (forward.lengthSq() < 0.01 || wanted.lengthSq() < 0.01) return target.clone();
  forward.normalize();
  wanted.normalize();
  const angle = Math.atan2(up2.dot(wanted.clone().cross(forward)), wanted.dot(forward));
  return new T19.Quaternion().setFromAxisAngle(up2, angle).multiply(target).normalize();
}
function manualAttitudeTarget(current, target, input) {
  const error = current.clone().invert().multiply(target);
  for (const axis of ["x", "y", "z"]) if (Math.abs(input[axis]) > 0.01) error[axis] = 0;
  return current.clone().multiply(error.normalize()).normalize();
}

// dist/body-drag.js
import * as T20 from "./vendor/three/three.module.js";
var axes = ["x", "y", "z"];
var MIN_BODY_DRAG_FORCE = 1e-4;
function hitBox(point, direction, box) {
  const x = point.x - box.center.x, y = point.y - box.center.y, z = point.z - box.center.z;
  let near = -Infinity, far = Infinity;
  for (let i = 0; i < 3; i++) {
    const axis = box.axes[i], o = x * axis.x + y * axis.y + z * axis.z, d = box.wind[i], h = box.half[axes[i]];
    if (Math.abs(d) < 1e-10) {
      if (Math.abs(o) > h + 1e-8) return null;
    } else {
      const a = (-h - o) / d, b = (h - o) / d;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
    }
  }
  return far >= Math.max(near, 0) ? Math.max(near, 0) : null;
}
function createBodyAerodynamics(parts) {
  const boxes = parts.filter((p) => !PARTS[p.type].wing).flatMap((p) => {
    const d = PARTS[p.type], rotation = partRotation(p), pieces = d.cargoBay ? cargoShellBoxes(d, p.cargoOpen) : [{ center: [0, 0, 0], size: d.size }];
    return pieces.map((piece) => {
      const q = rotation.clone().multiply(new T20.Quaternion().setFromEuler(new T20.Euler(...piece.rotation || [0, 0, 0])));
      return { id: p.id, type: p.type, center: new T20.Vector3(...piece.center).applyQuaternion(rotation).add(new T20.Vector3(...p.p)), half: new T20.Vector3(...piece.size).multiplyScalar(0.5), rotation: q, inverse: q.clone().invert(), axes: [new T20.Vector3(1, 0, 0), new T20.Vector3(0, 1, 0), new T20.Vector3(0, 0, 1)].map((a) => a.applyQuaternion(q)) };
    });
  });
  let lastDirection = null, lastArea = 0;
  const maxCdArea = boxes.reduce((sum, b) => sum + 4 * (b.half.x * b.half.y + b.half.y * b.half.z + b.half.z * b.half.x) * (b.type === "heatShield" ? 1.1 : 0.4), 0);
  return { maxCdArea, dragArea(direction) {
    if (direction.lengthSq() < 1e-12) return 0;
    const wind = direction.clone().normalize();
    if (lastDirection && lastDirection.distanceToSquared(wind) < 1e-6) return lastArea;
    for (const box of boxes) box.wind = box.axes.map((a) => a.dot(wind));
    let cdArea = 0;
    for (const box of boxes) {
      const local = wind.clone().applyQuaternion(box.inverse);
      for (let axis = 0; axis < 3; axis++) {
        const key = axes[axis], cos = Math.abs(local[key]);
        if (cos < 1e-6) continue;
        const u = axes[(axis + 1) % 3], v = axes[(axis + 2) % 3], sign = Math.sign(local[key]);
        let exposed = 0;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          const p = new T20.Vector3();
          p[key] = sign * box.half[key];
          p[u] = box.half[u] * ((i + 0.5) / 2 - 1);
          p[v] = box.half[v] * ((j + 0.5) / 2 - 1);
          p.applyQuaternion(box.rotation).add(box.center);
          const start = p.clone().addScaledVector(wind, 1e-7);
          if (!boxes.some((other) => other !== box && hitBox(start, wind, other) !== null)) exposed++;
        }
        const round = box.type === "heatShield" && axis === 1 ? Math.PI / 4 : 1;
        const cd = box.type === "heatShield" && axis === 1 ? 1.1 : PARTS[box.type].streamlinedNose && axis === 1 && sign > 0 ? 0.15 : 0.4;
        cdArea += 4 * box.half[u] * box.half[v] * cos * exposed / 16 * round * cd;
      }
    }
    lastDirection = wind;
    lastArea = cdArea;
    return cdArea;
  } };
}
function bodyDrag(model, orientation, velocity, density) {
  const speed = velocity.length();
  if (speed < 1e-8 || density <= 0) return { force: new T20.Vector3(), cdArea: 0 };
  if (0.5 * density * speed * speed * model.maxCdArea < MIN_BODY_DRAG_FORCE) return { force: new T20.Vector3(), cdArea: 0 };
  const local = velocity.clone().applyQuaternion(orientation.clone().invert()), cdArea = model.dragArea(local);
  return { force: velocity.clone().multiplyScalar(-0.5 * density * speed * cdArea), cdArea };
}

// dist/buoyancy.js
import * as T21 from "./vendor/three/three.module.js";
function displacedVolume(p) {
  const d = PARTS[p.type];
  return d.volume || d.size[0] * d.size[1] * d.size[2] * 0.18;
}

// dist/engine-medium.js
function engineMedium(f, p, time = f.universalTime) {
  const body = referenceBody(f.pos, time), height = bodyAltitude(f.pos, time, body);
  const point = partCenter(p).applyQuaternion(f.q).add(f.pos);
  return {
    density: body.id === "planet" ? atmosphere(height).density : 0,
    submersion: f.environment === "water" && body.id === "planet" ? Math.max(0, Math.min(1, (0.1 - bodyAltitude(point, time, body)) / 0.25)) : 0
  };
}

// dist/angular-momentum.js
import * as T22 from "./vendor/three/three.module.js";
function principalFrame(body, orientation) {
  const r = body.principalInertiaLocalFrame();
  return orientation.clone().multiply(new T22.Quaternion(r.x, r.y, r.z, r.w)).normalize();
}
function angularMomentum(body, orientation, omega) {
  const frame = principalFrame(body, orientation), i = body.principalInertia();
  return omega.clone().applyQuaternion(frame.clone().invert()).multiply(new T22.Vector3(i.x, i.y, i.z)).applyQuaternion(frame);
}
function angularVelocity(body, orientation, momentum) {
  const frame = principalFrame(body, orientation), i = body.principalInertia(), local = momentum.clone().applyQuaternion(frame.clone().invert());
  return local.set(i.x > 0 ? local.x / i.x : 0, i.y > 0 ? local.y / i.y : 0, i.z > 0 ? local.z / i.z : 0).applyQuaternion(frame);
}

// dist/fuel-transfer.js
var transferCapacity = (p) => PARTS[p.type].fuel || PARTS[p.type].monoprop || 0;
var resourceKind = (p) => PARTS[p.type].fuel ? "fuel" : PARTS[p.type].monoprop ? "monoprop" : null;
function transferTargets(f, id) {
  const p = f?.parts.find((p2) => p2.id === id);
  if (!p || !canControl(f) || !transferCapacity(p) || f.thermal?.get(id)?.failed) return [];
  const group = fuelNetworks(f.parts).network.get(id);
  return group.parts.filter((q) => resourceKind(q) === resourceKind(p) && q.id !== id && !f.thermal?.get(q.id)?.failed);
}
function transferFuel(f, from, to, requested) {
  if (!Number.isFinite(requested) || requested <= 0 || !transferTargets(f, from).some((p) => p.id === to)) return 0;
  const a = f.parts.find((p) => p.id === from), b = f.parts.find((p) => p.id === to), source = f.fuel.get(from), target = f.fuel.get(to), capacity = transferCapacity(b);
  if (!Number.isFinite(source) || !Number.isFinite(target) || source < 0 || source > transferCapacity(a) || target < 0 || target > capacity) return 0;
  const moved = Math.min(requested, source, capacity - target);
  if (moved <= 0) return 0;
  f.fuel.set(from, source - moved);
  f.fuel.set(to, target + moved);
  return moved;
}

// dist/world-physics.js
function advanceWorldPhysics(vessels, universalTime, dt, activeVesselId, input = {}) {
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(universalTime) || universalTime < 0) throw Error("\u7269\u7406\u66F4\u65B0\u306E\u6642\u523B\u304C\u4E0D\u6B63\u3067\u3059");
  const ids = /* @__PURE__ */ new Set();
  for (const v of vessels) {
    if (ids.has(v.vesselId) || v.universalTime !== universalTime) throw Error("\u4E16\u754C\u306E\u6A5F\u4F53ID\u307E\u305F\u306F\u5171\u901A\u6642\u523B\u304C\u4E0D\u4E00\u81F4\u3067\u3059");
    ids.add(v.vesselId);
  }
  if (!ids.has(activeVesselId)) throw Error("\u64CD\u7E26\u5BFE\u8C61\u304C\u4E16\u754C\u306B\u5B58\u5728\u3057\u307E\u305B\u3093");
  const snapshots = new Map(vessels.map((v) => [v, {
    parts: v.parts,
    pos: v.pos.clone(),
    q: v.q.clone(),
    vel: v.vel.clone(),
    omega: v.omega.clone(),
    fuel: new Map(v.fuel),
    ballast: v.ballast,
    thermal: new Map([...v.thermal].map(([id, s]) => [id, { ...s }]))
  }]));
  const endTime = universalTime + dt;
  for (const v of vessels) v.universalTime = endTime;
  for (const v of vessels) v.stepBody(dt, v.vesselId === activeVesselId ? input : {}, snapshots.get(v.navigationTarget) ?? null);
  return endTime;
}

// dist/attachment-nodes.js
import * as T23 from "./vendor/three/three.module.js";
function validateAttachments(parts) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  for (const p of parts) {
    const a = p.attachment;
    if (a === void 0) continue;
    if (!a || !["node", "surface", "free"].includes(a.mode)) throw Error("\u53D6\u4ED8\u65B9\u6CD5\u304C\u4E0D\u6B63\u3067\u3059");
    if (a.mode === "node") {
      const parent = byId.get(p.parent);
      if (!Number.isInteger(a.ownNode) || !nodes(p.type)[a.ownNode] || !Number.isInteger(a.parentNode) || a.parentNode < 0 || parent && !nodes(parent.type)[a.parentNode]) throw Error("\u63A5\u7D9A\u70B9\u306E\u756A\u53F7\u304C\u4E0D\u6B63\u3067\u3059");
    }
  }
}

// dist/port-navigation.js
import * as T24 from "./vendor/three/three.module.js";
function portPose(v, id) {
  const p = v.parts.find((p2) => p2.id === id);
  if (!p || !PARTS[p.type].docking) return null;
  const q = v.q.clone().multiply(partRotation(p)), position = new T24.Vector3(0, PARTS[p.type].dockFace, 0).applyQuaternion(q).add(new T24.Vector3(...p.p).applyQuaternion(v.q)).add(v.pos), normal = new T24.Vector3(0, 1, 0).applyQuaternion(q), velocity = v.vel.clone().add(v.omega.clone().cross(position.clone().sub(centerOfVessel(v))));
  return { part: p, q, position, normal, velocity };
}
function portGuidance(a, aId, b, bId) {
  if (!b || a === b) return null;
  const own = portPose(a, aId), target = portPose(b, bId);
  if (!own || !target || own.part.dockPartner || target.part.dockPartner) return null;
  const right = new T24.Vector3(1, 0, 0).applyQuaternion(target.q), top = new T24.Vector3(0, 0, 1).applyQuaternion(target.q), outward = target.normal, offset = own.position.clone().sub(target.position), velocity = own.velocity.clone().sub(target.velocity), rotatingVelocity = velocity.clone().sub(b.omega.clone().cross(offset));
  return { own, target, right, top, outward, axial: offset.dot(outward), horizontal: offset.dot(right), vertical: offset.dot(top), lateral: Math.hypot(offset.dot(right), offset.dot(top)), closing: -rotatingVelocity.dot(outward), horizontalSpeed: rotatingVelocity.dot(right), verticalSpeed: rotatingVelocity.dot(top), speed: velocity.length(), angle: Math.acos(T24.MathUtils.clamp(-own.normal.dot(outward), -1, 1)), desiredNormal: outward.clone().negate() };
}
function portTranslation(guidance, q, { forward = 0, right = 0, up: up2 = 0 }) {
  if (!guidance) return new T24.Vector3();
  return guidance.outward.clone().multiplyScalar(-forward).addScaledVector(guidance.right, right).addScaledVector(guidance.top, up2).applyQuaternion(q.clone().invert());
}

// dist/rcs.js
import * as T25 from "./vendor/three/three.module.js";
var RCS_NOZZLES = [...Array(3)].flatMap((_, axis) => [-1, 1].map((sign) => {
  const direction = [0, 0, 0];
  direction[axis] = sign;
  return { direction, position: direction.map((v) => -0.24 * v) };
}));
function mixRCS(thrusters, com, rotation, translation) {
  const columns = thrusters.map((t) => {
    const f = t.direction.clone().multiplyScalar(t.thrust), torque = t.position.clone().sub(com).cross(f);
    return [...f.toArray(), ...torque.toArray()];
  });
  const positive = Array(6).fill(0), negative = Array(6).fill(0);
  for (const col of columns) col.forEach((v, i) => {
    positive[i] += Math.max(0, v);
    negative[i] += Math.max(0, -v);
  });
  const command = [...translation.toArray(), ...rotation.toArray()].map((v) => T25.MathUtils.clamp(v, -1, 1));
  const scale = positive.map((v, i) => Math.max(v, negative[i], 1));
  const residual = command.map((v, i) => v * (v >= 0 ? positive[i] : negative[i]) / scale[i]);
  const matrix = columns.map((col) => col.map((v, i) => v / scale[i])), levels = thrusters.map(() => 0);
  for (let iteration = 0; iteration < 120; iteration++) for (let j = 0; j < matrix.length; j++) {
    const col = matrix[j], norm = col.reduce((s, v) => s + v * v, 0);
    if (norm < 1e-12) continue;
    const next = T25.MathUtils.clamp(levels[j] + col.reduce((s, v, i) => s + v * residual[i], 0) / norm, 0, 1), delta = next - levels[j];
    levels[j] = next;
    col.forEach((v, i) => residual[i] -= v * delta);
  }
  for (let i = 0; i < columns.length; i++) for (let j = i + 1; j < columns.length; j++) {
    if (!columns[i].every((v, k) => Math.abs(v + columns[j][k]) < 1e-9)) continue;
    const cancelled = Math.min(levels[i], levels[j]);
    levels[i] -= cancelled;
    levels[j] -= cancelled;
  }
  return levels;
}
function rcsThrusters(parts, definitions) {
  return parts.flatMap((p) => {
    const d = definitions[p.type];
    if (!d.rcsThrust || p.fuelEnabled === false) return [];
    const q = new T25.Quaternion().setFromEuler(new T25.Euler(...p.r));
    return RCS_NOZZLES.map((n, index) => ({ id: p.id, index, position: new T25.Vector3(...n.position).applyQuaternion(q).add(new T25.Vector3(...p.p)), direction: new T25.Vector3(...n.direction).applyQuaternion(q), thrust: d.rcsThrust, isp: d.rcsIsp }));
  });
}
function burnRCS(thrusters, levels, propellant, dt) {
  const needs = /* @__PURE__ */ new Map();
  thrusters.forEach((t, i) => needs.set(t.id, (needs.get(t.id) || 0) + t.thrust * levels[i] * dt / (t.isp * 9.81)));
  const fractions = /* @__PURE__ */ new Map();
  for (const [id, need] of needs) {
    const available = propellant.get(id) || 0;
    fractions.set(id, need > 0 ? Math.min(1, available / need) : 0);
    propellant.set(id, Math.max(0, available - need));
  }
  return thrusters.map((t, i) => ({ ...t, level: levels[i] * fractions.get(t.id), force: t.direction.clone().multiplyScalar(t.thrust * levels[i] * fractions.get(t.id)) }));
}

// dist/symmetry.js
import * as T26 from "./vendor/three/three.module.js";
function validateSymmetry(parts) {
  const types = /* @__PURE__ */ new Map();
  for (const p of parts) {
    const g = p.symmetryGroup;
    if (g === void 0) {
      if (p.symmetryFrame !== void 0) throw Error("\u5BFE\u79F0\u8EF8\u306B\u30B0\u30EB\u30FC\u30D7\u304C\u3042\u308A\u307E\u305B\u3093");
      continue;
    }
    if (typeof g !== "string" || !g.trim() || g.length > 200) throw Error("\u5BFE\u79F0\u30B0\u30EB\u30FC\u30D7\u304C\u4E0D\u6B63\u3067\u3059");
    if (types.has(g) && types.get(g) !== p.type) throw Error("\u5BFE\u79F0\u30B0\u30EB\u30FC\u30D7\u306E\u90E8\u54C1\u7A2E\u985E\u304C\u7570\u306A\u308A\u307E\u3059");
    types.set(g, p.type);
    if (p.symmetryFrame !== void 0) {
      const a = p.symmetryFrame;
      if (!Array.isArray(a) || a.length !== 16 || a.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e7) || [3, 7, 11].some((i) => Math.abs(a[i]) > 1e-8) || Math.abs(a[15] - 1) > 1e-8) throw Error("\u5BFE\u79F0\u8EF8\u304C\u4E0D\u6B63\u3067\u3059");
      const axes2 = [0, 4, 8].map((i) => new T26.Vector3(a[i], a[i + 1], a[i + 2]));
      if (axes2.some((v) => Math.abs(v.lengthSq() - 1) > 1e-7) || Math.abs(axes2[0].dot(axes2[1])) > 1e-7 || Math.abs(axes2[0].dot(axes2[2])) > 1e-7 || Math.abs(axes2[1].dot(axes2[2])) > 1e-7) throw Error("\u5BFE\u79F0\u8EF8\u306E\u500D\u7387\u30FB\u89D2\u5EA6\u304C\u4E0D\u6B63\u3067\u3059");
    }
  }
}

// dist/core.js
import * as T28 from "./vendor/three/three.module.js";
import RAPIER2 from "./vendor/rapier/rapier.mjs";

// dist/recovery.js
import * as T27 from "./vendor/three/three.module.js";
var waitReasons = /* @__PURE__ */ new WeakMap();
function parachuteBlocker({ altitude, speed, vertical, density }) {
  if (!(density > 0.03)) return "\u5927\u6C17\u4E0D\u8DB3";
  if (!(altitude < 5e3)) return "\u9AD8\u5EA65 km\u4EE5\u4E0A";
  if (!(vertical < 0)) return "\u964D\u4E0B\u5F85\u3061";
  if (!(speed < 250)) return "\u901F\u5EA6250 m/s\u4EE5\u4E0A";
  if (!(0.5 * density * speed * speed < 35e3)) return "\u52D5\u5727\u904E\u5927";
  return "";
}
function parachuteStep(state, { altitude, speed, vertical, density, landed }, dt) {
  if (state.status === "cut") {
    state.fraction = 0;
    return;
  }
  if (landed && state.fraction > 0) {
    state.status = "landed";
    state.fraction = 0;
    return;
  }
  const reason = state.status === "armed" ? parachuteBlocker({ altitude, speed, vertical, density }) : "";
  waitReasons.set(state, reason);
  if (state.status === "armed" && !reason) state.status = "reefed";
  if (state.status === "reefed" && altitude < 1500 && speed < 80) state.status = "open";
  const target = state.status === "open" ? 1 : state.status === "reefed" ? 0.08 : 0;
  state.fraction += T27.MathUtils.clamp(target - state.fraction, -dt / 3, dt / 3);
}
function parachuteDrag(velocity, density, area, fraction, mass, dt) {
  const speed = velocity.length();
  if (!speed || !fraction) return new T27.Vector3();
  const force = Math.min(0.5 * density * speed * speed * area * 1.5 * fraction, mass * speed / (Math.max(dt, 1e-6) * 2));
  return velocity.clone().multiplyScalar(-force / speed);
}

// dist/core.js
await RAPIER2.init();
function validateCraft(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.parts) || !value.parts.length || value.parts.length > 400) throw Error("\u6A5F\u4F53\u5F62\u5F0F\u307E\u305F\u306F\u90E8\u54C1\u6570\u304C\u4E0D\u6B63\u3067\u3059\uFF081\u301C400\u90E8\u54C1\uFF09\u3002");
  const ids = /* @__PURE__ */ new Set();
  for (const p of value.parts) {
    if (!PARTS[p.type] || typeof p.id !== "string" || ids.has(p.id) || !["p", "r"].every((k) => Array.isArray(p[k]) && p[k].length === 3 && p[k].every((n) => Number.isFinite(n) && Math.abs(n) < 1e4)) || !Number.isInteger(p.stage) || p.stage < 0 || p.stage > 9) throw Error("\u90E8\u54C1\u30C7\u30FC\u30BF\u304C\u4E0D\u6B63\u3067\u3059\u3002");
    for (const key of ["cargoOpen", "reactionEnabled", "steeringEnabled", "driveEnabled", "controlEnabled", "gimbalEnabled", "controlPitch", "controlYaw", "controlRoll", "fuelCrossfeed", "fuelEnabled"]) if (p[key] !== void 0 && typeof p[key] !== "boolean") throw Error("\u90E8\u54C1\u306E\u64CD\u4F5C\u8A2D\u5B9A\u304C\u4E0D\u6B63\u3067\u3059\u3002");
    if (p.cargoOpen !== void 0 && !PARTS[p.type].cargoBay) throw Error("\u8CA8\u7269\u6249\u306F\u8CA8\u7269\u80F4\u4F53\u306E\u8A2D\u5B9A\u3067\u3059\u3002");
    if (p.fuelEnabled !== void 0 && !PARTS[p.type].fuel && !PARTS[p.type].monoprop) throw Error("\u71C3\u6599\u4F7F\u7528\u306F\u63A8\u9032\u5264\u3092\u6301\u3064\u90E8\u54C1\u306E\u8A2D\u5B9A\u3067\u3059\u3002");
    if (p.fuelCrossfeed !== void 0 && !PARTS[p.type].docking) throw Error("\u71C3\u6599\u901A\u904E\u306F\u30DD\u30FC\u30C8\u306E\u8A2D\u5B9A\u3067\u3059\u3002");
    if (p.fuelLoad !== void 0 && (!(PARTS[p.type].fuel || PARTS[p.type].monoprop) || !Number.isFinite(p.fuelLoad) || p.fuelLoad < 0 || p.fuelLoad > 1)) throw Error("\u71C3\u6599\u642D\u8F09\u91CF\u306F0\u301C100%\u3067\u3059\u3002");
    if (p.thrustLimit !== void 0 && (!PARTS[p.type].thrust || !Number.isFinite(p.thrustLimit) || p.thrustLimit < 0 || p.thrustLimit > 1)) throw Error("\u63A8\u529B\u4E0A\u9650\u306F0\u301C100%\u3067\u3059\u3002");
    if (p.controlLimit !== void 0 && (!PARTS[p.type].controlAxis || !Number.isFinite(p.controlLimit) || p.controlLimit < 0 || p.controlLimit > 1)) throw Error("\u8235\u89D2\u4E0A\u9650\u304C\u4E0D\u6B63\u3067\u3059\u3002");
    if (p.missionOrigin !== void 0) {
      const m = p.missionOrigin;
      if (!m || typeof m.name !== "string" || m.name.length > 80 || !Number.isFinite(m.epoch) || Math.abs(m.epoch) > 1e12) throw Error("\u6A5F\u4F53\u306E\u30DF\u30C3\u30B7\u30E7\u30F3\u60C5\u5831\u304C\u4E0D\u6B63\u3067\u3059\u3002");
    }
    ids.add(p.id);
  }
  for (const p of value.parts) {
    if (p.parent && !ids.has(p.parent)) throw Error("\u63A5\u7D9A\u5148\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002");
    const seen = /* @__PURE__ */ new Set([p.id]);
    let n = p;
    while (n.parent) {
      if (seen.has(n.parent)) throw Error("\u63A5\u7D9A\u306B\u5FAA\u74B0\u304C\u3042\u308A\u307E\u3059\u3002");
      seen.add(n.parent);
      n = value.parts.find((x) => x.id === n.parent);
    }
  }
  for (const p of value.parts) if (p.dockPartner !== void 0) {
    const partner = value.parts.find((x) => x.id === p.dockPartner);
    if (typeof p.dockPartner !== "string" || !PARTS[p.type].docking || !partner || partner === p || !PARTS[partner.type].docking || partner.dockPartner !== p.id || p.parent !== partner.id && partner.parent !== p.id) throw Error("\u30C9\u30C3\u30AD\u30F3\u30B0\u63A5\u7D9A\u304C\u4E0D\u6B63\u3067\u3059\u3002");
  }
  validateSymmetry(value.parts);
  validateAttachments(value.parts);
  return structuredClone(value.parts);
}
function descendants(parts, id) {
  const set = /* @__PURE__ */ new Set([id]);
  let change = true;
  while (change) {
    change = false;
    for (const p of parts) if (set.has(p.parent) && !set.has(p.id)) {
      set.add(p.id);
      change = true;
    }
  }
  return set;
}
function statistics(parts, fuelRatio = 1, ballast = 0, thermal = null) {
  let mass = 0, dry = 0, fuel = 0, thrust = 0, weightedIsp = 0;
  const com = new T28.Vector3();
  for (const p of parts) {
    const d = PARTS[p.type], m = partMass(p, fuelRatio, ballast, thermal);
    mass += m;
    dry += d.mass + (thermal?.get(p.id)?.ablator ?? d.ablator ?? 0) + (d.monoprop ? fuelRatio instanceof Map ? fuelRatio.get(p.id) || 0 : d.monoprop * fuelRatio * (p.fuelLoad ?? 1) : 0);
    fuel += d.fuel || 0;
    thrust += engineMaxThrust(p);
    weightedIsp += engineMaxThrust(p) * (d.isp || 0);
    com.addScaledVector(partCenter(p), m);
  }
  com.divideScalar(mass || 1);
  const isp = weightedIsp / (thrust || 1);
  return { mass, dry, fuel, thrust, com, twr: thrust / (mass * 9.81), dv: fuel ? isp * 9.81 * Math.log(mass / (dry + ballast * parts.reduce((s, p) => s + (PARTS[p.type].ballast || 0), 0))) : 0, aero: aeroAnalysis(parts, com) };
}
var up = new T28.Vector3(0, 1, 0);
function extentY(p, q = new T28.Quaternion()) {
  const d = PARTS[p.type], e = new T28.Matrix4().makeRotationFromQuaternion(q.clone().multiply(partRotation(p))).elements;
  return (Math.abs(e[1]) * d.size[0] + Math.abs(e[5]) * d.size[1] + Math.abs(e[9]) * d.size[2]) / 2;
}
var Flight = class _Flight {
  constructor(parts, environment, universalTime = 0) {
    this.vesselId = crypto.randomUUID();
    this.parts = structuredClone(parts);
    this.vesselName = "";
    this.separationCount = 0;
    this.failureEvents = [];
    this.environment = environment;
    this.physicsOrigin = null;
    this.q = new T28.Quaternion();
    this.pos = new T28.Vector3();
    this.vel = new T28.Vector3();
    this.omega = new T28.Vector3();
    this.fuel = createFuel(this.parts);
    this.charge = createCharge(this.parts);
    this.observations = createObservations(this.parts);
    this.thermal = createThermal(this.parts);
    this.networks = fuelNetworks(this.parts);
    this.engineThrust = /* @__PURE__ */ new Map();
    this.rcsEnabled = false;
    this.rcsJets = [];
    this.ballast = 0;
    this.throttle = 0;
    this.sas = true;
    this.sasMode = "hold";
    this.navigationFrame = "orbit";
    this.navigationAuto = true;
    this.maneuver = null;
    this.transferGuide = null;
    this.targetPartId = null;
    this.dockingPorts = null;
    this.portTranslationEnabled = false;
    this.navigationTarget = null;
    this.brake = true;
    this.time = 0;
    this.universalTime = universalTime;
    this.stage = -1;
    this.crashed = false;
    this.started = false;
    this.maxAltitude = 0;
    this.stats = statistics(parts);
    this.floor = -Math.min(...parts.map((p) => partCenter(p).y - extentY(p)));
    this.pos.y = environment === "water" ? -0.35 : this.floor + 0.1;
    this.active = /* @__PURE__ */ new Set();
    this.lastThrust = 0;
    this.detached = [];
    this.deflections = /* @__PURE__ */ new Map();
    this.wheelMotion = /* @__PURE__ */ new Map();
    this.gimbals = /* @__PURE__ */ new Map();
    this.rocketAxes = parts.some((p) => p.type === "capsule") || parts.some((p) => p.type === "probe") && parts.some((p) => PARTS[p.type].thrust && !PARTS[p.type].air && !PARTS[p.type].water) && !parts.some((p) => PARTS[p.type].aircraftControl);
    this.telemetry = {};
    this.chutes = new Map(this.parts.filter((p) => PARTS[p.type].parachute).map((p) => [p.id, { status: "stowed", fraction: 0 }]));
    this.landed = false;
    this.landedTime = 0;
    this.trim = 0;
    this.reactionEnabled = true;
    this.steeringEnabled = true;
    this.driveEnabled = true;
    this.world = new RAPIER2.World({ x: 0, y: -9.81, z: 0 });
    this.world.numSolverIterations = 8;
    this.world.integrationParameters.lengthUnit = 100;
    this.world.integrationParameters.normalizedAllowedLinearError = 5e-3 / 100;
    this.world.integrationParameters.normalizedPredictionDistance = 0.02 / 100;
    if (environment !== "water") this.ground = this.world.createCollider(RAPIER2.ColliderDesc.cuboid(2e3, 1, 2e3).setTranslation(0, -1, 0).setFriction(0.3));
    this.body = this.world.createRigidBody(RAPIER2.RigidBodyDesc.dynamic().setTranslation(...this.pos.toArray()).setCanSleep(false).setCcdEnabled(true));
    this.colliders = /* @__PURE__ */ new Map();
    this.buildColliders();
    if (environment === "entry") {
      this.vel.set(0, -80, 2200);
      this.q.setFromUnitVectors(up, this.vel.clone().normalize().negate());
      this.pos.set(0, 45e3, 0).sub(this.stats.com.clone().applyQuaternion(this.q));
      this.sasMode = "retrograde";
    }
    if (environment === "drop") {
      this.pos.set(0, 1e3, 0).sub(this.stats.com);
      this.vel.set(0, -50, 0);
    }
    if (environment === "orbit") {
      this.q.setFromAxisAngle(new T28.Vector3(1, 0, 0), Math.PI / 2);
      this.pos.set(0, 8e4, 0).sub(this.stats.com.clone().applyQuaternion(this.q));
      this.vel.set(0, 0, Math.sqrt(PLANET.mu / 68e4));
    }
    if (environment === "transfer") {
      const engines = parts.filter((p) => PARTS[p.type].thrust && !PARTS[p.type].air && !PARTS[p.type].water && p.stage === 0), thrust = engines.reduce((s, p) => s + engineMaxThrust(p), 0), isp = thrust / engines.reduce((s, p) => s + engineMaxThrust(p) / PARTS[p.type].isp, 0);
      const seed = lunarTransferSeed(universalTime, { mass: this.stats.mass, thrust: thrust || 45e3, isp: isp || 300, preparation: 60 });
      this.q.setFromUnitVectors(up, seed.direction);
      this.pos.copy(seed.position).sub(this.stats.com.clone().applyQuaternion(this.q));
      this.vel.copy(seed.velocity);
      this.sasMode = "prograde";
      this.transferGuide = createTransferGuide(seed);
    }
    if (environment === "moon-surface") {
      const moon = bodyState(MOON, universalTime);
      this.pos.copy(moon.position).add(new T28.Vector3(0, MOON.radius + this.floor + 0.1, 0));
      this.vel.copy(moon.velocity);
      this.sasMode = "radial";
    }
    if (environment === "moon-orbit") {
      const trial = lunarTrial(universalTime);
      this.q.setFromAxisAngle(new T28.Vector3(1, 0, 0), Math.PI / 2);
      this.pos.copy(trial.pos).sub(this.stats.com.clone().applyQuaternion(this.q));
      this.vel.copy(trial.vel);
    }
    if (["land", "runway", "water", "drop", "entry"].includes(environment)) {
      const orientation = surfaceOrientation(universalTime).multiply(launchSiteOrientation(environment)), primaryCenter = bodyState({ id: "planet" }, universalTime).position;
      this.pos.sub(primaryCenter).applyQuaternion(orientation).add(primaryCenter);
      this.q.premultiply(orientation);
      this.vel.applyQuaternion(orientation).add(surfaceVelocity(this.pos.clone().add(this.stats.com.clone().applyQuaternion(this.q)), universalTime));
      this.omega.copy(surfaceAngularVelocity());
    }
    updateNavigationFrame(this, { reset: true });
  }
  get fuelRatio() {
    const capacity = this.parts.reduce((s, p) => s + (PARTS[p.type].fuel || 0), 0);
    return capacity ? this.parts.reduce((s, p) => s + (PARTS[p.type].fuel ? this.fuel.get(p.id) || 0 : 0), 0) / capacity : 1;
  }
  set fuelRatio(value) {
    for (const p of this.parts) if (PARTS[p.type].fuel) this.fuel.set(p.id, PARTS[p.type].fuel * Math.max(0, Math.min(1, value)));
  }
  buildColliders() {
    this.bodyAerodynamics = createBodyAerodynamics(this.parts);
    for (const group of this.colliderGroups?.values() || []) for (const { collider } of group) this.world.removeCollider(collider, true);
    this.colliders.clear();
    this.colliderGroups = /* @__PURE__ */ new Map();
    for (const p of this.parts) {
      const group = createPartColliders(this.world, this.body, p, partMass(p, this.fuel, this.ballast, this.thermal));
      this.colliderGroups.set(p.id, group);
      this.colliders.set(p.id, group[0].collider);
    }
    this.body.recomputeMassPropertiesFromColliders();
  }
  updateColliderMasses() {
    for (const p of this.parts) {
      const mass = partMass(p, this.fuel, this.ballast, this.thermal);
      for (const { collider, weight } of this.colliderGroups.get(p.id)) collider.setMass(mass * weight);
    }
    this.body.recomputeMassPropertiesFromColliders();
  }
  transferFuel(from, to, amount) {
    const before = statistics(this.parts, this.fuel, this.ballast, this.thermal);
    this.updateColliderMasses();
    const momentum = angularMomentum(this.body, this.q, this.omega), moved = transferFuel(this, from, to, amount);
    if (!moved) return 0;
    this.stats = statistics(this.parts, this.fuel, this.ballast, this.thermal);
    if (!this.landed) this.pos.add(before.com.clone().sub(this.stats.com).applyQuaternion(this.q));
    this.updateColliderMasses();
    if (!this.landed) this.omega.copy(angularVelocity(this.body, this.q, momentum));
    this.orbit = bodyOrbitState(this.pos.clone().add(this.stats.com.clone().applyQuaternion(this.q)), this.vel, this.universalTime);
    return moved;
  }
  armParachutes() {
    for (const state of this.chutes.values()) if (state.status === "stowed") state.status = "armed";
  }
  dispose() {
    for (const child of this.detached) child.dispose();
    this.world.free();
  }
  stageNext() {
    if (!this.started) this.brake = false;
    this.stage++;
    this.started = true;
    for (const p of this.parts) if (PARTS[p.type].parachute && p.stage === this.stage && this.chutes.get(p.id)?.status === "stowed") this.chutes.get(p.id).status = "armed";
    for (const p of this.parts) if (p.stage === this.stage && PARTS[p.type].thrust) this.active.add(p.id);
    return this.separateRoots(this.parts.filter((p) => p.parent && PARTS[p.type].decoupler && p.stage === this.stage));
  }
  canDecouplePart(id) {
    const p = this.parts.find((p2) => p2.id === id);
    return !!(canControl(this) && p?.parent && PARTS[p.type].decoupler && cargoReleaseAllowed(this.parts, p) && !this.thermal.get(id)?.failed);
  }
  decouplePart(id) {
    return this.canDecouplePart(id) ? this.separateRoots([this.parts.find((p) => p.id === id)]) : /* @__PURE__ */ new Set();
  }
  separateRoots(roots) {
    roots = roots.filter((p) => cargoReleaseAllowed(this.parts, p));
    const releaseDirections = roots.map((p) => cargoReleaseDirection(this.parts, p));
    const remove = /* @__PURE__ */ new Set();
    for (const p of roots) for (const id of descendants(this.parts, p.id)) remove.add(id);
    if (remove.size) {
      this.transferGuide = null;
      const before = statistics(this.parts, this.fuel, this.ballast, this.thermal), originalVelocity = this.vel.clone(), oldCOM = before.com.clone().applyQuaternion(this.q);
      const children = [];
      for (const root of roots) {
        const ids = descendants(this.parts, root.id);
        for (const other of roots) if (other.id !== root.id && ids.has(other.id)) for (const id of descendants(this.parts, other.id)) ids.delete(id);
        const branch = this.parts.filter((p) => ids.has(p.id)).map((p) => ({ ...structuredClone(p), parent: p.id === root.id ? null : p.parent })), child = new _Flight(branch, this.environment);
        child.navigationFrame = this.navigationFrame;
        child.navigationAuto = this.navigationAuto;
        child.transferGuide = null;
        child.fuel = new Map([...this.fuel].filter(([id]) => ids.has(id)));
        child.charge = new Map([...this.charge].filter(([id]) => ids.has(id)));
        child.pos.copy(this.pos);
        child.q.copy(this.q);
        child.omega.copy(this.omega);
        child.time = this.time;
        child.universalTime = this.universalTime;
        child.vesselName = separationName(this.vesselName, ++this.separationCount);
        child.stage = this.stage;
        child.started = this.started;
        child.throttle = this.throttle;
        child.ballast = this.ballast;
        child.trim = this.trim;
        child.brake = this.brake;
        child.sas = branch.some((p) => PARTS[p.type].control) && this.sas;
        child.holdQ = this.q.clone();
        for (const key of ["reactionEnabled", "driveEnabled", "steeringEnabled", "rcsEnabled"]) child[key] = this[key];
        child.active = new Set([...this.active].filter((id) => ids.has(id)));
        for (const key of ["thermal", "chutes", "deflections", "gimbals", "wheelMotion", "observations"]) child[key] = new Map([...this[key]].filter(([id]) => ids.has(id)).map(([id, v]) => [id, v?.isVector3 ? v.clone() : structuredClone(v)]));
        child.stats = statistics(branch, child.fuel, child.ballast, child.thermal);
        child.vel.copy(originalVelocity).add(this.omega.clone().cross(child.stats.com.clone().applyQuaternion(this.q).sub(oldCOM)));
        child.buildColliders();
        children.push(child);
      }
      this.detached.push(...children);
      this.parts = this.parts.filter((p) => !remove.has(p.id));
      for (const p of this.parts) if (remove.has(p.parent)) p.parent = null;
      for (const id of remove) {
        this.active.delete(id);
        this.fuel.delete(id);
        this.charge.delete(id);
        this.observations.delete(id);
        this.thermal.delete(id);
        this.chutes.delete(id);
        this.deflections.delete(id);
        this.gimbals.delete(id);
        this.wheelMotion.delete(id);
      }
      this.networks = fuelNetworks(this.parts);
      this.buildColliders();
      const remaining = statistics(this.parts, this.fuel, this.ballast, this.thermal);
      this.vel.copy(originalVelocity).add(this.omega.clone().cross(remaining.com.clone().applyQuaternion(this.q).sub(oldCOM)));
      for (const child of children) {
        const direction = (releaseDirections[children.indexOf(child)] || child.stats.com.clone().sub(remaining.com)).clone().applyQuaternion(this.q);
        if (direction.lengthSq() < 1e-8) direction.set(0, -1, 0).applyQuaternion(this.q);
        direction.normalize();
        const impulse = direction.multiplyScalar(0.5 / (1 / child.stats.mass + 1 / remaining.mass));
        child.vel.addScaledVector(impulse, 1 / child.stats.mass);
        this.vel.addScaledVector(impulse, -1 / remaining.mass);
        child.orbit = bodyOrbitState(child.pos.clone().add(child.stats.com.clone().applyQuaternion(child.q)), child.vel, child.universalTime);
      }
    }
    this.stats = statistics(this.parts, this.fuel, this.ballast, this.thermal);
    return remove;
  }
  step(dt, input = {}) {
    resolveTargets(this);
    return advanceWorldPhysics(fleet(this), this.universalTime, dt, this.vesselId, input);
  }
  stepBody(dt, input = {}, navigationTarget = this.navigationTarget) {
    if (!this.parts.some((p) => PARTS[p.type].control)) input = {};
    updateNavigationFrame(this, { time: this.universalTime - dt });
    const startTime = this.universalTime - dt, reference = referenceBody(this.pos, startTime), startBody = bodyState(reference, startTime), endBody = bodyState(reference, this.universalTime);
    if (this.crashed) {
      const frozen = frozenSurfaceState(this, startTime, dt);
      this.pos.copy(frozen.pos);
      this.q.copy(frozen.q);
      this.vel.copy(frozen.vel);
      this.omega.copy(frozen.omega);
      if (this.holdQ) this.holdQ.premultiply(frozen.turn).normalize();
      this.orbit = bodyOrbitState(this.pos.clone().add(this.stats.com.clone().applyQuaternion(this.q)), this.vel, this.universalTime);
      return;
    }
    if (!this.parts.length) return;
    this.time += dt;
    const altitude = (p) => bodyAltitude(p, startTime, reference), localUp = (p) => bodyUp(p, startTime, reference), gravity = (p) => bodyGravity(p, startTime, reference), startCOM = this.pos.clone().add(statistics(this.parts, this.fuel, this.ballast, this.thermal).com.applyQuaternion(this.q)), spin = surfaceAngularVelocity(reference), relativeOmega = this.omega.clone().sub(spin), relativeVelocity = surfaceRelativeVelocity(startCOM, this.vel, startTime, reference), water = this.environment === "water" && reference.id === "planet";
    const normal = localUp(this.pos), height = altitude(this.pos), freeFlight = height > this.parts.reduce((m, p) => Math.max(m, new T28.Vector3(...p.p).length() + Math.max(...PARTS[p.type].size)), 0) + 25;
    const solverScale = freeFlight ? 100 : Math.max(1, relativeVelocity.length() / 100);
    this.world.integrationParameters.lengthUnit = solverScale;
    this.world.integrationParameters.normalizedAllowedLinearError = 1e-3 / solverScale;
    this.world.integrationParameters.normalizedPredictionDistance = 5e-3 / solverScale;
    if (freeFlight || reference.id === "moon" || !this.physicsOrigin || this.physicsOrigin.distanceTo(this.pos) > 1e3) this.physicsOrigin = this.pos.clone();
    const origin = this.physicsOrigin;
    this.world.gravity = freeFlight ? { x: 0, y: 0, z: 0 } : gravity(startCOM).add(rotatingFrameCorrection(startCOM, relativeVelocity, startTime, reference));
    if (this.ground) {
      this.ground.setEnabled(!freeFlight);
      this.ground.setTranslation(this.pos.clone().sub(origin).addScaledVector(normal, -height - 1));
      this.ground.setRotation(new T28.Quaternion().setFromUnitVectors(up, normal));
    }
    this.body.setTranslation(this.pos.clone().sub(origin), true);
    this.body.setRotation(this.q, true);
    this.body.setLinvel(freeFlight ? { x: 0, y: 0, z: 0 } : relativeVelocity, true);
    this.body.setAngvel(freeFlight ? this.omega : relativeOmega, true);
    this.updateColliderMasses();
    const st = statistics(this.parts, this.fuel, this.ballast, this.thermal);
    this.stats = st;
    const mass = st.mass, com = st.com.clone().applyQuaternion(this.q).add(this.pos), air = reference.id === "planet" ? atmosphere(height) : { density: 0, pressure: 0, temperature: 3 }, density = air.density;
    this.body.resetForces(true);
    this.body.resetTorques(true);
    const force = new T28.Vector3(), torque = new T28.Vector3(), engineForce = new T28.Vector3();
    const apply = (f, point) => {
      force.add(f);
      torque.add(point.clone().sub(com).cross(f));
      this.body.addForceAtPoint(f, point.clone().sub(origin), true);
    };
    const commands = attitudeCommands(input, this.rocketAxes);
    const steering = new T28.Vector3(commands.pitch, commands.yaw, commands.roll);
    const manual = steering.lengthSq() > 1e-4;
    if (!this.holdQ || !this.sas || manual && (this.rocketAxes || this.sasMode !== "hold")) this.holdQ = this.q.clone();
    else if (manual) this.holdQ = manualAttitudeTarget(this.q, this.holdQ, steering);
    if (manual) this.sasMode = "hold";
    if (this.sas && this.sasMode !== "hold") {
      const guide = this.dockingPorts ? portGuidance(this, this.dockingPorts.own, navigationTarget, this.dockingPorts.target) : null;
      const target = this.sasMode === "dock" ? guide?.desiredNormal : this.sasMode === "target" ? relativeState(this, navigationTarget)?.direction : this.sasMode === "relativeRetrograde" ? relativeState(this, navigationTarget)?.braking : this.sasMode === "maneuver" ? maneuverDirection(this.maneuver) : navDirections(com, this.vel, startTime, this.navigationFrame)[this.sasMode], forward = this.sasMode === "dock" && guide ? new T28.Vector3(0, 1, 0).applyQuaternion(partRotation(guide.own.part)) : new T28.Vector3(0, this.rocketAxes ? 1 : 0, this.rocketAxes ? 0 : 1);
      if (target) this.holdQ = attitudeTarget(this.q, forward, target);
    }
    const banking = this.sas && this.sasMode === "hold" && !this.rocketAxes && st.aero.area > 0 && !this.telemetry.groundContact && density * relativeVelocity.lengthSq() / 2 > 50 && Math.abs(new T28.Vector3(1, 0, 0).applyQuaternion(this.q).dot(normal)) > Math.sin(5 * Math.PI / 180);
    if (banking) this.holdQ = followBankHeading(this.q, this.holdQ, normal);
    if (this.sas) {
      const error = this.holdQ.clone().multiply(this.q.clone().invert());
      if (error.w < 0) {
        error.x *= -1;
        error.y *= -1;
        error.z *= -1;
      }
      const inverse = this.q.clone().invert(), localError = new T28.Vector3(error.x, error.y, error.z).applyQuaternion(inverse), correction = new T28.Vector3(error.x, error.y, error.z).multiplyScalar(4).addScaledVector(freeFlight ? this.omega : relativeOmega, -1.5).applyQuaternion(inverse);
      const axes2 = {};
      for (const [name, axis] of [["pitch", "x"], ["yaw", "y"], ["roll", "z"]]) axes2[axis] = !this.rocketAxes && Math.abs(steering[axis]) < 0.01 && this.parts.some((p) => PARTS[p.type].controlAxis && Math.abs(controlDeflection(p, st.com, { [name]: 1 })) > 1e-6);
      if (banking) axes2.y = false;
      const bias = sasTrim(this, localError, correction.clone().add(new T28.Vector3(this.trim, 0, 0)), axes2, dt, !this.rocketAxes && !this.telemetry.groundContact && density * relativeVelocity.lengthSq() / 2 > 50);
      correction.add(bias);
      for (const [name, axis] of [["pitch", "x"], ["yaw", "y"], ["roll", "z"]]) commands[name] = T28.MathUtils.clamp(commands[name] + correction[axis], -1, 1);
    } else sasTrim(this, null, null, null, dt, false);
    commands.pitch = T28.MathUtils.clamp(commands.pitch + this.trim, -1, 1);
    this.engineThrust = engineBurn(this.networks, this.fuel, this.started ? this.active : /* @__PURE__ */ new Set(), this.throttle, density, dt, air.pressure);
    const wheelContacts = [];
    let stallCount = 0, contacts = 0, wheelImpactSpeed = 0;
    this.lastThrust = 0;
    const wheelCount = this.parts.filter((p) => PARTS[p.type].wheel).length;
    for (const p of this.parts) {
      const d = PARTS[p.type], orientation = this.q.clone().multiply(partRotation(p)), wp = partCenter(p).applyQuaternion(this.q).add(this.pos), r = wp.clone().sub(com), pv = relativeVelocity.clone().add(relativeOmega.clone().cross(r));
      if (d.gimbal) {
        const localIntent = new T28.Vector3(commands.pitch, commands.yaw, commands.roll).applyQuaternion(partRotation(p).invert()), lever = partCenter(p).sub(st.com).dot(up.clone().applyQuaternion(partRotation(p))), max = d.gimbal * Math.PI / 180;
        const target = new T28.Vector3(localIntent.x, 0, localIntent.z).multiplyScalar(Math.sign(lever) * max * (p.gimbalEnabled === false ? 0 : 1));
        if (target.length() > max) target.setLength(max);
        const current = this.gimbals.get(p.id) || new T28.Vector3();
        const delta = target.sub(current);
        if (delta.length() > dt * 1.2) delta.setLength(dt * 1.2);
        current.add(delta);
        this.gimbals.set(p.id, current);
      }
      if (this.started && d.thrust && this.active.has(p.id) && (d.water || this.engineThrust.get(p.id) > 0)) {
        let f = d.water ? engineMaxThrust(p) * this.throttle : this.engineThrust.get(p.id) || 0;
        if (d.water) {
          f *= engineMedium(this, p, startTime).submersion;
          this.engineThrust.set(p.id, f);
        }
        const g = this.gimbals.get(p.id), gq = g ? new T28.Quaternion().setFromEuler(new T28.Euler(g.x, 0, g.z)) : new T28.Quaternion();
        const point = d.gimbal ? new T28.Vector3(...d.gimbalPivot).applyQuaternion(orientation).add(wp) : wp;
        const thrustVector = up.clone().applyQuaternion(gq).applyQuaternion(orientation).multiplyScalar(f);
        engineForce.add(thrustVector);
        apply(thrustVector, point);
        this.lastThrust += f;
      }
      if (d.parachute) {
        const state = this.chutes.get(p.id);
        parachuteStep(state, { altitude: height, speed: relativeVelocity.length(), vertical: relativeVelocity.dot(normal), density, landed: this.landed }, dt);
        apply(parachuteDrag(pv, density, d.parachute, state.fraction, mass, dt), wp);
      }
      if (d.wing) {
        let angle = this.deflections.get(p.id) || 0, target = controlDeflection(p, st.com, commands);
        angle += T28.MathUtils.clamp(target - angle, -dt * 1.6, dt * 1.6);
        this.deflections.set(p.id, angle);
        const point = aeroPoint(p).applyQuaternion(this.q).add(this.pos), velocity = relativeVelocity.clone().add(relativeOmega.clone().cross(point.clone().sub(com))), aero = surfaceForce(p, orientation, velocity, density, angle);
        apply(aero.force, point);
        if (density > 1e-8 && aero.stalled && velocity.length() > 5) stallCount++;
      }
      if (water) {
        const volume = displacedVolume(p);
        for (const u of [-0.32, 0.32]) {
          const point = new T28.Vector3(0, d.size[1] * u, 0).applyQuaternion(orientation).add(wp), velocity = relativeVelocity.clone().add(relativeOmega.clone().cross(point.clone().sub(com))), depth = Math.max(0.12, extentY(p, this.q) * 1.2), sub = T28.MathUtils.clamp((depth / 2 - altitude(point)) / depth, 0, 1);
          apply(localUp(point).multiplyScalar(gravity(point).length() * 1e3 * volume * 0.5 * sub), point);
          apply(velocity.multiplyScalar(-sub * volume * 500), point);
        }
      }
      if (d.wheel && !water) {
        const radius = d.size[1] / 2, steer = d.steer && this.steeringEnabled && p.steeringEnabled !== false ? (input.yaw || 0) * 0.4 / (1 + relativeVelocity.lengthSq() / 9) : 0;
        const rollingDirection = new T28.Vector3(Math.sin(steer), 0, Math.cos(steer)).applyQuaternion(this.q);
        const motion = this.wheelMotion.get(p.id) || { angle: 0, speed: 0, steer: 0 };
        const bottom = altitude(wp) - radius;
        motion.steer = steer;
        motion.speed = bottom < 0.18 ? pv.dot(rollingDirection) / radius : motion.speed * Math.exp(-dt * (this.brake ? 12 : 0.3));
        motion.angle = (motion.angle + motion.speed * dt) % (2 * Math.PI);
        this.wheelMotion.set(p.id, motion);
        if (bottom < 0.18) {
          contacts++;
          wheelImpactSpeed = Math.min(wheelImpactSpeed, pv.dot(normal));
          const share = mass / Math.max(1, wheelCount), spring = Math.max(0, (0.18 - bottom) * share * 150 - pv.dot(normal) * share * 12);
          apply(normal.clone().multiplyScalar(spring), wp);
          const forward = new T28.Vector3(Math.sin(steer), 0, Math.cos(steer)).applyQuaternion(this.q);
          forward.addScaledVector(normal, -forward.dot(normal));
          forward.normalize();
          const side = normal.clone().cross(forward), load = Math.max(spring, share * gravity(wp).length() * 0.25), point = wp.clone().addScaledVector(normal, -radius);
          wheelContacts.push({ id: p.id, point: point.toArray(), halfAxle: new T28.Vector3(d.size[0] / 2, 0, 0).applyQuaternion(orientation).toArray(), time: startTime });
          apply(side.multiplyScalar(T28.MathUtils.clamp(-pv.dot(side) * share * 6, -load * 0.8, load * 0.8)), point);
          apply(forward.clone().multiplyScalar(T28.MathUtils.clamp(-pv.dot(forward) * share * (this.brake ? 8 : 0.012), -load * 0.8, load * 0.8)), point);
          if (p.type === "wheel" && this.driveEnabled && p.driveEnabled !== false && this.started && !this.brake) {
            const drive = T28.MathUtils.clamp(input.drive ?? this.throttle, -1, 1);
            apply(forward.multiplyScalar(drive * share * 3 * Math.max(0, 1 - Math.abs(pv.dot(forward)) / 18)), wp);
          }
        }
      }
    }
    const thrusters = this.rcsEnabled ? rcsThrusters(this.parts, PARTS).filter((t) => (this.fuel.get(t.id) || 0) > 0) : [];
    const rotation = new T28.Vector3(commands.pitch, commands.yaw, commands.roll), translation = new T28.Vector3(input.translateX || 0, input.translateY || 0, input.translateZ || 0);
    if (this.portTranslationEnabled && this.dockingPorts) {
      const guide = portGuidance(this, this.dockingPorts.own, navigationTarget, this.dockingPorts.target);
      translation.copy(portTranslation(guide, this.q, { forward: input.portForward || 0, right: input.portRight || 0, up: input.portUp || 0 }));
    }
    const levels = mixRCS(thrusters, st.com, rotation, translation);
    this.rcsJets = burnRCS(thrusters, levels, this.fuel, dt);
    for (const jet of this.rcsJets) apply(jet.force.clone().applyQuaternion(this.q), jet.position.clone().applyQuaternion(this.q).add(this.pos));
    const bodyAero = bodyDrag(this.bodyAerodynamics, this.q, relativeVelocity, density);
    apply(bodyAero.force, com);
    const reaction = this.parts.reduce((s, p) => s + (p.reactionEnabled === false ? 0 : PARTS[p.type].reactionTorque || 0), 0);
    const power = powerStep(this.parts, this.charge, com, this.q, commands, this.reactionEnabled, dt, startTime, observationDemand(this));
    advanceObservations({ ...this, universalTime: startTime }, this.observations, power, dt);
    if (this.reactionEnabled && reaction) this.body.addTorque(new T28.Vector3(commands.pitch, commands.yaw, commands.roll).multiplyScalar(reaction * power.ratio).applyQuaternion(this.q), true);
    advanceTransferGuide(this.transferGuide, engineForce, this.vel.clone().sub(startBody.velocity), mass, dt, startTime);
    const maneuverWasComplete = this.maneuver?.complete;
    advanceManeuver(this.maneuver, engineForce.clone().multiplyScalar(dt / mass));
    if (!maneuverWasComplete && this.maneuver?.complete && this.maneuver.stopAtTarget === true) this.throttle = 0;
    const thermal = thermalStep(this.parts, this.thermal, this.q, relativeVelocity, air, dt);
    this.telemetry = { thermal, force, torque, engineForce, power, stallCount, contacts, wheelContacts, wheelImpactSpeed, commands, engine: "Rapier 0.21" };
    const impactSpeed = relativeVelocity.dot(normal);
    this.world.timestep = dt;
    this.world.step();
    this.q.copy(this.body.rotation()).normalize();
    this.omega.copy(this.body.angvel());
    if (freeFlight) {
      const next = advanceCelestialOrbit(com, this.vel, force.clone().divideScalar(mass), dt, startTime);
      this.pos.copy(next.pos).sub(st.com.clone().applyQuaternion(this.q));
      this.vel.copy(next.vel);
    } else {
      const turn = surfaceOrientation(dt, reference);
      this.q.premultiply(turn).normalize();
      this.omega.applyQuaternion(turn).add(spin);
      this.pos.copy(origin).add(this.body.translation()).sub(startBody.position).applyQuaternion(turn).add(endBody.position);
      const endCOM = this.pos.clone().add(st.com.clone().applyQuaternion(this.q));
      this.vel.copy(this.body.linvel()).applyQuaternion(turn).add(surfaceVelocity(endCOM, this.universalTime, reference));
      if (this.holdQ) this.holdQ.premultiply(turn).normalize();
    }
    this.orbit = bodyOrbitState(this.pos.clone().add(st.com.clone().applyQuaternion(this.q)), this.vel, this.universalTime);
    const endRelativeVelocity = surfaceRelativeVelocity(this.pos.clone().add(st.com.clone().applyQuaternion(this.q)), this.vel, this.universalTime, reference);
    this.telemetry.atmosphere = air;
    this.telemetry.surfaceSpeed = endRelativeVelocity.length();
    if (!water && !freeFlight && (wheelImpactSpeed < -9 || impactSpeed < -9 && endRelativeVelocity.dot(normal) > impactSpeed * 0.4)) {
      this.crashed = true;
      const candidates = this.parts.map((p) => {
        const point = partCenter(p).applyQuaternion(this.q).add(this.pos), rotation2 = this.q.clone().multiply(partRotation(p)), localNormal = normal.clone().applyQuaternion(rotation2.invert()), size = PARTS[p.type].size;
        const clearance = bodyAltitude(point, this.universalTime, reference) - (Math.abs(localNormal.x) * size[0] + Math.abs(localNormal.y) * size[1] + Math.abs(localNormal.z) * size[2]) / 2;
        let impulse = 0;
        if (this.ground) for (const { collider } of this.colliderGroups.get(p.id)) this.world.contactPair(collider, this.ground, (m) => {
          for (let i = 0; i < m.numContacts(); i++) impulse += m.contactImpulse(i);
        });
        return { p, point, clearance, impulse };
      });
      candidates.sort((a, b) => b.impulse - a.impulse || a.clearance - b.clearance);
      const hit = candidates[0];
      recordFailure(this, hit.p, "impact", { speed: Math.max(-wheelImpactSpeed, -impactSpeed, 0), position: hit.point });
    }
    const touching = !freeFlight && this.parts.some((p) => {
      const point = partCenter(p).applyQuaternion(this.q).add(this.pos), axes2 = new T28.Matrix4().makeRotationFromQuaternion(this.q.clone().multiply(partRotation(p))).elements, d = PARTS[p.type], extent = (Math.abs(normal.x * axes2[0] + normal.y * axes2[1] + normal.z * axes2[2]) * d.size[0] + Math.abs(normal.x * axes2[4] + normal.y * axes2[5] + normal.z * axes2[6]) * d.size[1] + Math.abs(normal.x * axes2[8] + normal.y * axes2[9] + normal.z * axes2[10]) * d.size[2]) / 2;
      return bodyAltitude(point, this.universalTime, reference) - extent < 0.1;
    });
    const supported = !freeFlight && this.ground && [...this.colliderGroups.values()].flat().some(({ collider: c }) => {
      let contact = false;
      this.world.contactPair(c, this.ground, (m) => {
        for (let i = 0; i < m.numContacts(); i++) if (m.contactImpulse(i) > 0) contact = true;
      });
      return contact;
    });
    this.telemetry.groundContact = touching || supported || contacts > 0;
    this.landedTime = (touching || supported || contacts > 0) && endRelativeVelocity.length() < 0.8 && this.lastThrust === 0 ? this.landedTime + dt : 0;
    this.landed = this.landedTime > 0.5;
    if (thermal.failed.length) {
      for (const id of thermal.failed) {
        const p = this.parts.find((p2) => p2.id === id);
        recordFailure(this, p, "thermal", { position: partCenter(p).applyQuaternion(this.q).add(this.pos) });
      }
      this.crashed = true;
      this.throttle = 0;
    }
    this.maxAltitude = Math.max(this.maxAltitude, bodyAltitude(this.pos, this.universalTime) - this.floor);
  }
};

// dist/flight-save.js
var flags = ["started", "crashed", "landed", "sas", "brake", "reactionEnabled", "steeringEnabled", "driveEnabled"];
var numbers = { time: [0, 1e12], stage: [-1, 1e3], throttle: [0, 1], ballast: [0, 1], trim: [-0.6, 0.6], maxAltitude: [0, 1e10], landedTime: [0, 1e12] };
var check = (ok) => {
  if (!ok) throw Error("\u98DB\u884C\u4FDD\u5B58\u30C7\u30FC\u30BF\u306E\u5F62\u5F0F\u307E\u305F\u306F\u5024\u304C\u4E0D\u6B63\u3067\u3059");
};
var vector = (a, n, limit) => {
  check(Array.isArray(a) && a.length === n && a.every((v) => Number.isFinite(v) && Math.abs(v) <= limit));
  return a;
};
var quaternion = (a) => {
  vector(a, 4, 1.01);
  check(Math.abs(a.reduce((s, v) => s + v * v, 0) - 1) < 0.01);
  return a;
};
function entries(values, allowed, read) {
  check(Array.isArray(values) && values.length <= 400);
  const out = /* @__PURE__ */ new Map();
  for (const row of values) {
    check(Array.isArray(row) && row.length === 2 && allowed.has(row[0]) && !out.has(row[0]));
    out.set(row[0], read(row[1], row[0]));
  }
  return out;
}
function loadFlight(value, { debris = false, depth = 0, budget = { count: 0, ids: /* @__PURE__ */ new Set(), vesselIds: /* @__PURE__ */ new Set() } } = {}) {
  check(depth <= 32);
  check(value?.kind === "orbital-foundry-flight" && value.version === 1);
  check(value.physicsModel === void 0 || value.physicsModel === PHYSICS_MODEL);
  if (value.physicsMigration != null) check(["surface", "inertial"].every((k) => Number.isInteger(value.physicsMigration[k]) && value.physicsMigration[k] >= 0 && value.physicsMigration[k] <= 400));
  const parts = validateCraft({ version: 1, parts: value.parts }), byId = new Map(parts.map((p) => [p.id, p]));
  check(parts.filter((p) => !p.parent).length === 1);
  const vesselId = value.vesselId === void 0 ? "legacy:" + parts[0].id : value.vesselId;
  check(typeof vesselId === "string" && vesselId.length > 0 && vesselId.length <= 256 && !budget.vesselIds.has(vesselId));
  budget.vesselIds.add(vesselId);
  budget.count += parts.length;
  check(budget.count <= 400);
  for (const p of parts) {
    check(!budget.ids.has(p.id));
    budget.ids.add(p.id);
  }
  const children = value.detached ?? [];
  check(Array.isArray(children) && children.length <= 400);
  check(["land", "runway", "water", "orbit", "drop", "entry", "moon-orbit", "moon-surface", "transfer"].includes(value.environment));
  vector(value.pos, 3, 1e10);
  vector(value.vel, 3, 1e6);
  vector(value.omega, 3, 1e4);
  quaternion(value.q);
  if (value.holdQ !== null) quaternion(value.holdQ);
  check(Object.hasOwn(SAS_MODES, value.sasMode));
  check(value.navigationAuto === void 0 || typeof value.navigationAuto === "boolean");
  check(value.navigationFrame === void 0 || ["orbit", "surface"].includes(value.navigationFrame));
  check(value.state && typeof value.state === "object");
  for (const k of flags) check(typeof value.state[k] === "boolean");
  for (const [k, [min, max]] of Object.entries(numbers)) check(Number.isFinite(value.state[k]) && value.state[k] >= min && value.state[k] <= max);
  check(Number.isInteger(value.state.stage));
  const ids = new Set(byId.keys()), tankIds = new Set(parts.filter((p) => PARTS[p.type].fuel || PARTS[p.type].monoprop).map((p) => p.id));
  const fuel = entries(value.fuel, tankIds, (v, id) => {
    check(Number.isFinite(v) && v >= 0 && v <= (PARTS[byId.get(id).type].fuel || PARTS[byId.get(id).type].monoprop));
    return v;
  });
  check(fuel.size === tankIds.size);
  check(Array.isArray(value.active) && value.active.length <= 400 && new Set(value.active).size === value.active.length && value.active.every((id) => byId.has(id) && PARTS[byId.get(id).type].thrust));
  const deflections = entries(value.deflections, ids, (v) => {
    check(Number.isFinite(v) && Math.abs(v) <= Math.PI);
    return v;
  }), gimbals = entries(value.gimbals, ids, (v) => new T29.Vector3(...vector(v, 3, Math.PI))), wheelMotion = entries(value.wheelMotion, ids, (v) => {
    check(v && ["angle", "speed", "steer"].every((k) => Number.isFinite(v[k]) && Math.abs(v[k]) < 1e6));
    return { angle: v.angle, speed: v.speed, steer: v.steer };
  }), chuteIds = new Set(parts.filter((p) => PARTS[p.type].parachute).map((p) => p.id)), chutes = entries(value.chutes, chuteIds, (v) => {
    check(v && ["stowed", "armed", "reefed", "open", "landed", "cut"].includes(v.status) && Number.isFinite(v.fraction) && v.fraction >= 0 && v.fraction <= 1);
    return { status: v.status, fraction: v.fraction };
  });
  check(chutes.size === chuteIds.size);
  const observationIds = new Set(parts.filter((p) => p.type === "probe").map((p) => p.id)), observations = value.observations === void 0 ? createObservations(parts) : entries(value.observations, observationIds, (s) => {
    check(s && typeof s.enabled === "boolean" && ["day", "night"].every((k) => Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 1e12));
    if (s.sites !== void 0) {
      check(s.sites && typeof s.sites === "object" && !Array.isArray(s.sites));
      for (const [id, data] of Object.entries(s.sites)) {
        check(id !== DELIVERY_SITE.id && !!deliverySite(id) && data && ["day", "night"].every((k) => Number.isFinite(data[k]) && data[k] >= 0 && data[k] <= 1e12));
        copyObservationQuality(data.quality, data);
      }
    }
    const quality = copyObservationQuality(s.quality, s);
    return { enabled: s.enabled, day: s.day, night: s.night, ...quality ? { quality } : {}, ...s.sites ? { sites: structuredClone(s.sites) } : {} };
  });
  check(observations.size === observationIds.size);
  const batteryIds = new Set(parts.filter((p) => PARTS[p.type].battery).map((p) => p.id)), charge = value.charge === void 0 ? createCharge(parts) : entries(value.charge, batteryIds, (v, id) => {
    check(Number.isFinite(v) && v >= 0 && v <= PARTS[byId.get(id).type].battery);
    return v;
  });
  check(charge.size === batteryIds.size);
  const maneuver = validateManeuverNode(value.maneuver), transferGuide = validateTransferGuide(value.transferGuide);
  check(value.sasMode !== "maneuver" || maneuver !== null);
  check(value.rcsEnabled === void 0 || typeof value.rcsEnabled === "boolean");
  check(value.targetPartId === void 0 || value.targetPartId === null || typeof value.targetPartId === "string" && value.targetPartId.length <= 200);
  check(value.dockingPorts === void 0 || value.dockingPorts === null || typeof value.dockingPorts === "object" && ["own", "target"].every((k) => typeof value.dockingPorts[k] === "string" && value.dockingPorts[k].length <= 200));
  check(value.portTranslationEnabled === void 0 || typeof value.portTranslationEnabled === "boolean");
  const thermal = value.thermal === void 0 ? createThermal(parts) : entries(value.thermal, ids, (v, id) => {
    const d = PARTS[byId.get(id).type];
    check(v && Number.isFinite(v.temperature) && v.temperature >= 0 && v.temperature <= 1e9 && Number.isFinite(v.ablator) && v.ablator >= 0 && v.ablator <= (d.ablator || 0) && typeof v.failed === "boolean");
    return { temperature: v.temperature, ablator: v.ablator, failed: v.failed };
  });
  check(thermal.size === ids.size);
  check(![...thermal.values()].some((s) => s.failed) || value.state.crashed);
  check(value.vesselName === void 0 || typeof value.vesselName === "string" && value.vesselName.length <= 80);
  check(value.separationCount === void 0 || Number.isSafeInteger(value.separationCount) && value.separationCount >= 0 && value.separationCount <= 1e9);
  if (value.universalTime !== void 0) validUniversalTime(value.universalTime);
  const failureEvents = validateFailureEvents(value.failureEvents);
  const ascent = value.orbitalAscentSettings ? orbitalAscentSettings(value.orbitalAscentSettings) : null;
  const arrivalEnd = runwayEnd(value.runwayEnd);
  const cruise = value.cruiseSettings ? cruiseSettings(value.cruiseSettings) : null;
  const f = new Flight(parts, value.environment);
  f.failureEvents = failureEvents;
  f.orbitalAscentSettings = ascent;
  f.cruiseSettings = cruise;
  f.runwayEnd = arrivalEnd;
  f.vesselId = vesselId;
  f.separationCount = value.separationCount ?? 0;
  f.legacyPhysics = value.physicsModel === void 0;
  f.physicsMigration = value.physicsMigration ? { surface: value.physicsMigration.surface, inertial: value.physicsMigration.inertial } : null;
  f.universalTime = value.universalTime ?? value.state.time;
  f.vesselName = value.vesselName ?? (typeof value.meta?.name === "string" ? value.meta.name.slice(0, 80) : "\u6A5F\u4F53");
  f.thermal = thermal;
  f.dockingPorts = value.dockingPorts ? structuredClone(value.dockingPorts) : null;
  f.portTranslationEnabled = value.portTranslationEnabled ?? false;
  f.targetPartId = value.targetPartId ?? null;
  f.rcsEnabled = value.rcsEnabled ?? false;
  f.maneuver = maneuver;
  f.transferGuide = transferGuide;
  for (const k of [...flags, ...Object.keys(numbers)]) f[k] = value.state[k];
  f.pos.fromArray(value.pos);
  f.vel.fromArray(value.vel);
  f.q.fromArray(value.q).normalize();
  f.omega.fromArray(value.omega);
  f.holdQ = value.holdQ ? new T29.Quaternion().fromArray(value.holdQ).normalize() : f.q.clone();
  f.sasMode = value.sasMode;
  f.navigationFrame = value.navigationFrame ?? "orbit";
  f.navigationAuto = value.navigationAuto ?? true;
  f.fuel = fuel;
  f.charge = charge;
  f.observations = observations;
  f.active = new Set(value.active);
  f.deflections = deflections;
  f.gimbals = gimbals;
  f.wheelMotion = wheelMotion;
  f.chutes = chutes;
  f.buildColliders();
  f.stats = statistics(f.parts, f.fuel, f.ballast, f.thermal);
  f.orbit = bodyOrbitState(f.pos.clone().add(f.stats.com.clone().applyQuaternion(f.q)), f.vel, f.universalTime);
  try {
    for (const child of children) f.detached.push(loadFlight(child, { debris: true, depth: depth + 1, budget }));
    if (depth === 0) {
      const all = fleet(f), time = value.universalTime ?? Math.max(...all.map((v) => v.universalTime));
      const checkTimes = (r) => {
        if (r.universalTime !== void 0 && r.universalTime !== time) throw Error("\u6A5F\u4F53\u9593\u306E\u5171\u901A\u6642\u523B\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093");
        for (const child of r.detached ?? []) checkTimes(child);
      };
      if (value.universalTime !== void 0) checkTimes(value);
      setUniversalTime(f, time);
      restoreSeparationCounters(all);
      const migrated = { surface: 0, inertial: 0 };
      for (const v of all) {
        if (v.legacyPhysics) migrated[migrateLegacySurface(v) ? "surface" : "inertial"]++;
        delete v.legacyPhysics;
      }
      if (migrated.surface + migrated.inertial) f.physicsMigration = migrated;
      for (const v of all) v.orbit = bodyOrbitState(v.pos.clone().add(v.stats.com.clone().applyQuaternion(v.q)), v.vel, time);
      for (const v of all) updateNavigationFrame(v);
      resolveTargets(f, { strict: true });
    }
  } catch (error) {
    f.dispose();
    throw error;
  }
  return f;
}

// tools/landing-trim.mjs
import * as T30 from "./vendor/three/three.module.js";
var rad2 = Math.PI / 180;
function planLandingTrim(f, { density = 1.225, gravity = 9.81 } = {}) {
  for (let speed = 40; speed <= 160; speed += 2) {
    if (!landingTrim(f, { speed, density, gravity })) continue;
    const selected2 = landingTrim(f, { speed: speed * 1.05, density, gravity });
    if (selected2) return { ...selected2, minimumSample: speed, density, gravity, mass: f.stats.mass };
  }
  return null;
}
function trimForces(f, { speed, alpha, pitchCommand, density = 1.225, gravity = 9.81, slope = -3 }) {
  const flow = new T30.Vector3(0, -Math.sin(alpha * rad2), Math.cos(alpha * rad2)), velocity = flow.clone().multiplyScalar(speed);
  const pitch = (alpha + slope) * rad2, up2 = new T30.Vector3(0, Math.cos(pitch), Math.sin(pitch));
  const force = bodyDrag(f.bodyAerodynamics, new T30.Quaternion(), velocity, density).force, torque = new T30.Vector3();
  let stalled = false;
  for (const p of f.parts) {
    if (!PARTS[p.type].wing) continue;
    const a = surfaceForce(p, partRotation(p), velocity, density, controlDeflection(p, f.stats.com, { pitch: pitchCommand }));
    force.add(a.force);
    torque.add(aeroPoint(p).sub(f.stats.com).cross(a.force));
    stalled ||= a.stalled;
  }
  const thrust = new T30.Vector3(), thrustTorque = new T30.Vector3();
  for (const group of fuelNetworks(f.parts).groups) {
    if (!group.tanks.some((p) => (f.fuel.get(p.id) || 0) > 0)) continue;
    for (const p of group.engines) {
      if (!PARTS[p.type].air || !f.active.has(p.id)) continue;
      const engine = new T30.Vector3(0, 1, 0).applyQuaternion(partRotation(p)).multiplyScalar(engineMaxThrust(p) * density / 1.225);
      thrust.add(engine);
      thrustTorque.add(partCenter(p).sub(f.stats.com).cross(engine));
    }
  }
  const available = thrust.dot(flow), throttle = available > 0 ? (f.stats.mass * gravity * Math.sin(slope * rad2) - force.dot(flow)) / available : Infinity;
  force.addScaledVector(thrust, throttle);
  torque.addScaledVector(thrustTorque, throttle);
  return { speed, alpha, pitchCommand, throttle, stalled, liftError: force.dot(up2) - f.stats.mass * gravity, pitchTorque: torque.x };
}
function pitchTrim(f, options) {
  let lo = -0.8, hi = 0.8, left = trimForces(f, { ...options, pitchCommand: lo }), right = trimForces(f, { ...options, pitchCommand: hi });
  if (!Number.isFinite(left.pitchTorque) || left.pitchTorque * right.pitchTorque > 0) return null;
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2, value = trimForces(f, { ...options, pitchCommand: mid });
    if (value.pitchTorque * left.pitchTorque > 0) {
      lo = mid;
      left = value;
    } else hi = mid;
  }
  return trimForces(f, { ...options, pitchCommand: (lo + hi) / 2 });
}
function landingTrim(f, { speed, density = 1.225, gravity = 9.81, slope = -3 } = {}) {
  let previous = null;
  for (let alpha = 0; alpha <= 12; alpha += 0.5) {
    const value = pitchTrim(f, { speed, alpha, density, gravity, slope });
    if (value && previous && value.liftError * previous.liftError <= 0) {
      let lo = previous.alpha, hi = alpha, result = value;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        result = pitchTrim(f, { speed, alpha: mid, density, gravity, slope });
        if (!result) return null;
        if (result.liftError * previous.liftError > 0) lo = mid;
        else hi = mid;
      }
      return !result.stalled && result.throttle >= 0 && result.throttle <= 1 ? result : null;
    }
    previous = value;
  }
  return null;
}

// tools/landing-plan-worker.mjs
function handleLandingPlan({ id, vesselId, epoch, flight }) {
  let clone;
  try {
    if (!Number.isInteger(id) || id < 1 || vesselId !== flight?.vesselId || epoch !== flight?.universalTime) throw Error("Mismatched landing snapshot");
    clone = loadFlight(flight);
    const center2 = clone.pos.clone().add(clone.stats.com.clone().applyQuaternion(clone.q));
    const plan = planLandingTrim(clone, { density: atmosphere(bodyAltitude(center2, clone.universalTime)).density, gravity: bodyGravity(center2, clone.universalTime).length() });
    return { id, vesselId, epoch, result: plan ? { status: "ready", plan } : { status: "unavailable" } };
  } catch (error) {
    return { id, vesselId, epoch, error: error.message };
  } finally {
    clone?.dispose();
  }
}
globalThis.onmessage = ({ data }) => globalThis.postMessage(handleLandingPlan(data));
if (typeof globalThis.postMessage === "function") globalThis.postMessage({ type: "ready" });
export {
  handleLandingPlan
};
