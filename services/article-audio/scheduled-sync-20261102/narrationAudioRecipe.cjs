"use strict";

// Dependency-free adapter for the existing production narration worker.
const path = require("node:path");
const fs = require("node:fs");
const {createHash} = require("node:crypto");

const RECIPE_VERSION = "ellen-continuous-v2-2026-10-31";
const MODEL_ID = "eleven_v4";
const OUTRO = "Tak fordi du lyttede med på Apropos Magazine. Lyt til alle vores artikler gratis, uden reklamer og forstyrrelser.";
const SAMPLE_RATE = 44100;
const FIRST_SECONDS = 41.55555555555556;
const SETTINGS_COLLECTION = "podcastFeedOperations";
const SETTINGS_DOCUMENT = "narration-jingle";

function selectJingle(value = "v2") {
  const version = String(value).toLowerCase();
  if (version !== "v1" && version !== "v2") throw new Error("narration_jingle_version_invalid");
  return version;
}

async function readJingleSelection(db, fallback) {
  const document = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOCUMENT).get();
  if (!document.exists) return {version: selectJingle(fallback), revision: 0};
  const data = document.data();
  if (data.schemaVersion !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 1 || typeof data.jingleVersion !== "string") throw new Error("narration_jingle_setting_invalid");
  return {version: selectJingle(data.jingleVersion), revision: data.revision};
}

// Admin SDK-only. The operator authenticates the actual owner before calling;
// no public/client endpoint or Firestore permission is added by this adapter.
async function setJingleSelection(db, version, expectedRevision, actor) {
  if (typeof version !== "string") throw new Error("narration_jingle_change_invalid");
  version = selectJingle(version);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !actor || typeof actor.uid !== "string" || !actor.uid || actor.ownerVerified !== true) throw new Error("narration_jingle_change_invalid");
  const ref = db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOCUMENT);
  return db.runTransaction(async transaction => {
    const old = await transaction.get(ref), data = old.exists ? old.data() : null;
    if (data && (data.schemaVersion !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 1 || typeof data.jingleVersion !== "string")) throw new Error("narration_jingle_setting_invalid");
    if (data) selectJingle(data.jingleVersion);
    const revision = data?.revision || 0;
    if (revision !== expectedRevision) throw new Error("narration_jingle_revision_changed");
    if (data?.jingleVersion === version) return {version, revision, changed: false};
    const next = {schemaVersion: 1, jingleVersion: version, revision: revision + 1, updatedAt: new Date().toISOString(), updatedBy: actor.uid};
    transaction.set(ref, next);
    transaction.set(db.collection("podcastNarrationSettingsAudit").doc(`jingle-${next.revision}`), {...next, previousVersion: data?.jingleVersion || null, recipeVersion: RECIPE_VERSION});
    return {version, revision: next.revision, changed: true};
  });
}

function splitBounded(input, max) {
  let remaining = String(input).trim();
  const parts = [];
  while (remaining.length > max) {
    const candidate = remaining.slice(0, max + 1);
    let cut = candidate.lastIndexOf("\n\n", max);
    if (cut < max / 2) {
      const boundaries = [...candidate.matchAll(/[.!?][\"”')]*\s+/g)];
      cut = boundaries.length ? boundaries[boundaries.length - 1].index + boundaries[boundaries.length - 1][0].length : -1;
    }
    if (cut < max / 2 || cut > max) cut = candidate.lastIndexOf(" ", max);
    if (cut < 1) cut = max;
    // Never cut a UTF-16 surrogate pair.
    if (/^[\uDC00-\uDFFF]$/.test(remaining[cut] || "")) cut--;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

function narrationChunks(script, max = 2800) {
  if (!Number.isSafeInteger(max) || max < 500) throw new Error("narration_chunk_limit_invalid");
  const closing = [script.ratingLine, script.outroLine].filter(Boolean).join("\n\n");
  const body = String(script.bodyText).trim();
  if (closing.length + 100 >= max) throw new Error("narration_closing_too_long");
  const budget = max - closing.length - 2;
  let cut = Math.max(0, body.length - budget);
  // Keep the closing in the same request as substantial preceding article text.
  if (cut > 0) {
    const tail = body.slice(cut);
    const boundary = tail.match(/[.!?][\"”')]*\s+|\n\n/);
    const candidate = boundary ? cut + boundary.index + boundary[0].length : -1;
    if (candidate >= 0 && body.length - candidate >= Math.min(400, budget / 2)) cut = candidate;
    else {
      const space = body.indexOf(" ", cut);
      if (space >= 0 && body.length - space >= 100) cut = space + 1;
    }
    if (/^[\uDC00-\uDFFF]$/.test(body[cut] || "")) cut++;
  }
  const head = splitBounded(body.slice(0, cut), max);
  const last = [body.slice(cut).trim(), closing].filter(Boolean).join("\n\n");
  const chunks = [...head, last].filter(Boolean);
  if (chunks.some(text => text.length > max)) throw new Error("narration_chunk_too_long");
  return chunks;
}

function speechRequest(text, fullText) {
  return {
    text,
    model_id: MODEL_ID,
    language_code: "da",
    voice_settings: {stability: 1},
    seed: createHash("sha256").update(String(fullText)).digest().readUInt32BE(0),
  };
}

function verifyAssets(root, version) {
  selectJingle(version);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "assets", "narration-v2-assets.json"), "utf8"));
  const assets = version === "v1" ? manifest.v1 : manifest.v2;
  if (!Array.isArray(assets) || !assets.length) throw new Error("narration_assets_missing");
  const expected = version === "v1" ? ["narration-jingle.wav"] : ["narration-v2-first.wav", "narration-v2-loop.wav", "narration-v2-outro.wav"];
  if (manifest.version !== RECIPE_VERSION || assets.length !== expected.length || expected.some(name => !assets.some(asset => asset.name === name))) throw new Error("narration_asset_manifest_invalid");
  for (const asset of assets) {
    if (!/^[a-z0-9.-]+\.wav$/.test(asset.name) || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error("narration_asset_manifest_invalid");
    const bytes = fs.readFileSync(path.join(root, "assets", asset.name));
    if (bytes.length !== asset.bytes || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error("narration_asset_changed");
  }
  return manifest;
}

function mixArgs(root, version, voicePath, outPath, duration) {
  selectJingle(version);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) throw new Error("narration_duration_invalid");
  const voiceEnd = 6 + duration, total = voiceEnd + 6.5;
  const bed = 10 ** (-18 / 20), intro = 10 ** (-5 / 20);
  const gain = `if(lt(t,6),${intro},if(lt(t,7.5),${intro}+(${bed - intro})*(t-6)/1.5,if(lt(t,${voiceEnd}),${bed},${bed}+(${intro - bed})*clip((t-${voiceEnd})/1.2,0,1))))`;
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", voicePath];
  const filters = [];
  const asset = name => path.join(root, "assets", name);
  if (version === "v1") {
    args.push("-stream_loop", "-1", "-i", asset("narration-jingle.wav"));
    filters.push(`[1:a]aresample=${SAMPLE_RATE},aformat=channel_layouts=stereo,atrim=duration=${total},asetpts=PTS-STARTPTS[music]`);
  } else {
    args.push("-i", asset("narration-v2-first.wav"), "-stream_loop", "-1", "-i", asset("narration-v2-loop.wav"), "-i", asset("narration-v2-outro.wav"));
    if (voiceEnd <= FIRST_SECONDS) {
      filters.push(`[1:a]atrim=duration=${voiceEnd},asetpts=PTS-STARTPTS[body]`);
    } else {
      filters.push(`[2:a]atrim=duration=${voiceEnd - FIRST_SECONDS},asetpts=PTS-STARTPTS[loop]`);
      filters.push("[1:a][loop]concat=n=2:v=0:a=1[body]");
    }
    const taper = `1-0.5*clip((t-(${voiceEnd}-.02))/.02,0,1)`;
    filters.push(`[body]aeval=exprs='val(0)*(${taper})|val(1)*(${taper})':c=stereo[bodyfade]`);
    filters.push("[3:a]aeval=exprs='val(0)*(.5+.5*clip(t/.02,0,1))|val(1)*(.5+.5*clip(t/.02,0,1))':c=stereo[outro]");
    filters.push("[bodyfade][outro]concat=n=2:v=0:a=1[music]");
  }
  filters.push(`[music]afade=t=in:st=0:d=1,volume=eval=frame:volume='${gain}',afade=t=out:st=${total - 3}:d=3[bed]`);
  filters.push(`[0:a]adelay=6000:all=1,apad=whole_dur=${total}[voice]`);
  // No inserted silence and no tempo change. Limiter is unity below its ceiling.
  filters.push("[voice][bed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.84:level=false:latency=true[out]");
  args.push("-filter_complex", filters.join(";"), "-map", "[out]", "-t", String(total), "-ar", String(SAMPLE_RATE), "-ac", "2", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outPath);
  return args;
}

module.exports = {RECIPE_VERSION, MODEL_ID, OUTRO, SAMPLE_RATE, FIRST_SECONDS, selectJingle, readJingleSelection, setJingleSelection, narrationChunks, speechRequest, verifyAssets, mixArgs};
