// Catalog authoring contracts, checked before a malformed capability reaches flight.
// These checks deliberately do not prescribe material density or scaling laws.
export function catalogContractErrors(parts) {
  const errors = [];
  const codes = new Map();
  const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  for (const [id, part] of Object.entries(parts)) {
    const fail = field => errors.push(`${id}: ${field}`);
    for (const field of ['name', 'code', 'cat', 'desc']) {
      if (typeof part[field] !== 'string' || !part[field].trim()) fail(field);
    }
    if (codes.has(part.code)) fail(`duplicate code ${part.code} (${codes.get(part.code)})`);
    codes.set(part.code, id);
    if (!Number.isFinite(part.mass) || part.mass <= 0) fail('mass');
    if (part.planingArea !== undefined && !(Number.isFinite(part.planingArea) && part.planingArea > 0))
      fail('planingArea');
    if (!vector(part.size) || part.size.some(n => n <= 0)) fail('size');
    else {
      // An envelope measure, NOT material density (wings, tanks and bays are hollow).
      const envelopeVolume = part.size.reduce((a, b) => a * b, 1);
      const envelopeDensity = part.mass / envelopeVolume;
      if (!(envelopeVolume > 0) || !Number.isFinite(envelopeVolume)) fail('envelope volume');
      if (!(envelopeDensity > 0) || !Number.isFinite(envelopeDensity)) fail('envelope density');
    }
    for (const [field, value] of Object.entries(part)) {
      if (typeof value === 'number' && !Number.isFinite(value)) fail(`${field} finite`);
    }
    for (const field of ['gimbalPivot', 'ac', 'massCenter', 'shieldNormal']) {
      if (part[field] !== undefined && !vector(part[field])) fail(field);
    }
    if (
      part.waterResistance !== undefined &&
      (!vector(part.waterResistance) || part.waterResistance.some(n => n < 0))
    )
      fail('waterResistance');
    if (part.gimbal !== undefined && part.gimbal > 0) {
      if (!vector(part.gimbalPivot)) fail('gimbal requires gimbalPivot');
      if (!(part.thrust > 0)) fail('gimbal requires thrust');
    }
    if ('air' in part || 'water' in part) fail('thrustMedium replaces legacy flags');
    if (part.thrust > 0) {
      if (!['independent', 'air', 'water'].includes(part.thrustMedium)) fail('thrustMedium');
    } else if (part.thrustMedium !== undefined) fail('thrustMedium requires thrust');
    // Supported engine models. Additional combinations need a force and consumption model first.
    if (part.thrust > 0) {
      const source = {independent: 'onboard', air: 'atmosphere', water: 'none'}[part.thrustMedium];
      if (!source || source !== part.oxidizerSource) fail('oxidizerSource');
    } else if (part.oxidizerSource !== undefined) fail('oxidizerSource requires thrust');
    if (part.bodyDragShape !== undefined && part.bodyDragShape !== 'disc-y') fail('bodyDragShape');
    if (part.commandFrame !== undefined) {
      if (!['axial', 'forward', 'legacy-auto'].includes(part.commandFrame)) fail('commandFrame');
      if (!part.control) fail('commandFrame requires control');
    }
    if (part.controlAxis !== undefined) {
      if (!['auto', 'pitch', 'roll', 'yaw'].includes(part.controlAxis)) fail('controlAxis');
      for (const field of ['wing', 'chord', 'maxDeflection']) {
        if (!(part[field] > 0)) fail(`controlAxis requires ${field}`);
      }
      if (!vector(part.ac)) fail('controlAxis requires ac');
      // part-visuals.ts intentionally defaults hingeY to size[1] / 2.
    }
    if (part.poweredWheel && !part.wheel) fail('poweredWheel requires wheel');
    if (part.retractable && !part.wheel) fail('retractable requires wheel');
    if (part.steer && !part.wheel) fail('steer requires wheel');
    if (part.rcsThrust > 0 && !(part.rcsIsp > 0)) fail('rcsThrust requires rcsIsp');
    if (part.attachmentNodes !== undefined) {
      for (const node of part.attachmentNodes) {
        if (!Array.isArray(node) || node.length !== 6 || !node.every(Number.isFinite)) {
          fail('attachmentNodes');
        } else if (Math.hypot(...node.slice(3)) === 0) fail('attachmentNodes normal');
      }
    }
    if (part.stackDiameters !== undefined) {
      if (
        !Array.isArray(part.stackDiameters) ||
        part.stackDiameters.length !== 2 ||
        part.stackDiameters.some(d => !Number.isFinite(d) || d <= 0)
      )
        fail('stackDiameters');
      // This initial contract describes the two standard axial nodes only.
      if (part.rootWing || part.attachmentNodes) fail('stackDiameters requires standard axial nodes');
    }
  }
  return errors;
}
