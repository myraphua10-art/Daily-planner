import { onRequestGet as gameGet, onRequestPost as gamePost } from "../functions/api/game.js";
import { onRequestPost as generatePost } from "../functions/api/generate.js";
import { onRequestGet as targetGet } from "../functions/api/target.js";
import { onRequestPost as resetPost } from "../functions/api/reset.js";
import { onRequestPost as adminCheckPost } from "../functions/api/admin-check.js";
import { onRequestPost as eliminatePost } from "../functions/api/eliminate.js";
import { onRequestPost as claimPost } from "../functions/api/claim.js";
import { onRequestPost as undoEliminatePost } from "../functions/api/undo-eliminate.js";
import { onRequestGet as statusGet } from "../functions/api/status.js";
import { onRequestPost as adminPhotosPost } from "../functions/api/admin-photos.js";
import { onRequestPost as setBountyPost } from "../functions/api/set-bounty.js";
import { onRequestPost as setImmunityPost } from "../functions/api/set-immunity.js";
import { onRequestPost as adminProofsPost } from "../functions/api/admin-proofs.js";
import { onRequestPost as toggleBreakPost } from "../functions/api/toggle-break.js";

const routes = {
  "GET /api/game": gameGet,
  "POST /api/game": gamePost,
  "POST /api/generate": generatePost,
  "GET /api/target": targetGet,
  "POST /api/reset": resetPost,
  "POST /api/admin-check": adminCheckPost,
  "POST /api/eliminate": eliminatePost,
  "POST /api/claim": claimPost,
  "POST /api/undo-eliminate": undoEliminatePost,
  "GET /api/status": statusGet,
  "POST /api/admin-photos": adminPhotosPost,
  "POST /api/set-bounty": setBountyPost,
  "POST /api/set-immunity": setImmunityPost,
  "POST /api/admin-proofs": adminProofsPost,
  "POST /api/toggle-break": toggleBreakPost,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const handler = routes[`${request.method} ${url.pathname}`];

    if (handler) {
      return handler({ request, env, ctx });
    }

    return env.ASSETS.fetch(request);
  },
};
