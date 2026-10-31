"""Patch only narration in an independently downloaded active source directory.

No deploy, credentials, dependency execution, queue or provider calls. Refuses an
unrecognized generator. Copies current production files, never the dirty iOS tree.
"""
import argparse, hashlib, json, shutil
from pathlib import Path

BASE_NARRATION = '3e1334999e0f536f15829ac8957388bdd6ca20bed86d7529a16c92f4a97337cf'
ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--assets', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--historical-fixture', action='store_true', help='Test-only: permit the known pre-classifier-fix source; never deploy this output')
args = parser.parse_args()
source, output = args.source.resolve(), args.output.resolve()
if output.exists() or source == output or source in output.parents: raise ValueError('Use a new separate output directory')
before = {}
for p in source.rglob('*'):
    if p.is_symlink(): raise ValueError('Source symlink rejected')
    if p.is_file(): before[str(p.relative_to(source))] = hashlib.sha256(p.read_bytes()).hexdigest()
if before.get('narration.js') != BASE_NARRATION: raise ValueError('Active generator differs; inspect before patching')
if not args.historical_fixture and before.get('notificationPolicy.js') != 'd9cd8368fe30253371ccec32f84e7731403f996637b342141be498e07af5f01b': raise ValueError('Expected current classifier fix missing; do not restore historical source')
asset_manifest = json.loads((args.assets/'narration-v2-assets.json').read_text())
if asset_manifest.get('version') != 'ellen-continuous-v2-2026-10-31': raise ValueError('Unexpected asset version')
expected_assets = {'narration-v2-first.wav', 'narration-v2-loop.wav', 'narration-v2-outro.wav'}
if len(asset_manifest['v1']) != 1 or asset_manifest['v1'][0]['name'] != 'narration-jingle.wav' or asset_manifest['v1'][0]['sha256'] != 'ba2545a42cca7a90822340c2908c5a1d8681800211eaad9b402ee16c7f67f82d': raise ValueError('Unexpected V1 identity')
if {a['name'] for a in asset_manifest['v2']} != expected_assets: raise ValueError('Unexpected asset names')
if {p.name for p in args.assets.iterdir()} != expected_assets | {'narration-v2-assets.json'}: raise ValueError('Unexpected asset directory content')
for asset in asset_manifest['v2'] + asset_manifest['v1']:
    p = args.assets/asset['name'] if asset['name'] in expected_assets else source/'assets'/asset['name']
    if p.is_symlink() or not p.is_file() or p.stat().st_size != asset['bytes'] or hashlib.sha256(p.read_bytes()).hexdigest() != asset['sha256']: raise ValueError('Asset verification failed')
shutil.copytree(source, output)
s = (output/'narration.js').read_text()
def replace(old, new):
    global s
    if s.count(old) != 1: raise ValueError('Source anchor mismatch: '+old[:70])
    s = s.replace(old, new, 1)
replace('const {randomUUID} = require("node:crypto");', 'const {randomUUID} = require("node:crypto");\nconst audioRecipe = require("./narrationAudioRecipe.cjs");')
replace('const MODEL_ID = "eleven_v3";', 'const MODEL_ID = audioRecipe.MODEL_ID;')
replace('  const outroLine = "Tak fordi du lyttede med på Apropos Magazine.";', '  const outroLine = audioRecipe.OUTRO;')
replace('async function synthesizeChunk(apiKey, voiceId, text, outPath) {\n  const body = {text, model_id: MODEL_ID};', 'async function synthesizeChunk(apiKey, voiceId, text, outPath, fullText) {\n  const body = audioRecipe.speechRequest(text, fullText);')
replace('async function produceFinal(listPath, outPath, workDir, breakerWindows = []) {', 'async function produceFinal(listPath, outPath, workDir, jingleVersion) {')
a = s.index('  logger.info(\n      `narration mix: intro', s.index('async function produceFinal'))
b = s.index('\n  try {', a)
s = s[:a] + '''  logger.info(`narration mix: ${audioRecipe.RECIPE_VERSION}/${jingleVersion}, no inserted pauses, tale ${duration.toFixed(0)}s`);
  await runFfmpeg(audioRecipe.mixArgs(__dirname, jingleVersion, voiceWav, outPath, duration));''' + s[b:]
replace('  // Kredit-cap: stop før ElevenLabs-kvoten brændes.', '''  // Resolve once per episode, validate retained assets before any paid synthesis.
  const jingleSelection = await audioRecipe.readJingleSelection(db, process.env.NARRATION_JINGLE_VERSION);
  const jingleVersion = jingleSelection.version;
  audioRecipe.verifyAssets(__dirname, jingleVersion);

  // Kredit-cap: stop før ElevenLabs-kvoten brændes.''')
a = s.index('    const bodyChunks = chunkText(bodyText, MAX_CHARS_PER_CHUNK);')
b = s.index('\n    const outPath = ', a)
s = s[:a] + '''    const speechChunks = audioRecipe.narrationChunks(script, MAX_CHARS_PER_CHUNK);
    logger.info(`narration: ${slug} — ${fullText.length} tegn → ${speechChunks.length} sammenhængende chunk(s), ${audioRecipe.RECIPE_VERSION}/${jingleVersion}`);
    const voicePaths = [];
    for (let i = 0; i < speechChunks.length; i++) {
      const chunkPath = path.join(workDir, `chunk-${String(i).padStart(3, "0")}.mp3`);
      await synthesizeChunk(apiKey, voiceId, speechChunks[i], chunkPath, fullText);
      voicePaths.push(chunkPath);
    }
    const listPath = path.join(workDir, "concat.txt");
    fs.writeFileSync(listPath, voicePaths.map(p => `file '${escapeConcatPath(p)}'`).join("\\n"));
''' + s[b:]
replace('    await produceFinal(listPath, outPath, workDir, breakerWindows);', '    await produceFinal(listPath, outPath, workDir, jingleVersion);')
replace('  if (metadata.imageURL) payload.imageURL = String(metadata.imageURL);', '  if (metadata.imageURL) payload.imageURL = String(metadata.imageURL);\n  if (metadata.audioRecipe) payload.audioRecipe = metadata.audioRecipe;')
replace('      imageURL,\n    });\n\n    await syncManifest(bucket);', '''      imageURL,
      audioRecipe: {version: audioRecipe.RECIPE_VERSION, jingleVersion, selectionRevision: jingleSelection.revision, voiceId, modelId: MODEL_ID, stability: 1, insertedPauseSeconds: 0, outroCopy: "free-ad-free-v1"},
    });

    await syncManifest(bucket);''')
(output/'narration.js').write_text(s)
shutil.copyfile(ROOT/'recipe.cjs', output/'narrationAudioRecipe.cjs')
for p in args.assets.iterdir():
    if p.is_file(): shutil.copyfile(p, output/'assets'/p.name)
after = {str(p.relative_to(output)):hashlib.sha256(p.read_bytes()).hexdigest() for p in output.rglob('*') if p.is_file()}
changed = [p for p in before if before[p] != after.get(p)]
if changed != ['narration.js']: raise ValueError('Unexpected existing file changes: '+repr(changed))
print(json.dumps({'historicalFixture':args.historical_fixture,'activeSourceVerified':False,'baseNarrationSha256':BASE_NARRATION,'changedExisting':changed,'added':[p for p in after if p not in before],'preservedExistingFiles':[p for p in before if p not in changed],'hashes':after},indent=2))
