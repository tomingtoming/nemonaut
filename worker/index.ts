// The Worker in front of the static site (dist/). Assets are matched first, so only a path with no
// asset gets here. One route of its own: POST /metric (metric.ts). Everything else goes back to the
// assets binding, so a missing page is still answered by the assets layer.
// Only the default export may live in this module: the runtime rejects other exports on the entry.
import {metric, type Env} from './metric.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === '/metric') return metric(request, env);
    return env.ASSETS.fetch(request);
  }
};
