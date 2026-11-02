// Flight input shared across the modules split out of app.ts (BACKLOG 7c, moved from app.ts unchanged): the
// held flight keys, the physics clock of the frame loop and the game audio (mounted by app.ts). Plain values;
// no import-time side effects on the DOM, storage or the scene.
import {PhysicsClock} from './physics-clock.js';
import {mountGameAudio,type GameAudio} from './game-audio.js';
export const physicsClock=new PhysicsClock();
export const keys=new Set<string>();
let audio:GameAudio|null=null;
/** Mounts the game audio; app.ts calls it at the original place. */
export function mountFlightAudio():GameAudio{audio=mountGameAudio();return audio;}
export function gameAudio():GameAudio{if(!audio)throw Error('サウンドがまだ準備されていません');return audio;}
