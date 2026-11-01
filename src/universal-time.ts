export interface UniversalTimeRoot{universalTime:number;detached:Iterable<UniversalTimeRoot>}
export function validUniversalTime(value:number):number{
 if(!Number.isFinite(value)||value<0||value>1e12)throw Error('共通時刻が不正です');
 return value;
}
export function setUniversalTime(root:UniversalTimeRoot,time:number):number{
 validUniversalTime(time);root.universalTime=time;
 for(const child of root.detached)setUniversalTime(child,time);
 return time;
}
export function formatUniversalTime(time:number):string{
 validUniversalTime(time);return 'UT '+time.toFixed(1)+' s';
}
