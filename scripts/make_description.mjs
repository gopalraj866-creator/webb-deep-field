// Writes dist/youtube_description.txt (title ideas, chapters, description, tags, sources).
import fs from 'node:fs';
const script = JSON.parse(fs.readFileSync(new URL('../data/script.json', import.meta.url)));
const chapters = [['Hook: 100 hours of nothing', 0], ['The empty patch of sky', 30], ["Hubble's Ultra Deep Field", 85], ['Why we need infrared', 150], ['Meet the James Webb Space Telescope', 195], ['MIRI: the coldest eye', 235], ['100 hours of exposure', 295], ['2,500+ sources revealed', 375], ['Virgil, the little red dot', 440], ['Cosmic dawn', 485], ['What should Webb look at next?', 525]];
const ts = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const txt = `TITLE OPTIONS
1. Webb's Deepest Look Yet | 2,500+ Hidden Sources Found | 100 Hours Staring Into Nothing
2. James Webb Stared at "Nothing" for 100 Hours — What It Found Will Shock You
3. 100 Hours of Darkness: Webb's Deepest Mid-Infrared Look at the Hubble Ultra Deep Field

DESCRIPTION
The James Webb Space Telescope pointed its Mid-Infrared Instrument (MIRI) at one of the most famous patches of sky — the Hubble Ultra Deep Field — for nearly 100 hours. The result: more than 2,500 sources in a speck of sky a tenth the width of the Moon, including hundreds of extremely red, dust-obscured or very distant galaxies.

In this video: why infrared matters, how Webb's MIRI is cooled below 7 kelvin, what "100 hours" of exposure really looks like, and how far back in time Webb has now seen.

CHAPTERS
${chapters.map(([n, s]) => `${ts(s)} ${n}`).join('\n')}

NOTE ON VISUALS
All visuals are a procedural Three.js/WebGL simulation inspired by published results — not actual Webb imagery. For the real image, search "ESA Webb potm2507a".

SOURCES
${script.sources.map((s) => '- ' + s).join('\n')}

Subscribe to Technical Talk India for more space explainers.

TAGS
james webb, jwst, webb telescope, hubble ultra deep field, deep field, miri, mid infrared, cosmic dawn, early universe, galaxies, space, astronomy, MIDIS, little red dots, MoM-z14, JADES, science explained, technical talk india

SHORTS TITLE IDEAS
- Webb stared at NOTHING for 100 hours... #shorts #space #jwst
- 2,500+ hidden sources in a speck of sky #shorts #webb
`;
fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/youtube_description.txt', txt); console.log('wrote dist/youtube_description.txt');
