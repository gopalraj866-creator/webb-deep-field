# Webb's Deepest Look Yet — 9-minute Three.js video (4K · 1080p · Shorts)

**Title:** Webb's Deepest Look Yet | 2,500 Hidden Galaxies Found | 100 Hours Staring Into Nothing
**Length:** 9:00 (540 s) at 30 fps · **Shorts:** 58 s, 1080×1920 · **Engine:** Three.js / WebGL2, deterministic frame-by-frame render → ffmpeg (H.264) · **Channel branding:** Technical Talk India

## Run it on GitHub (no local setup)
1. Create a new GitHub repo and push the contents of this folder (the `.github/workflows/render.yml` file must be included).
2. **Actions → "Render Webb Deep Field video" → Run workflow.**
   Inputs: `targets` (`4k,1080p,shorts`), `fps` (30), `segment_seconds` (30), `voice` (edge-tts voice).
3. When finished, download the artifact **`webb-deep-field-final`**:
   `webb-deep-field-4k.mp4`, `webb-deep-field-1080p.mp4`, `webb-deep-field-shorts.mp4`, `thumbnail.png`, `youtube_description.txt` (title ideas, chapters, tags, sources).

How it works: an `audio` job makes narration (edge-tts), caption timing and a generated music bed; a `plan` job splits the timeline into 30-second segments; each segment is rendered by its own parallel job (headless Chromium + SwiftShader WebGL2, no GPU needed); the `assemble` job concatenates the segments and muxes the audio.

### Render time (measured here)
- 1080p: ~0.9 s/frame → a 30 s segment (900 frames) ≈ 14 min.
- 4K: 4× the pixels, so roughly 3–4 s/frame → a 30 s segment ≈ 50–60 min (extrapolated, not measured end-to-end). With 18 segments and 20 parallel jobs the whole 4K run is about 1–1.5 h wall-clock on a public repo. On a private repo the free concurrency limit is lower, so lower `segment_seconds` won't help — expect it to take longer.
- Each job has a 350-minute cap; if a 4K job ever times out, re-run with `segment_seconds` = 15.

## Run locally
```bash
npm ci
npm run still -- --scene exposure --p 0.7 --out preview.png        # any scene: hook patch hubble redshift webb miri exposure sources virgil dawn outro
python3 scripts/make_audio.py                                        # pip install edge-tts numpy first
npm run render:1080p                                                 # whole video, slow on one machine
```
Set `CHROME_PATH` to use your own Chrome/Chromium instead of the bundled one.

## Storyline (chapters)
0:00 Hook · 0:30 The empty patch · 1:25 Hubble Ultra Deep Field · 2:30 Why infrared (redshift) · 3:15 Meet Webb · 3:55 MIRI, the coldest eye · 4:55 100 hours of exposure (noise → galaxies) · 6:15 2,500+ sources · 7:20 Virgil, the little red dot · 8:05 Cosmic dawn (JADES-GS-z14-0, MoM-z14) · 8:45 Outro

## Facts used (web-sourced) and how they are worded
- ~100 hours total in MIRI's shortest-wavelength filters + NIRCam; 41 hours in a single filter = Webb's longest single-filter exposure of an extragalactic field (ESA/Webb potm2507a, Live Science).
- "More than 2,500 **sources**" in the patch, hundreds extremely red (ESA/Webb). The narration deliberately says *sources*, not "galaxies", because ESA does not say all 2,500 are galaxies.
- MIDIS paper: >500 galaxies with spectroscopic redshifts up to z≈11; ~25 at 6<z<12; >100 very red objects.
- Hubble UDF: 800 exposures, 400 orbits, 11.3 days, Sept 24 2003 – Jan 16 2004, ~10,000 galaxies, ≈1/10 the Moon's width.
- MIRI: 5–28.5 µm, <7 K via cryocooler, 6.4 K reached April 2022, ~10× dark current per kelvin, ~90 K after sunshield.
- Virgil (little red dot, z≈6.6) from the MIDIS/Iani et al. paper; JADES-GS-z14-0 z=14.32 (~290 Myr); MoM-z14 z=14.44 (~280 Myr, ESA Jan 2026). "Most distant" records can be broken — re-check before publishing.
- Webb also spent >120 h on Abell S1063 (May 2025); the narration mentions it so "deepest look" isn't misleading.
- Full list: `data/script.json` → `sources`.

## Honest caveats
- **Visuals are a procedural simulation**, not real Webb pixels; the video says so (outro, exposure and Virgil scenes) and the YouTube description includes a note. Keep that disclosure.
- The exposure "hours" counter is illustrative (hours vs. visual clarity is not a measured curve).
- Cosmic ages for z=2, 6, 10 are standard ΛCDM approximations.
- Narration uses Microsoft edge-tts, which needs internet access on the runner (GitHub runners have it). If it fails the workflow still produces music + captions but **silent narration** — set `REQUIRE_TTS=1` in the workflow's audio step to make that a hard failure instead. The TTS path could not be tested in the sandbox this was built in (no access to the speech service); everything else (render, captions, music, concat, mux) was tested.
- Voice: change the `voice` input (e.g. `en-IN-PrabhatNeural` for an Indian-English voice).

## Edit the video
- Narration & captions: `data/script.json` (keep each scene's length in mind: ~2.3 words/s; lines are auto speed-adjusted up to 1.3×).
- Scene lengths: `SCENES` in `src/main.js` and `DURS` in `scripts/make_audio.py`, `scripts/plan.mjs` totals.
- Scenes/visuals: `src/scenes.js`; galaxy sprites/post-processing: `src/lib.js`; Webb/Hubble/Earth/Moon models: `src/models.js`.
