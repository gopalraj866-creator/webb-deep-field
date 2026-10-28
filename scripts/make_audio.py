#!/usr/bin/env python3
"""Builds narration (edge-tts), captions timing and a generated ambient music bed.

Outputs in build/:  captions_main.json, captions_short.json, audio_main.m4a, audio_short.m4a
If edge-tts / network is unavailable the script still produces music + estimated captions (silent narration)
so the pipeline never fails; set REQUIRE_TTS=1 to make a TTS failure fatal instead.
"""
import asyncio, json, math, os, shutil, subprocess, sys, tempfile, wave
import numpy as np

FFMPEG = os.environ.get("FFMPEG") or "ffmpeg"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "build"); os.makedirs(OUT, exist_ok=True)
SR = 44100
SCRIPT = json.load(open(os.path.join(ROOT, "data/script.json"), encoding="utf-8"))
VOICE = os.environ.get("VOICE", SCRIPT.get("voice", "en-US-AndrewNeural"))
RATE = os.environ.get("TTS_RATE", "+0%")
DURS = {"main": [30, 55, 65, 45, 40, 60, 80, 65, 45, 40, 15], "short": [10, 8, 22, 10, 8]}
REQUIRE_TTS = os.environ.get("REQUIRE_TTS") == "1"


def run(cmd):
    if shutil.which(cmd[0]) is None:
        raise SystemExit(f"{cmd[0]} is not installed (apt-get install -y ffmpeg espeak-ng)")
    return subprocess.run(cmd, check=True, capture_output=True)


def clip_duration(path):
    w = path + ".probe.wav"; to_wav(path, w)
    return len(read_wav(w)) / SR


def to_wav(src, dst, tempo=1.0):
    f = ["-af", f"atempo={tempo:.4f}"] if abs(tempo - 1) > 0.01 else []
    run([FFMPEG, "-y", "-loglevel", "error", "-i", src, *f, "-ar", str(SR), "-ac", "1", dst])


def read_wav(path):
    with wave.open(path) as w:
        raw = w.readframes(w.getnframes())
        return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


async def edge_one(text, path, voice):
    import edge_tts
    kw = {} if RATE in ("+0%", "0%", "") else {"rate": RATE}
    await edge_tts.Communicate(text, voice, **kw).save(path)
    if not os.path.exists(path) or os.path.getsize(path) < 1000:
        raise RuntimeError("empty audio")


def espeak_one(text, path):
    run(["espeak-ng", "-v", "en-us+m3", "-s", "150", "-p", "40", "-w", path, text])


async def tts_edge(items, tmp, mode_tag):
    import edge_tts
    paths = []
    for i, text in enumerate(items):
        p = os.path.join(tmp, f"{mode_tag}_l{i:03d}.mp3")
        for attempt in range(3):
            try:
                await edge_tts.Communicate(text, VOICE, rate=RATE).save(p)
                if os.path.getsize(p) > 1000:
                    break
                raise RuntimeError("empty audio")
            except Exception:
                if attempt == 2:
                    raise
                await asyncio.sleep(2)
        paths.append(p)
    return paths


def tts_gtts(items, tmp, mode_tag):
    from gtts import gTTS  # Google Translate voice; Indian-English accent via tld
    paths = []
    for i, text in enumerate(items):
        p = os.path.join(tmp, f"{mode_tag}_g{i:03d}.mp3")
        gTTS(text, lang="en", tld=os.environ.get("GTTS_TLD", "co.in")).save(p)
        paths.append(p)
    return paths


def tts_all(items, tmp, mode_tag="x"):
    try:
        return asyncio.run(tts_edge(items, tmp, mode_tag))
    except Exception as e:
        print(f"[audio] edge-tts failed ({e}); trying gTTS fallback", file=sys.stderr)
    return tts_gtts(items, tmp, mode_tag)


def build_mode(mode, tmp):
    sc = SCRIPT[mode]
    lines = [(si, l) for si, s in enumerate(sc) for l in s["lines"]]
    total = sum(DURS[mode])
    tts_ok = True
    try:
        paths = tts_all([l for _, l in lines], tmp, mode)
        raw = [clip_duration(p) for p in paths]
    except Exception as e:
        print(f"[audio] TTS unavailable for {mode}: {e}", file=sys.stderr)
        if REQUIRE_TTS:
            raise
        tts_ok = False; paths = None
        raw = [max(1.6, len(l.split()) / 2.5) for _, l in lines]
    voice = np.zeros(int(total * SR) + SR * 2, dtype=np.float32)
    caps = []; starts = np.cumsum([0] + DURS[mode])
    k = 0
    for si, s in enumerate(sc):
        n = len(s["lines"]); durs = raw[k:k + n]
        win0 = starts[si] + 0.5; avail = DURS[mode][si] - 1.0
        gap = 0.35; need = sum(durs) + gap * (n - 1)
        tempo = 1.0
        if need > avail:
            tempo = min(1.3, need / avail); durs = [d / tempo for d in durs]; need = sum(durs) + gap * (n - 1)
        slack = max(0.0, avail - need); extra = min(1.2, slack / max(1, n - 1)) if n > 1 else 0.0
        t = win0
        for j in range(n):
            if tts_ok:
                w = os.path.join(tmp, f"{mode}_{k + j}.wav"); to_wav(paths[k + j], w, tempo)
                a = read_wav(w); i0 = int(t * SR); voice[i0:i0 + len(a)] += a[: len(voice) - i0]
            caps.append({"start": round(t, 3), "end": round(t + durs[j], 3), "text": s["lines"][j]})
            t += durs[j] + gap + extra
        k += n
    json.dump(caps, open(os.path.join(OUT, f"captions_{mode}.json"), "w"), ensure_ascii=False, indent=1)
    return voice[: int(total * SR)], total, tts_ok


def lowpass(x, n):
    c = np.cumsum(np.insert(x, 0, 0)); y = (c[n:] - c[:-n]) / n
    return np.concatenate([np.full(n, y[0]), y])[: len(x)]


def music(total, mode):
    n = int(total * SR); t = np.arange(n) / SR; rng = np.random.default_rng(7)
    out = np.zeros(n, dtype=np.float32)
    chords = [[55.0, 82.41, 110.0, 164.81], [43.65, 87.31, 130.81, 174.61], [49.0, 98.0, 146.83, 196.0], [51.91, 103.83, 155.56, 207.65]]
    seg = 18.0
    for i, f in enumerate(sum(chords, [])):
        pass
    for ci in range(int(total / seg) + 2):
        c = chords[ci % 4]; a = int(ci * seg * SR); b = min(n, int((ci + 1) * seg * SR) + SR * 3)
        if a >= n: break
        tt = np.arange(b - a) / SR
        env = np.minimum(1, tt / 4.0) * np.minimum(1, (seg + 3 - tt) / 4.0)
        for f in c:
            for det in (-0.6, 0.0, 0.7):
                out[a:b] += (0.05 * np.sin(2 * np.pi * (f + det * 0.3) * tt + rng.random() * 6.28) * env).astype(np.float32)
        # soft shimmer arpeggio
        for k, f in enumerate(c * 2):
            t0 = k * seg / 8.0
            m = (tt > t0) & (tt < t0 + 5)
            e = np.zeros_like(tt); e[m] = np.exp(-(tt[m] - t0) * 0.9) * np.minimum(1, (tt[m] - t0) * 8)
            out[a:b] += (0.022 * np.sin(2 * np.pi * f * 4 * tt) * e).astype(np.float32)
    # slow swell + sub pulse
    out *= (0.75 + 0.25 * np.sin(2 * np.pi * t / 23.0)).astype(np.float32)
    out += (0.05 * np.sin(2 * np.pi * 36.0 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * t / 9.0))).astype(np.float32)
    # risers into each scene boundary, impacts at the big moments
    bounds = np.cumsum(DURS[mode])[:-1]
    for bt in bounds:
        L = int(2.2 * SR); a = int(bt * SR) - L
        if a < 0: continue
        nz = lowpass(rng.standard_normal(L).astype(np.float32), 20) * 1.8
        out[a:a + L] += nz * (np.linspace(0, 1, L) ** 2) * 0.05
    imp = [14.4] if mode == "main" else [5.0]
    for it in imp:
        L = int(3.0 * SR); a = int(it * SR); tt = np.arange(L) / SR
        out[a:a + L] += (0.45 * np.sin(2 * np.pi * (52 - 14 * tt) * tt) * np.exp(-tt * 1.6)).astype(np.float32)
        out[a:a + L] += (lowpass(rng.standard_normal(L).astype(np.float32), 8) * np.exp(-tt * 3.0) * 0.18)
    out /= max(1e-6, np.max(np.abs(out))) / 0.5
    fade = int(2.0 * SR); out[:fade] *= np.linspace(0, 1, fade); out[-fade * 2:] *= np.linspace(1, 0, fade * 2)
    return out


def duck_mix(voice, mus):
    env = lowpass(np.abs(voice), int(0.25 * SR)); env = np.clip(env / 0.04, 0, 1)
    env = lowpass(env, int(0.3 * SR))
    gain = 1.0 - 0.62 * env
    mix = mus * gain * 0.9 + voice * 1.15
    return np.clip(mix, -0.98, 0.98)


def write_m4a(x, path):
    st = np.stack([x, x], axis=1)
    p = subprocess.Popen([FFMPEG, "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-c:a", "aac", "-b:a", "224k", path], stdin=subprocess.PIPE)
    p.communicate(st.astype(np.float32).tobytes()); assert p.returncode == 0


def main():
    with tempfile.TemporaryDirectory() as tmp:
        for mode in ("main", "short"):
            voice, total, ok = build_mode(mode, tmp)
            mus = music(total, mode)
            mix = duck_mix(voice, mus[: len(voice)])
            write_m4a(mix, os.path.join(OUT, f"audio_{mode}.m4a"))
            print(f"[audio] {mode}: {total}s, narration={'edge-tts ' + VOICE if ok else 'SILENT (TTS unavailable)'}")


if __name__ == "__main__":
    main()
