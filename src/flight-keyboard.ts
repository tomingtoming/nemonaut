const flightKeys=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyI','KeyK','KeyJ','KeyL','KeyU','KeyO','KeyZ','KeyX','KeyP','KeyM','KeyR','KeyH','KeyB','KeyT','KeyF','CapsLock','ShiftLeft','ShiftRight','ControlLeft','ControlRight']);

export function acceptsFlightKey(target,code){
 if(target.isContentEditable)return false;
 if(target.tagName==='INPUT')return target.type==='range'&&flightKeys.has(code);
 return !['SELECT','TEXTAREA'].includes(target.tagName);
}
