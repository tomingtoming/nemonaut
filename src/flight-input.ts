import {Vector3, type Quaternion} from 'three';
// Scale manual attitude commands only; wheel steering/drive and translation
// consume the original input, and SAS retains its full actuator authority.
export function attitudeCommands(
  input: {precision?: boolean; pitch?: number; yaw?: number; roll?: number} = {},
  rocketAxes = false
) {
  const scale = input.precision === true ? 0.25 : 1;
  return {
    pitch: (input.pitch || 0) * scale,
    yaw: ((rocketAxes ? input.roll : input.yaw) || 0) * scale,
    roll: ((rocketAxes ? input.yaw : input.roll) || 0) * scale
  };
}

/** I/K moves forward, L/J right, U/O up. A docking port resolves its own local axes in physics. */
export function manualTranslation(
  keys: ReadonlySet<string>,
  axial: boolean,
  portPower: number,
  rotation?: Quaternion
) {
  const forward = Number(keys.has('KeyI')) - Number(keys.has('KeyK'));
  const right = Number(keys.has('KeyL')) - Number(keys.has('KeyJ'));
  const up = Number(keys.has('KeyU')) - Number(keys.has('KeyO'));
  const body = new Vector3(right, axial ? forward : up, axial ? -up : forward);
  if (rotation) body.applyQuaternion(rotation);
  return {
    portForward: forward * portPower,
    portRight: right * portPower,
    portUp: up * portPower,
    translateX: body.x,
    translateY: body.y,
    translateZ: body.z
  };
}
