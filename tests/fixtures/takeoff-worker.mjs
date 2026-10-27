import {parentPort} from 'node:worker_threads';
import {handleTakeoffRequest} from '../../dist/takeoff-forecast-worker.js';
parentPort.on('message',data=>parentPort.postMessage(handleTakeoffRequest(data)));
