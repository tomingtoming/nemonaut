// Scale manual attitude commands only; wheel steering/drive and translation
// consume the original input, and SAS retains its full actuator authority.
export function attitudeCommands(input={},rocketAxes=false){
 const scale=input.precision===true?.25:1;
 return {pitch:(input.pitch||0)*scale,yaw:((rocketAxes?input.roll:input.yaw)||0)*scale,roll:((rocketAxes?input.yaw:input.roll)||0)*scale};
}
