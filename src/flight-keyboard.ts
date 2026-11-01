const flightKeys=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyI','KeyK','KeyJ','KeyL','KeyU','KeyO','KeyZ','KeyX','KeyP','KeyM','KeyR','KeyH','KeyB','KeyT','KeyF','CapsLock','ShiftLeft','ShiftRight','ControlLeft','ControlRight']);

export function acceptsFlightKey(target:EventTarget|null,code:string):boolean{
 if((target as HTMLElement).isContentEditable)return false;
 if((target as HTMLElement).tagName==='INPUT')return (target as HTMLInputElement).type==='range'&&flightKeys.has(code);
 return !['SELECT','TEXTAREA'].includes((target as HTMLElement).tagName);
}
