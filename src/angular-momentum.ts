import * as T from 'three';
type InertiaBody=Pick<import('./physics.js').RigidBody,'principalInertia'|'principalInertiaLocalFrame'>;
// Rapier reports principal moments in its local principal-axis frame.
// Flight.q is authoritative even before the next solver synchronization.
function principalFrame(body:InertiaBody,orientation:T.Quaternion):T.Quaternion{const r=body.principalInertiaLocalFrame();return orientation.clone().multiply(new T.Quaternion(r.x,r.y,r.z,r.w)).normalize();}
export function angularMomentum(body:InertiaBody,orientation:T.Quaternion,omega:T.Vector3):T.Vector3{const frame=principalFrame(body,orientation),i=body.principalInertia();return omega.clone().applyQuaternion(frame.clone().invert()).multiply(new T.Vector3(i.x,i.y,i.z)).applyQuaternion(frame);}
export function angularVelocity(body:InertiaBody,orientation:T.Quaternion,momentum:T.Vector3):T.Vector3{const frame=principalFrame(body,orientation),i=body.principalInertia(),local=momentum.clone().applyQuaternion(frame.clone().invert());return local.set(i.x>0?local.x/i.x:0,i.y>0?local.y/i.y:0,i.z>0?local.z/i.z:0).applyQuaternion(frame);}
