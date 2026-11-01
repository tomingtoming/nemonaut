export interface SeparationVessel{vesselName?:string;separationCount:number}
export function separationName(name:string|null|undefined,number:number):string{
 if(!name)return '';
 const suffix=' / 分離 '+number;
 return name.slice(0,80-suffix.length)+suffix;
}
// Older saves have no counter; derive a floor from names without renaming vessels.
export function restoreSeparationCounters(vessels:readonly SeparationVessel[]):void{
 for(const parent of vessels)for(const child of vessels){
  if(parent===child)continue;
  const number=Number(child.vesselName?.match(/ \/ 分離 (\d+)$/)?.[1]);
  if(Number.isSafeInteger(number)&&number>0&&number<=1e9&&child.vesselName===separationName(parent.vesselName,number))parent.separationCount=Math.max(parent.separationCount,number);
 }
}
