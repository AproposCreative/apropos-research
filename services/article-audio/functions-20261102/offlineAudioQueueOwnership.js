// One existing canonical slug document fences normal and maintenance producers.
// No delete/recreate, processing takeover or retry of unknown paid outcomes.
const {randomUUID} = require("node:crypto");
const {narrationAddress} = require("./articleLocale");
const {recoveryRequest, matchesFailedJob} = require('./normalAudioAdmission.cjs');
const noEffect = job => ["no_article", "empty", "deferred_quota"].includes(job?.status) && job.result === job.status;
const normalIdentity = job => JSON.stringify([job?.slug, job?.articleId, job?.name || "", job?.createdAt || null]);
function createNarrationOwnership({db, token = randomUUID}) {
  const ref = (slug, english = false) => {
    if (typeof slug !== "string" || !(english && /^en_[a-f\d]{24}$/.test(slug)) && !/^[a-z0-9]+(?:-+[a-z0-9]+)*$/.test(slug)) throw new Error("Canonical slug required");
    return db.collection("narration_queue").doc(slug);
  };
  return {
    async enqueue(payload) {
      return db.runTransaction(async tx => {
        const r = ref(payload.slug), current = await tx.get(r);
        if (current.exists) return {queued: false, reason: current.data()?.offlineMaintenanceReservation ? "maintenance_owned" : "existing_job_requires_readback"};
        tx.create(r, payload);return {queued: true, reason: "pending"};
      });
    },
    async claimNormal(slug, original, recovery = null) {
      const r = ref(slug), claim = token();
      const owns = job => job?.status === "processing" && job.narrationClaim === claim &&
        !job.offlineMaintenanceReservation && normalIdentity(job) === normalIdentity(original);
      const accepted = await db.runTransaction(async tx => {
        const current = await tx.get(r), job = current.data();
        let request, requestData;
        if (recovery) {
          request = await tx.get(recovery.ref);requestData = request.data();
          recoveryRequest(requestData, recovery.id);
          const article = await tx.get(db.collection('articles').doc(original.articleId));
          if(requestData.normalAudioRecovery.mode!=='resume'||!matchesFailedJob(current,requestData)||
             !article.exists||article.data().contentRevision!==requestData.normalAudioRecovery.expectedSourceRevision) return false;
        }
        if (!current.exists || (!recovery && job?.status !== "pending") || job.offlineMaintenance || job.offlineMaintenanceReservation ||
            normalIdentity(job) !== normalIdentity(original)) return false;
        if (recovery && (!Array.isArray(job.normalRecoveryHistory || []) || (job.normalRecoveryHistory || []).length >= 20)) throw Error('Recovery history bound');
        tx.set(r, {status: "processing", narrationClaim: claim, ...(recovery ? {
          error:null,normalRecoveryRequestId:recovery.id,
          normalRecoveryHistory:[...(job.normalRecoveryHistory || []),{status:job.status,error:job.error,processedAt:job.processedAt,
            narrationClaim:job.narrationClaim,originalUpdateTime:current.updateTime,evidenceSHA256:requestData.normalAudioRecovery.noEffectEvidenceSHA256}]
        } : {})}, {merge: true});
        if(recovery)tx.set(recovery.ref,{status:'processing',canonicalJob:slug},{merge:true});return true;
      });
      if (!accepted) return null;
      return {
        async assertCurrent() {const current = await r.get();if (!current.exists || !owns(current.data())) throw new Error("Original narration claim changed");},
        async assertFinished() {
          const current = await r.get(), job = current.data();
          if (!current.exists || !job || ["pending", "processing"].includes(job.status) || job.narrationClaim !== claim ||
              job.offlineMaintenanceReservation || normalIdentity(job) !== normalIdentity(original)) throw new Error("Finished narration ownership changed");
        },
        async finish(fields) {return db.runTransaction(async tx => {
          const current = await tx.get(r);if (!current.exists || !owns(current.data())) return false;
          tx.set(r, fields, {merge: true});return true;
        });},
      };
    },
    async reserveCreate(work) {
      return db.runTransaction(async tx => {
        const r = ref(narrationAddress(work.source.articleId, work.source.articleSlug).queueID, true), current = await tx.get(r), job = current.data();
        if (current.exists && job.offlineMaintenanceReservation === work.key && job.status === "offline_reserved" &&
            job.slug === work.source.articleSlug && job.articleId === work.source.articleId) return;
        if (current.exists && narrationAddress(work.source.articleId, work.source.articleSlug).english &&
            (job.slug !== work.source.articleSlug || job.articleId !== work.source.articleId)) throw new Error("Foreign English canonical ownership requires readback");
        if (current.exists && !noEffect(job)) throw new Error("Existing canonical narration claim prevents maintenance");
        const marker = {slug: work.source.articleSlug, articleId: work.source.articleId,
          status: "offline_reserved", offlineMaintenanceReservation: work.key};
        if (current.exists) tx.set(r, marker, {merge: true});else tx.create(r, marker);
      });
    },
    async assertCreate(work) {
      const current = await ref(narrationAddress(work.source.articleId, work.source.articleSlug).queueID, true).get(), job = current.data();
      if (!current.exists || job.status !== "offline_reserved" || job.offlineMaintenanceReservation !== work.key ||
          job.slug !== work.source.articleSlug || job.articleId !== work.source.articleId) throw new Error("Original canonical maintenance reservation changed");
    },
  };
}
module.exports = {createNarrationOwnership};
