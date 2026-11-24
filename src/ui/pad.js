// The clickable controller pictures: one SVG per controller, every input a focusable hit area.
import { inputLabel } from '../core/model.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const BODY = 'M120 52C150 44 270 44 300 52C340 58 370 70 385 110C402 160 412 215 398 245C385 268 355 262 335 240C318 220 300 205 270 205L150 205C120 205 102 220 85 240C65 262 35 268 22 245C8 215 18 160 35 110C50 70 80 58 120 52Z';

/** Where each input sits, per layout family. */
const LAYOUT = {
  xbox: { ls: [120, 112], face: [300, 112], dpad: [160, 168], rs: [260, 168], back: [182, 104], start: [238, 104] },
  ps: { dpad: [120, 112], face: [300, 112], ls: [160, 172], rs: [260, 172], back: [150, 74], start: [270, 74] },
};

/**
 * @param c controller {id, name, type}
 * @param marks Map inputId -> 'bound' | 'other' (bound only in a mode not being shown)
 * @param sel selected input id or null
 */
export function padSvg(c, marks, sel) {
  const L = c.type === 'xbox' ? LAYOUT.xbox : LAYOUT.ps;
  const ps = c.type !== 'xbox';
  const parts = [];
  const cls = (id) => `in ${marks.get(id) || ''}${sel === id ? ' sel' : ''}`;
  const hit = (id, shape, label = '') => {
    const name = inputLabel(c.type, id);
    parts.push(`<g class="${cls(id)}" data-act="sel" data-ctrl="${esc(c.id)}" data-in="${id}" tabindex="0" role="button" aria-pressed="${sel === id}" aria-label="${esc(c.name)} ${esc(name)}"><title>${esc(name)}</title>${shape}${label}</g>`);
  };
  const txt = (x, y, s, size = 13) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${s}</text>`;

  // triggers and bumpers sit behind the body
  hit('lt', `<path d="M86 34 L92 10 Q96 4 104 4 L132 4 Q140 4 142 10 L148 34 Z"/>`, txt(117, 19, ps ? 'L2' : 'LT'));
  hit('rt', `<path d="M272 34 L278 10 Q280 4 288 4 L316 4 Q324 4 328 10 L334 34 Z"/>`, txt(303, 19, ps ? 'R2' : 'RT'));
  hit('lb', `<rect x="66" y="34" width="96" height="20" rx="10"/>`, txt(114, 44, ps ? 'L1' : 'LB', 12));
  hit('rb', `<rect x="258" y="34" width="96" height="20" rx="10"/>`, txt(306, 44, ps ? 'R1' : 'RB', 12));
  parts.push(`<path class="body" d="${BODY}"/><path class="sheen" d="M120 58C160 50 260 50 300 58C330 63 352 72 366 96C300 80 120 80 54 96C68 72 90 63 120 58Z"/>`);
  if (ps) parts.push(`<rect class="deco" x="178" y="58" width="64" height="44" rx="8"/>`);
  else parts.push(`<circle class="deco" cx="210" cy="78" r="13"/>`);

  // face buttons
  const [fx, fy] = L.face;
  const face = { north: [0, -25], east: [25, 0], south: [0, 25], west: [-25, 0] };
  const glyph = {
    xbox: { north: txt(0, 0, 'Y', 14), east: txt(0, 0, 'B', 14), south: txt(0, 0, 'A', 14), west: txt(0, 0, 'X', 14) },
    ps: {
      north: '<path class="glyph" d="M0 -6 L6 4 L-6 4 Z"/>', east: '<circle class="glyph" r="5.5"/>',
      south: '<path class="glyph" d="M-5 -5 L5 5 M5 -5 L-5 5"/>', west: '<rect class="glyph" x="-5" y="-5" width="10" height="10"/>',
    },
  };
  for (const [id, [dx, dy]] of Object.entries(face)) {
    hit(id, `<circle cx="${fx + dx}" cy="${fy + dy}" r="12"/>`, `<g transform="translate(${fx + dx} ${fy + dy})">${glyph[ps ? 'ps' : 'xbox'][id]}</g>`);
  }

  // back / start
  hit('back', `<rect x="${L.back[0] - 11}" y="${L.back[1] - 7}" width="22" height="14" rx="7"/>`);
  hit('start', `<rect x="${L.start[0] - 11}" y="${L.start[1] - 7}" width="22" height="14" rx="7"/>`);

  // d-pad: four arms and four diagonal corners
  const [dx, dy] = L.dpad;
  const arm = { povUp: [-10, -32, 20, 22], povDown: [-10, 10, 20, 22], povLeft: [-32, -10, 22, 20], povRight: [10, -10, 22, 20] };
  parts.push(`<rect class="well" x="${dx - 34}" y="${dy - 34}" width="68" height="68" rx="16"/>`);
  for (const [id, [x, y, w, h]] of Object.entries(arm)) hit(id, `<rect x="${dx + x}" y="${dy + y}" width="${w}" height="${h}" rx="3"/>`);
  const diag = { povUpRight: [1, -1], povDownRight: [1, 1], povDownLeft: [-1, 1], povUpLeft: [-1, -1] };
  for (const [id, [sx, sy]] of Object.entries(diag)) hit(id, `<circle cx="${dx + sx * 21}" cy="${dy + sy * 21}" r="6.5"/>`);
  parts.push(`<rect class="hub" x="${dx - 10}" y="${dy - 10}" width="20" height="20"/>`);

  // sticks: centre is the click, the ring's four sectors are the axis directions
  const stick = (cx, cy, click, dirs) => {
    parts.push(`<circle class="well" cx="${cx}" cy="${cy}" r="31"/>`);
    const R = 28, r = 14;
    const sector = (a0, a1) => {
      const p = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`;
      return `<path d="M${p(R, a0)} A${R} ${R} 0 0 1 ${p(R, a1)} L${p(r, a1)} A${r} ${r} 0 0 0 ${p(r, a0)} Z"/>`;
    };
    const q = Math.PI / 4;
    const at = { [dirs[0]]: -2 * q, [dirs[3]]: 0, [dirs[1]]: 2 * q, [dirs[2]]: 4 * q };
    for (const [id, a] of Object.entries(at)) hit(id, sector(a - q + 0.06, a + q - 0.06), '');
    hit(click, `<circle cx="${cx}" cy="${cy}" r="12.5"/>`, txt(cx, cy, ps ? (click === 'ls' ? 'L3' : 'R3') : (click === 'ls' ? 'LS' : 'RS'), 10));
  };
  stick(...L.ls, 'ls', ['lsUp', 'lsDown', 'lsLeft', 'lsRight']);
  stick(...L.rs, 'rs', ['rsUp', 'rsDown', 'rsLeft', 'rsRight']);

  return `<svg class="pad" viewBox="0 0 420 270" role="group" aria-label="${esc(c.name)} controller">${parts.join('')}</svg>`;
}
