// Generates the SVG panels for the README with the same 5x7 pixel font as the hero.
import fs from 'node:fs';
import { textPixels } from './font.js';

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const path = (str, x, y, s) => textPixels(str).map(([a, b]) => `M${x + a * s} ${y + b * s}h${s}v${s}h-${s}z`).join('');
const pix = (str, x, y, s, fill, extra = '') => `<path d="${path(str, x, y, s)}" fill="${fill}" ${extra}/>`;

const AVATAR = [
  '................', '.....KKKKKK.....', '...KKRRRRWWKK...', '..KRRRRRWWWWRK..', '.KRRWWRRRWWRRRK.', '.KRWWWWRRRRRRRK.',
  'KRRWWWWRRRRWWRRK', 'KRRRWWRRRRWWWWRK', 'KRRRRRRRRRWWWWRK', 'KRWWRRRRRRRWWRRK', '.KKKKKKKKKKKKKK.', '..KSSSESSESSSK..',
  '..KSSSESSESSSK..', '..KSSSSSSSSSSK..', '...KSSSSSSSSK...', '....KKKKKKKK....',
];
const COLORS = { K: '#17121f', R: '#e3262f', W: '#fff1e2', S: '#f3d9b1', E: '#120d18' };
function sprite(x, y, s) {
  const byColor = {};
  AVATAR.forEach((row, r) => [...row].forEach((c, col) => {
    if (c === '.' || c === 'E') return;
    (byColor[c] ||= []).push(`M${x + col * s} ${y + r * s}h${s}v${s}h-${s}z`);
  }));
  const body = Object.entries(byColor).map(([c, d]) => `<path d="${d.join('')}" fill="${COLORS[c]}"/>`).join('');
  // eyes blink: they collapse to a 1-px line for a moment
  const eyes = [6, 9].map((cx) => `<rect x="${x + cx * s}" y="${y + 11 * s}" width="${s}" height="${2 * s}" fill="#120d18"><animate attributeName="height" values="${2 * s};${2 * s};${s * 0.3};${2 * s}" keyTimes="0;0.92;0.95;1" dur="4s" repeatCount="indefinite"/><animate attributeName="y" values="${y + 11 * s};${y + 11 * s};${y + 12.2 * s};${y + 11 * s}" keyTimes="0;0.92;0.95;1" dur="4s" repeatCount="indefinite"/></rect>`).join('');
  return body + eyes;
}

// ---------- terminal panel ----------
{
  const Wd = 900, Ht = 300, S = 2, CH = 12, LH = 26, X0 = 34, Y0 = 70;
  const LOOP = 14;
  const lines = [
    { prompt: true, text: 'whoami', color: '#f4f7fb' },
    { text: 'M. AL MANZALAWY - SOFTWARE ENGINEER, EGYPT', color: '#5eecc4' },
    { prompt: true, text: 'cat stack.txt', color: '#f4f7fb' },
    { text: 'REACT NATIVE  EXPO  NESTJS  SWIFT  AWS  POSTGRES', color: '#ffd166' },
    { text: 'TYPESCRIPT  DOCKER  TERRAFORM  REDIS  SALESFORCE', color: '#ffd166' },
    { prompt: true, text: 'status --now', color: '#f4f7fb' },
    { text: 'SHIPPING BIXTICO.CV', color: '#ff5f8f' },
  ];
  let t = 0.5; // seconds
  const body = [];
  const clips = [];
  lines.forEach((ln, i) => {
    const y = Y0 + i * LH;
    const x = X0 + (ln.prompt ? 2 * CH : 0);
    const n = ln.text.length;
    const typeDur = ln.prompt ? n * 0.07 : 0.25; // commands are typed, output appears at once
    const start = t, end = t + typeDur;
    t = end + (ln.prompt ? 0.35 : 0.3);
    const w = n * CH;
    // reveal: discrete steps per char for commands
    const vals = [], keys = [];
    const k = (s) => (s / LOOP).toFixed(4);
    vals.push(0); keys.push(0);
    vals.push(0); keys.push(k(start));
    const steps = ln.prompt ? n : 1;
    for (let c = 1; c <= steps; c++) { vals.push(Math.round((c / steps) * w)); keys.push(k(start + (c / steps) * typeDur)); }
    vals.push(w); keys.push(k(LOOP - 0.6));
    vals.push(0); keys.push(1);
    clips.push(`<clipPath id="c${i}"><rect x="${x}" y="${y - 2}" height="${7 * S + 4}" width="0"><animate attributeName="width" values="${vals.join(';')}" keyTimes="${keys.join(';')}" calcMode="discrete" dur="${LOOP}s" repeatCount="indefinite"/></rect></clipPath>`);
    if (ln.prompt) {
      const showKeys = `0;${k(Math.max(0.001, start - 0.25))};${k(LOOP - 0.6)};1`;
      body.push(`<g opacity="0">${pix('>', X0, y, S, '#5eecc4')}<animate attributeName="opacity" values="0;1;0;0" keyTimes="${showKeys}" calcMode="discrete" dur="${LOOP}s" repeatCount="indefinite"/></g>`);
    }
    body.push(`<g clip-path="url(#c${i})">${pix(ln.text, x, y, S, ln.color)}</g>`);
    if (i === lines.length - 1) {
      // progress bar after the status line
      const bx = x + w + 18, bw = 220;
      const bStart = end + 0.2;
      body.push(`<g opacity="0"><rect x="${bx}" y="${y}" width="${bw}" height="${7 * S}" fill="none" stroke="#24344c" stroke-width="2"/>
        <rect x="${bx + 3}" y="${y + 3}" height="${7 * S - 6}" width="0" fill="#ff5f8f"><animate attributeName="width" values="0;0;${bw - 6};${bw - 6};0" keyTimes="0;${k(bStart)};${k(bStart + 3.2)};${k(LOOP - 0.6)};1" dur="${LOOP}s" repeatCount="indefinite"/></rect>
        <animate attributeName="opacity" values="0;1;0;0" keyTimes="0;${k(bStart)};${k(LOOP - 0.6)};1" calcMode="discrete" dur="${LOOP}s" repeatCount="indefinite"/></g>`);
    }
  });
  // cursor on the last prompt line
  const cy = Y0 + lines.length * LH;
  body.push(`<g opacity="0">${pix('>', X0, cy, S, '#5eecc4')}<rect x="${X0 + 2 * CH}" y="${cy}" width="${CH - 2}" height="${7 * S}" fill="#ff2d3a"><animate attributeName="opacity" values="1;0" dur="0.9s" calcMode="discrete" repeatCount="indefinite"/></rect><animate attributeName="opacity" values="0;1;0;0" keyTimes="0;${(t / LOOP).toFixed(4)};${((LOOP - 0.6) / LOOP).toFixed(4)};1" calcMode="discrete" dur="${LOOP}s" repeatCount="indefinite"/></g>`);

  const spX = 700, spY = 86, spS = 9;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Ht}" viewBox="0 0 ${Wd} ${Ht}" role="img">
<title>whoami: M. Al Manzalawy, software engineer from Egypt. Stack: React Native, Expo, NestJS, Swift, AWS, Postgres, TypeScript, Docker, Terraform, Redis, Salesforce.</title>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1020"/><stop offset="1" stop-color="#05070d"/></linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ff2d3a" stop-opacity="0.35"/><stop offset="1" stop-color="#ff2d3a" stop-opacity="0"/></radialGradient>
  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#5eecc4" stroke-opacity="0.05"/></pattern>
  ${clips.join('\n  ')}
</defs>
<rect x="1" y="1" width="${Wd - 2}" height="${Ht - 2}" rx="20" fill="url(#bg)" stroke="#24344c" stroke-width="2"/>
<rect x="1" y="1" width="${Wd - 2}" height="${Ht - 2}" rx="20" fill="url(#grid)"/>
<path d="M1 48H${Wd - 1}" stroke="#24344c" stroke-width="2"/>
<rect x="24" y="19" width="12" height="12" fill="#ff5f57"/><rect x="44" y="19" width="12" height="12" fill="#febc2e"/><rect x="64" y="19" width="12" height="12" fill="#28c840"/>
${pix('~/BIXTICO  -  ZSH', 330, 18, 2, '#8a96ad')}
${body.join('\n')}
<circle cx="${spX + 8 * spS}" cy="${spY + 8 * spS}" r="120" fill="url(#glow)"><animate attributeName="r" values="105;125;105" dur="3s" repeatCount="indefinite"/></circle>
<ellipse cx="${spX + 8 * spS}" cy="${spY + 16 * spS + 18}" rx="56" ry="7" fill="#000" opacity="0.5"><animate attributeName="rx" values="56;44;56" dur="1.6s" repeatCount="indefinite"/></ellipse>
<g><animateTransform attributeName="transform" type="translate" values="0,0;0,-10;0,0" dur="1.6s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.3 0 0.4 1;0.6 0 0.7 1"/>${sprite(spX, spY, spS)}</g>
${[0, 1, 2, 3, 4, 5].map((i) => {
    const sx = spX + 8 * spS + (i - 2.5) * 34, c = ['#5eecc4', '#ff5f8f', '#ffd166'][i % 3];
    return `<rect x="${sx}" y="${spY + 150}" width="5" height="5" fill="${c}"><animate attributeName="y" values="${spY + 150};${spY - 30}" dur="${2.4 + i * 0.37}s" begin="${-i * 0.6}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="${2.4 + i * 0.37}s" begin="${-i * 0.6}s" repeatCount="indefinite"/></rect>`;
  }).join('')}
</svg>`;
  fs.writeFileSync(`${out}/terminal.svg`, svg);
}

// ---------- link buttons ----------
const ICONS = {
  mail: ['#######', '##...##', '#.#.#.#', '#..#..#', '#.....#', '#######'],
  in: ['##.....', '.......', '##.###.', '##.#..#', '##.#..#', '##.#..#'],
  code: ['..#.#..', '.#..#..', '#...#..', '.#..#..', '..#.#..', '.......'].map((r) => r),
  web: ['.#####.', '#.#.#.#', '#######', '#.#.#.#', '#######', '.#####.'],
};
ICONS.code = ['.#...#.', '#.....#', '#..#..#', '#..#..#', '#.....#', '.#...#.'];
function button(file, label, sub, color, icon, delay) {
  const Wd = 290, Ht = 76, S = 3;
  const ip = icon === 'code' ? path('</>', 18, 26, 2) : ICONS[icon].map((row, y) => [...row].map((c, x) => (c === '#' ? `M${22 + x * 4} ${24 + y * 4}h4v4h-4z` : '')).join('')).join('');
  const tx = 70;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Ht}" viewBox="0 0 ${Wd} ${Ht}" role="img">
<title>${label}</title>
<defs>
  <linearGradient id="sweep" x1="0" x2="1"><stop offset="0" stop-color="${color}" stop-opacity="0"/><stop offset="0.5" stop-color="${color}" stop-opacity="0.28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient>
  <clipPath id="r"><rect x="2" y="2" width="${Wd - 4}" height="${Ht - 4}" rx="14"/></clipPath>
</defs>
<rect x="2" y="2" width="${Wd - 4}" height="${Ht - 4}" rx="14" fill="#070b14"/>
<g clip-path="url(#r)"><rect y="0" width="120" height="${Ht}" fill="url(#sweep)" x="-140"><animate attributeName="x" values="-140;${Wd + 20};${Wd + 20}" keyTimes="0;0.4;1" dur="4s" begin="${delay}s" repeatCount="indefinite"/></rect></g>
<rect x="2" y="2" width="${Wd - 4}" height="${Ht - 4}" rx="14" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="10 6"><animate attributeName="stroke-dashoffset" values="0;-32" dur="1.2s" repeatCount="indefinite"/></rect>
<path d="${ip}" fill="${color}"/>
${pix(label, tx, 20, S, '#f4f7fb')}
${pix(sub, tx, 48, 1.5, '#8a96ad')}
<rect x="${Wd - 30}" y="${Ht / 2 - 6}" width="12" height="12" fill="${color}"><animate attributeName="opacity" values="1;0.2;1" dur="1s" begin="${delay}s" repeatCount="indefinite"/></rect>
</svg>`;
  fs.writeFileSync(`${out}/${file}.svg`, svg);
}
button('link-mail', 'MAIL', 'SEND A MESSAGE', '#5eecc4', 'mail', 0);
button('link-linkedin', 'LINKEDIN', 'CONNECT', '#6fb6ff', 'in', 0.5);
button('link-leetcode', 'LEETCODE', 'SOLVED PROBLEMS', '#ffd166', 'code', 1);
console.log('ok');
