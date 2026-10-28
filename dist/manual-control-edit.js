// A capture listener may release a pilot and synchronize controls before the
// target handler consumes the user's edit. Keep that pending edit intact.
export function preserveManualControlEdit(control,release){
 const value=control.value,checked=control.checked;
 release();
 if(value!==undefined)control.value=value;
 if(checked!==undefined)control.checked=checked;
}
