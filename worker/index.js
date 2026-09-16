import { onRequestGet as gameGet, onRequestPost as gamePost } from "../functions/api/game.js";
import { onRequestPost as generatePost } from "../functions/api/generate.js";
import { onRequestPost as reshufflePost } from "../functions/api/reshuffle.js";
import { onRequestPost as adminFullMappingPost } from "../functions/api/admin-full-mapping.js";
import { onRequestGet as targetGet } from "../functions/api/target.js";
import { onRequestPost as resetPost } from "../functions/api/reset.js";
import { onRequestPost as adminCheckPost } from "../functions/api/admin-check.js";
import { onRequestPost as eliminatePost } from "../functions/api/eliminate.js";
import { onRequestPost as recruitPost } from "../functions/api/recruit.js";
import { onRequestPost as claimPost } from "../functions/api/claim.js";
import { onRequestPost as undoEliminatePost } from "../functions/api/undo-eliminate.js";
import { onRequestGet as statusGet } from "../functions/api/status.js";
import { onRequestPost as adminPhotosPost } from "../functions/api/admin-photos.js";
import { onRequestPost as setImmunityPost } from "../functions/api/set-immunity.js";
import { onRequestPost as adminProofsPost } from "../functions/api/admin-proofs.js";
import { onRequestPost as setBirthdaysPost } from "../functions/api/set-birthdays.js";
import { onRequestPost as updatePhotoPost } from "../functions/api/update-photo.js";
import { onRequestPost as removePlayerPost } from "../functions/api/remove-player.js";
import { onRequestPost as undoRemovePlayerPost } from "../functions/api/undo-remove-player.js";
import { onRequestPost as adminKillCodesPost } from "../functions/api/admin-kill-codes.js";
import { onRequestPost as adminBackfillKillCodesPost } from "../functions/api/admin-backfill-kill-codes.js";
import { onRequestGet as menuGet } from "../functions/api/menu.js";
import { onRequestPost as submitMenuPost } from "../functions/api/submit-menu.js";
import { onRequestPost as adminMenuPost } from "../functions/api/admin-menu.js";
import { onRequestPost as plannerSyncPost, onRequestOptions as plannerSyncOptions } from "../functions/api/planner-sync.js";
import {
  onRequestPost as pushNotifyPost,
  onRequestOptions as pushNotifyOptions,
  onRequestPostRun as pushRunPost,
  onRequestGetHealth as pushHealthGet,
} from "../functions/api/push-notify.js";
import { runReminders } from "../functions/reminders.js";

const routes = {
  "GET /api/game": gameGet,
  "POST /api/game": gamePost,
  "POST /api/generate": generatePost,
  "POST /api/reshuffle": reshufflePost,
  "POST /api/admin-full-mapping": adminFullMappingPost,
  "GET /api/target": targetGet,
  "POST /api/reset": resetPost,
  "POST /api/admin-check": adminCheckPost,
  "POST /api/eliminate": eliminatePost,
  "POST /api/recruit": recruitPost,
  "POST /api/claim": claimPost,
  "POST /api/undo-eliminate": undoEliminatePost,
  "GET /api/status": statusGet,
  "POST /api/admin-photos": adminPhotosPost,
  "POST /api/set-immunity": setImmunityPost,
  "POST /api/admin-proofs": adminProofsPost,
  "POST /api/set-birthdays": setBirthdaysPost,
  "POST /api/update-photo": updatePhotoPost,
  "POST /api/remove-player": removePlayerPost,
  "POST /api/undo-remove-player": undoRemovePlayerPost,
  "POST /api/admin-kill-codes": adminKillCodesPost,
  "POST /api/admin-backfill-kill-codes": adminBackfillKillCodesPost,
  "GET /api/menu": menuGet,
  "POST /api/submit-menu": submitMenuPost,
  "POST /api/admin-menu": adminMenuPost,
  // Exam planner (root index.html), not the assassin game.
  "POST /api/planner-sync": plannerSyncPost,
  "OPTIONS /api/planner-sync": plannerSyncOptions,
  "POST /api/push-subscribe": pushNotifyPost,
  "OPTIONS /api/push-subscribe": pushNotifyOptions,
  "POST /api/pending-notification": pushNotifyPost,
  "OPTIONS /api/pending-notification": pushNotifyOptions,
  "POST /api/push-test": pushNotifyPost,
  "OPTIONS /api/push-test": pushNotifyOptions,
  "POST /api/push-run": pushRunPost,
  "GET /api/push-health": pushHealthGet,
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

  // Cron trigger (see [triggers] in wrangler.toml) — checks whether any planner
  // reminders are due and pushes them.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env, Date.now()));
  },
};
