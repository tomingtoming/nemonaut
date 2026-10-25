import {validateGame} from './game-save.js';
import {worldFromFlight} from './world-save.js';
import {launchWorld} from './world-operations.js';
import {writeStoredGame} from './game-storage.js';
import {departureMode} from './departure-mode.js';

// Home is never handed to the simulation. Practice quicksaves are session-only,
// so neither autosave nor F5 can replace the normal world's persisted state.
export class PracticeSession{
 #home;#quick=null;#initial;
 constructor(game,design){
  if(departureMode(design.environment).mode!=='practice')throw Error('練習用の開始地点を選んでください');
  this.#home=validateGame(game);
  this.#initial=launchWorld(worldFromFlight(null,{universalTime:this.#home.world.universalTime}),design);
 }
 get initialWorld(){return structuredClone(this.#initial);}
 get home(){return structuredClone(this.#home);}
 saveHome(storage){writeStoredGame(storage,this.#home);}
 saveFlight(record){
  const world=worldFromFlight(record),homeIds=new Set(this.#home.world.vessels.map(v=>v.vesselId));
  if(!world.vessels.length||world.vessels.some(v=>homeIds.has(v.vesselId)))throw Error('通常世界の機体を練習保存には含められません');
  this.#quick=structuredClone(record);
 }
 loadFlight(){
  if(!this.#quick)throw Error('この練習中の保存はまだありません');
  return structuredClone(this.#quick);
 }
}
