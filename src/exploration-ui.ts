// Exploration records of the flight in progress (BACKLOG 7c, moved from app.ts unchanged): landing
// challenges and orbit, lunar, delivery and survey achievements written into the parked world's history,
// with a notice per new record. No import-time side effects.
import {recordFlightChallenges} from './precision-landing.js';
import {recordOrbitAchievements} from './exploration-history.js';
import {recordLunarAchievements} from './lunar-achievements.js';
import {recordDeliveryAchievements} from './surface-delivery.js';
import {recordSurveyAchievement} from './surface-survey.js';
import {historyActionLabel} from './departure-mode.js';
import {state} from './app-state.js';
import {errorMessage,notify} from './ui-common.js';
export function updateFlightChallenges(){
 if(!state.flight||!state.parkedWorld||state.practiceSession)return;
 try{const before=state.parkedWorld.history,recorded=recordFlightChallenges(before,state.flight);if(recorded!==before)state.parkedWorld.history=[...recorded];
 for(const e of state.parkedWorld.history.slice(before.length))if(e.type==='precision-landing')notify(e.name+' · '+historyActionLabel(e));
 }catch(e){if(state.explorationError!==errorMessage(e)){state.explorationError=errorMessage(e);notify('着陸課題を記録できません：'+errorMessage(e));}}
}
export function updateExploration(){
 if(!state.flight||!state.parkedWorld||state.practiceSession)return;
 try{
  const before=state.parkedWorld.history,next=recordSurveyAchievement(recordDeliveryAchievements(recordLunarAchievements(recordOrbitAchievements(before,state.flight),state.flight),state.flight),state.flight);
  if(next!==before)state.parkedWorld.history=[...next];state.explorationError='';
  for(const event of next.slice(before.length))notify(event.name+' · '+historyActionLabel(event));
 }catch(e){if(state.explorationError!==errorMessage(e)){state.explorationError=errorMessage(e);notify('探査記録を保存できません：'+errorMessage(e));}}
}
