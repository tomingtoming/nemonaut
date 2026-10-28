export function orbitalAscentSettings(value={}){
 const altitude=value.altitude??120000,inclination=value.inclination??0;
 if(!Number.isFinite(altitude)||altitude<80000||altitude>500000||!Number.isFinite(inclination)||inclination<0||inclination>180)throw Error('高度80〜500 km・傾斜角0〜180°で指定してください');
 return {altitude,inclination};
}
