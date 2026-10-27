import {parentPort} from 'node:worker_threads';
import {handleLandingPlan} from '../../dist/landing-plan-worker.js';
parentPort.on('message',data=>parentPort.postMessage(handleLandingPlan(data)));
parentPort.postMessage({type:'ready'});
