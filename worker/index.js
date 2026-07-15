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
import { onRequestPost as setBirthdaysPost } from "../functions/api/set-birthdays.js";
import { onRequestPost as updatePhotoPost } from "../functions/api/update-photo.js";
import { onRequestPost as uploadPaparazziPost } from "../functions/api/upload-paparazzi.js";
import { onRequestPost as adminPaparazziPost } from "../functions/api/admin-paparazzi.js";
import { onRequestGet as adminPaparazziFileGet } from "../functions/api/admin-paparazzi-file.js";
import { onRequestPost as removePlayerPost } from "../functions/api/remove-player.js";
import { onRequestPost as undoRemovePlayerPost } from "../functions/api/undo-remove-player.js";
import { onRequestPost as adminKillCodesPost } from "../functions/api/admin-kill-codes.js";
import { onRequestPost as adminBackfillKillCodesPost } from "../functions/api/admin-backfill-kill-codes.js";
import { onRequestPost as snatchBountyPost } from "../functions/api/snatch-bounty.js";
import { onRequestGet as menuGet } from "../functions/api/menu.js";
import { onRequestPost as submitMenuPost } from "../functions/api/submit-menu.js";
import { onRequestPost as adminMenuPost } from "../functions/api/admin-menu.js";
import { onRequestPost as setFilmOverridesPost } from "../functions/api/set-film-overrides.js";

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
  "POST /api/set-birthdays": setBirthdaysPost,
  "POST /api/update-photo": updatePhotoPost,
  "POST /api/upload-paparazzi": uploadPaparazziPost,
  "POST /api/admin-paparazzi": adminPaparazziPost,
  "GET /api/admin-paparazzi-file": adminPaparazziFileGet,
  "POST /api/remove-player": removePlayerPost,
  "POST /api/undo-remove-player": undoRemovePlayerPost,
  "POST /api/admin-kill-codes": adminKillCodesPost,
  "POST /api/admin-backfill-kill-codes": adminBackfillKillCodesPost,
  "POST /api/snatch-bounty": snatchBountyPost,
  "GET /api/menu": menuGet,
  "POST /api/submit-menu": submitMenuPost,
  "POST /api/admin-menu": adminMenuPost,
  "POST /api/set-film-overrides": setFilmOverridesPost,
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
