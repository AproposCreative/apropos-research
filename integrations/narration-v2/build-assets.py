"""Build deterministic music cuts from the retained owner WAV. No AI or network."""
import argparse, array, hashlib, json, math, sys, wave
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--demo-root', type=Path, required=True)
parser.add_argument('--destination', type=Path, required=True)
args = parser.parse_args()
assert sys.byteorder == 'little'
root, dest = args.demo_root, args.destination
dest.mkdir(parents=True, exist_ok=False)
original = json.loads((root/'demo-manifest.json').read_text())
r3 = json.loads((root/'revision-3/manifest.json').read_text())
assert original['v2Cuts']['beatLoop'] == [47.39, 82.94555555555556]
assert original['v2Cuts']['outro'] == [470.49233560090704, 476.99233560090704]
assert math.isclose(r3['introNormalizationDb'], -4.857875347137451, abs_tol=1e-12)
assert math.isclose(original['v2MusicAdjustmentDb']['bed'], -10.98267992593515, abs_tol=1e-12)
assert math.isclose(original['v2MusicAdjustmentDb']['outro'], -0.992633532018077, abs_tol=1e-12)
assert math.isclose(r3['bedNormalizationDb'] - original['v2MusicAdjustmentDb']['bed'], 3, abs_tol=1e-12)
assert r3['loopCrossfadeSeconds'] == .08
source = root/'source-v2.wav'
assert hashlib.sha256(source.read_bytes()).hexdigest() == '965949e0e52b36149e55c4ab486ab1c3be45e5e39bd2d64145430f823ffda4bb'
with wave.open(str(source), 'rb') as w:
    assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (44100, 2, 2)
    pcm = array.array('h', w.readframes(w.getnframes()))
sr = 44100
start, end = [round(v*sr) for v in original['v2Cuts']['beatLoop']]
intro = start - 6*sr
first = array.array('h')
def quant(value):
    n = round(value)
    if not -32768 <= n <= 32767: raise ValueError('Asset clipping')
    return n
for frame in range(end - intro):
    t = frame/sr
    q = min(1, max(0, (t-5.5)/2)); q = q*q*(3-2*q)
    db = r3['introNormalizationDb'] + (r3['bedNormalizationDb'] - r3['introNormalizationDb'])*q
    for c in range(2): first.append(quant(pcm[(intro+frame)*2+c] * 10**(db/20)))
loop = array.array('h')
crossfade = round(.08*sr)
for frame in range(end-start):
    angle = min(1, frame/(crossfade-1))*math.pi/2
    for c in range(2):
        value = pcm[(start+frame)*2+c]
        if frame < crossfade:
            value = pcm[(end+frame)*2+c]*math.cos(angle) + value*math.sin(angle)
        loop.append(quant(value*10**(r3['bedNormalizationDb']/20)))
outro = array.array('h')
a, b = [round(v*sr) for v in original['v2Cuts']['outro']]
for sample in pcm[a*2:b*2]: outro.append(quant(sample*10**(original['v2MusicAdjustmentDb']['outro']/20)))
assert len(first)//2 == 1832600 and len(loop)//2 == 1568000 and len(outro)//2 == 286650
records = []
for name, samples in [('narration-v2-first.wav', first), ('narration-v2-loop.wav', loop), ('narration-v2-outro.wav', outro)]:
    p = dest/name
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(samples.tobytes())
    records.append({'name':name, 'bytes':p.stat().st_size, 'sha256':hashlib.sha256(p.read_bytes()).hexdigest(), 'durationSeconds':len(samples)/(2*sr)})
old = Path('/Users/frederikkragh/Developer/apropos-magazine-app/functions/assets/narration-jingle.wav')
old_hash = hashlib.sha256(old.read_bytes()).hexdigest()
assert old_hash == 'ba2545a42cca7a90822340c2908c5a1d8681800211eaad9b402ee16c7f67f82d'
manifest = {'version':'ellen-continuous-v2-2026-10-31', 'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'v1':[{'name':'narration-jingle.wav','bytes':old.stat().st_size,'sha256':old_hash}], 'v2':records, 'continuousIntroSourceSeconds':[intro/sr,start/sr], 'loopCrossfadeSeconds':crossfade/sr, 'beatGainChangeDb':r3['bedNormalizationDb'] - original['v2MusicAdjustmentDb']['bed']}
(dest/'narration-v2-assets.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
