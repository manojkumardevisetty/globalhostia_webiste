"""Add the spoken English voice-over to the help videos (public/help/videos/<slug>.mp4).

Voice: Kokoro-82M (Apache-2.0) via kokoro-onnx, voice af_heart, speed 1.0 — the same engine and voice as the
reMarketplace explainer. Runs offline on CPU; nothing is sent anywhere.

  python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile
  # model files (GitHub release of kokoro-onnx, ~350 MB): kokoro-v1.0.onnx, voices-v1.0.bin
  .venv/bin/python scripts/help-videos/narrate.py --models <dir> --src <dir of the SILENT recordings> [slug ...]

--src must hold the silent recordings from encode.mjs (never feed an already narrated file back in). For each video it
speaks every line of narration.json at its step start, holds the frame before a step when the previous line needs more
time (lines are never sped up), mixes the voice (80 Hz high-pass, -16 LUFS, -1.5 dBTP), muxes AAC 96 kbps mono with
faststart (video stream copied when no hold is needed), writes the English captions from the spoken lines, shifts the
Arabic captions by any holds, and updates lib/help/media.ts.
"""
import argparse, json, os, re, subprocess, sys
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
VID = os.path.join(ROOT, 'public', 'help', 'videos')
SR, GAP, TAIL = 24000, 0.4, 0.8

ap = argparse.ArgumentParser()
ap.add_argument('--models', required=True); ap.add_argument('--src', required=True); ap.add_argument('--work', default='/tmp/help-narrate')
ap.add_argument('slugs', nargs='*')
args = ap.parse_args()
cfg = json.load(open(os.path.join(os.path.dirname(__file__), 'narration.json')))
os.makedirs(args.work, exist_ok=True)
k = Kokoro(os.path.join(args.models, 'kokoro-v1.0.onnx'), os.path.join(args.models, 'voices-v1.0.bin'))

def run(cmd, **kw): return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)
def dur(p): return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).stdout)
def ts(s): ms = round(s * 1000); return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}.{ms % 1000:03d}'
def pts(t): h, m, s = t.split(':'); return int(h) * 3600 + int(m) * 60 + float(s)
def sentences(t): return [s for s in re.split(r'(?<=[.?!])\s+', t.strip()) if s]

def speak(text):
    ph = k.tokenizer.phonemize(text, cfg['lang'])
    for a, b in cfg.get('phonemes', {}).items(): ph = ph.replace(a, b)
    a, sr = k.create(ph, voice=cfg['voice'], speed=cfg['speed'], lang=cfg['lang'], is_phonemes=True)
    assert sr == SR
    nz = np.where(np.abs(a) > 0.01)[0]
    return a[max(0, nz[0] - 960): min(len(a), nz[-1] + 960)]

def narrate(slug):
    lines, src = cfg['videos'][slug], os.path.join(args.src, f'{slug}.mp4')
    vdur = dur(src)
    ar_src = open(os.path.join(args.src, f'{slug}.ar.vtt')).read()
    steps = [pts(x) for x in re.findall(r'^(\d\d:\d\d:\d\d\.\d{3}) -->', open(os.path.join(args.src, f'{slug}.en.vtt')).read(), re.M)]
    # freeze on the last frame before the step's caption changes, so the on-screen step label and the voice agree
    # (the recorder's on-screen label changes ~0.2 s before the caption cue, so freeze 0.4 s ahead of the cue)
    cut = lambda at: round(max(0.0, max([x for x in steps if x <= at + 0.01] or [at]) - 0.4), 3)
    clips = [speak(l['text']) for l in lines]
    # place each line at its step; a hold (frozen frame just before the step) makes room when the previous line runs on
    holds, shift, prev_end, starts = [], 0.0, -1e9, []
    for l, a in zip(lines, clips):
        st = l['at'] + shift
        need = prev_end + GAP - st
        if need > 0.02: holds.append((cut(l['at']), round(need, 3))); shift += need; st += need
        starts.append(st); prev_end = st + len(a) / SR
    if prev_end + TAIL > vdur + shift: holds.append((vdur, round(prev_end + TAIL - vdur - shift, 3)))
    total = vdur + sum(h for _, h in holds)
    moved = lambda t: t + sum(h for at, h in holds if at <= t + 1e-6)

    mix = np.zeros(int(total * SR) + SR, dtype=np.float32)
    for st, a in zip(starts, clips): i = int(st * SR); mix[i:i + len(a)] += a
    wav = os.path.join(args.work, f'{slug}.wav'); sf.write(wav, mix[:int(total * SR)], SR)

    if holds:
        fc, parts, t0 = [], [], 0.0
        for n, (t, h) in enumerate(holds + ([(vdur, 0)] if holds[-1][0] < vdur else [])):
            fc.append(f'[0:v]trim=start={t0}:end={t},setpts=PTS-STARTPTS' + (f',tpad=stop_mode=clone:stop_duration={h}' if h else '') + f'[v{n}]')
            parts.append(f'[v{n}]'); t0 = t
        fc.append(''.join(parts) + f'concat=n={len(parts)}:v=1:a=0,fps=25[v]')
        vargs = ['-filter_complex', ';'.join(fc), '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p']
    else:
        vargs = ['-map', '0:v', '-c:v', 'copy']
    af = 'highpass=f=80,lowpass=f=14000'
    m = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', af + ',loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    j = json.loads(m[m.rindex('{'):m.rindex('}') + 1])
    ln = f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true"
    out = os.path.join(args.work, f'{slug}.mp4')
    run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-i', wav] + vargs + ['-map', '1:a', '-af', f'{af},{ln},aresample=48000', '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-movflags', '+faststart', '-t', f'{total:.3f}', out])
    os.replace(out, os.path.join(VID, f'{slug}.mp4'))

    # English captions = what is spoken: one cue per sentence, timed by its share of the line's audio
    cues = []
    for i, (l, a, st) in enumerate(zip(lines, clips, starts)):
        ss, d = sentences(l['text']), len(a) / SR
        nxt = starts[i + 1] - 0.05 if i + 1 < len(lines) else total
        w = [len(s) for s in ss]; t = st
        for n, s in enumerate(ss):
            e = t + d * w[n] / sum(w)
            cap = s
            for x, y in cfg.get('captions', {}).items(): cap = cap.replace(x, y)
            cues.append((t, max(e + 0.3, t + 1.0) if n + 1 < len(ss) else max(nxt, e + 0.3), cap)); t = e
    cues = [(a, min(b, cues[i + 1][0]) if i + 1 < len(cues) else min(b, total), s) for i, (a, b, s) in enumerate(cues)]
    with open(os.path.join(VID, f'{slug}.en.vtt'), 'w') as f:
        f.write('WEBVTT\n\n' + '\n'.join(f'{i + 1}\n{ts(a)} --> {ts(b)}\n{s}\n' for i, (a, b, s) in enumerate(cues)))
    # Arabic captions: same step text, shifted by the holds
    with open(os.path.join(VID, f'{slug}.ar.vtt'), 'w') as f:
        f.write(re.sub(r'(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})', lambda mm: f'{ts(moved(pts(mm[1])))} --> {ts(min(total, moved(pts(mm[2]))))}', ar_src))
    return {'slug': slug, 'in': round(vdur, 2), 'out': round(total, 2), 'holds': holds, 'bytes': os.path.getsize(os.path.join(VID, f'{slug}.mp4')),
            'wpm': [round(len(l['text'].split()) / (len(a) / SR) * 60) for l, a in zip(lines, clips)]}

res = [narrate(s) for s in (args.slugs or list(cfg['videos']))]
mp = os.path.join(ROOT, 'lib', 'help', 'media.ts'); ts_src = open(mp).read()
for r in res:
    ts_src = re.sub(rf"('{r['slug']}': \{{\s*duration: )\d+(,\s*bytes: )\d+", lambda mm: f"{mm[1]}{round(r['out'])}{mm[2]}{r['bytes']}", ts_src)
open(mp, 'w').write(ts_src)
for r in res: print(json.dumps(r))
