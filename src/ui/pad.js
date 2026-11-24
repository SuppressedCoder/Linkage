// The clickable controller pictures: one SVG per controller, every input a focusable hit area.
// Each controller type (Xbox, PS4, PS5) has its own outline and button positions, drawn from the
// real hardware as seen from the front. Bumpers and triggers are bands that follow the shoulder
// curve: the bumper sits on the body's edge, the trigger peeks out above it, as on the real thing.
import { inputLabel } from '../core/model.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const W = 420;
const H = 284;
const mx = ([x, y]) => [W - x, y];

/**
 * Per type: the left half of the outline as cubic segments from the top centre round to the bottom
 * centre (mirrored for the right), the shoulder curve the bumper and trigger follow, and where
 * each input sits.
 */
const TYPES = {
  xbox: {
    half: [
      [[210, 62], [186, 62], [160, 62], [140, 64]],
      [[140, 64], [106, 66], [74, 80], [62, 104]],
      [[62, 104], [44, 140], [38, 200], [56, 236]],
      [[56, 236], [66, 268], [100, 272], [112, 256]],
      [[112, 256], [126, 236], [142, 218], [162, 216]],
      [[162, 216], [182, 214], [196, 214], [210, 214]],
    ],
    shoulder: [[160, 63], [110, 63], [76, 76], [61, 108]],
    bumper: [0.0, 0.92], trigger: [0.24, 0.66],
    ls: [134, 122], face: [288, 122], dpad: [172, 178], rs: [250, 178], back: [188, 116], start: [232, 116],
    deco: () => '<circle class="deco" cx="210" cy="90" r="12"/><rect class="deco" x="204" y="132" width="12" height="8" rx="3"/>',
  },
  ps4: {
    half: [
      [[210, 68], [184, 68], [164, 68], [146, 68]],
      [[146, 68], [108, 66], [76, 72], [66, 92]],
      [[66, 92], [52, 130], [36, 196], [48, 232]],
      [[48, 232], [54, 264], [88, 272], [98, 258]],
      [[98, 258], [112, 236], [134, 222], [158, 220]],
      [[158, 220], [180, 218], [196, 218], [210, 218]],
    ],
    shoulder: [[170, 67], [118, 66], [80, 70], [64, 98]],
    bumper: [0.0, 0.92], trigger: [0.24, 0.66],
    dpad: [122, 122], face: [298, 122], ls: [166, 182], rs: [254, 182], back: [158, 80], start: [262, 80],
    deco: () => '<rect class="deco" x="174" y="72" width="72" height="44" rx="5"/><circle class="deco" cx="210" cy="190" r="7"/>',
  },
  ps5: {
    half: [
      [[210, 62], [186, 62], [166, 62], [148, 62]],
      [[148, 62], [106, 64], [72, 76], [62, 100]],
      [[62, 100], [46, 142], [38, 206], [52, 236]],
      [[52, 236], [62, 272], [96, 278], [108, 262]],
      [[108, 262], [122, 242], [142, 224], [164, 222]],
      [[164, 222], [184, 220], [198, 220], [210, 220]],
    ],
    shoulder: [[176, 62], [120, 62], [78, 72], [61, 104]],
    bumper: [0.0, 0.92], trigger: [0.24, 0.66],
    dpad: [120, 124], face: [300, 124], ls: [166, 184], rs: [254, 184], back: [150, 76], start: [270, 76],
    deco: () => '<rect class="deco" x="162" y="66" width="96" height="56" rx="10"/><path class="deco" d="M158 72 Q154 98 164 126 M262 72 Q266 98 256 126"/><circle class="deco" cx="210" cy="186" r="7"/><rect class="deco" x="203" y="200" width="14" height="5" rx="2.5"/>',
  },
};

const f = (n) => n.toFixed(1);
const pt = ([x, y]) => `${f(x)} ${f(y)}`;

/** The full outline: left half, then the right half mirrored and reversed. */
function outline(half) {
  const segs = [...half, ...half.slice().reverse().map((s) => s.slice().reverse().map(mx))];
  return `M${pt(segs[0][0])}` + segs.map(([, a, b, c]) => `C${pt(a)} ${pt(b)} ${pt(c)}`).join('') + 'Z';
}

const at = ([p0, p1, p2, p3], t) => {
  const u = 1 - t;
  const P = (i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i];
  const D = (i) => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]);
  const dx = D(0), dy = D(1), len = Math.hypot(dx, dy) || 1;
  return { x: P(0), y: P(1), nx: -dy / len, ny: dx / len }; // n points away from the body
};

/**
 * A band along the shoulder curve between t0 and t1, from offset d0 (under the body) to d1
 * (outside it). Both ends are rounded; `taper` stretches the rounding at the outer end so the band
 * runs smoothly into the body.
 */
function band(curve, t0, t1, d0, d1, round = 0.1, taper = round) {
  const n = 32;
  const outer = [], inner = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const t = t0 + (t1 - t0) * u;
    const p = at(curve, t);
    const e = (k, w) => (k >= w ? 1 : Math.sqrt(1 - (1 - k / w) ** 2));
    const k = Math.min(e(u, round), e(1 - u, taper));
    const d = d0 + (d1 - d0) * k;
    outer.push([p.x + p.nx * d, p.y + p.ny * d]);
    inner.push([p.x + p.nx * d0, p.y + p.ny * d0]);
  }
  return [...outer, ...inner.reverse()];
}
const poly = (pts) => `M${pts.map(pt).join('L')}Z`;
const mid = (curve, t, d) => { const p = at(curve, t); return [p.x + p.nx * d, p.y + p.ny * d]; };

/**
 * @param c controller {id, name, type}
 * @param marks Map inputId -> 'bound' | 'other' (bound only in a mode not being shown)
 * @param sel selected input id or null
 */
export function padSvg(c, marks, sel) {
  const T = TYPES[c.type] || TYPES.xbox;
  const ps = c.type !== 'xbox';
  const parts = [];
  const cls = (id) => `in ${marks.get(id) || ''}${sel === id ? ' sel' : ''}`;
  const hit = (id, shape, label = '') => {
    const name = inputLabel(c.type, id);
    parts.push(`<g class="${cls(id)}" data-act="sel" data-ctrl="${esc(c.id)}" data-in="${id}" tabindex="0" role="button" aria-pressed="${sel === id}" aria-label="${esc(c.name)} ${esc(name)}"><title>${esc(name)}</title>${shape}${label}</g>`);
  };
  const txt = ([x, y], s, size = 13) => `<text x="${f(x)}" y="${f(y)}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${s}</text>`;

  // Triggers behind bumpers, bumpers behind the body.
  const S = T.shoulder;
  const trig = band(S, ...T.trigger, 9, 28, 0.16, 0.16);
  const bump = band(S, ...T.bumper, -6, 14, 0.12, 0.22);
  const tm = (T.trigger[0] + T.trigger[1]) / 2;
  const bm = T.bumper[0] + (T.bumper[1] - T.bumper[0]) * 0.36;
  hit('lt', `<path d="${poly(trig)}"/>`, txt(mid(S, tm, 21), ps ? 'L2' : 'LT', 10));
  hit('rt', `<path d="${poly(trig.map(mx))}"/>`, txt(mx(mid(S, tm, 21)), ps ? 'R2' : 'RT', 10));
  hit('lb', `<path d="${poly(bump)}"/>`, txt(mid(S, bm, 6.5), ps ? 'L1' : 'LB', 10));
  hit('rb', `<path d="${poly(bump.map(mx))}"/>`, txt(mx(mid(S, bm, 6.5)), ps ? 'R1' : 'RB', 10));
  parts.push(`<path class="body" d="${outline(T.half)}"/>`, T.deco());

  // face buttons
  const [fx, fy] = T.face;
  const face = { north: [0, -22], east: [22, 0], south: [0, 22], west: [-22, 0] };
  const glyph = {
    xbox: { north: 'Y', east: 'B', south: 'A', west: 'X' },
    ps: {
      north: '<path class="glyph" d="M0 -6 L6 4 L-6 4 Z"/>', east: '<circle class="glyph" r="5.5"/>',
      south: '<path class="glyph" d="M-5 -5 L5 5 M5 -5 L-5 5"/>', west: '<rect class="glyph" x="-5" y="-5" width="10" height="10"/>',
    },
  };
  for (const [id, [dx, dy]] of Object.entries(face)) {
    const g = ps ? glyph.ps[id] : txt([0, 0], glyph.xbox[id], 13);
    hit(id, `<circle cx="${fx + dx}" cy="${fy + dy}" r="10.5"/>`, `<g transform="translate(${fx + dx} ${fy + dy})">${g}</g>`);
  }

  // back / start (View / Menu, Share / Options, Create / Options)
  const pill = ([x, y], w = 20, h = 12) => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${h / 2}"/>`;
  hit('back', ps ? pill(T.back, 10, 18) : pill(T.back));
  hit('start', ps ? pill(T.start, 10, 18) : pill(T.start));

  // d-pad: four arms and four diagonal corners
  const [dx, dy] = T.dpad;
  const arm = { povUp: [-10, -32, 20, 22], povDown: [-10, 10, 20, 22], povLeft: [-32, -10, 22, 20], povRight: [10, -10, 22, 20] };
  parts.push(`<rect class="well" x="${dx - 35}" y="${dy - 35}" width="70" height="70" rx="${ps ? 35 : 16}"/>`);
  for (const [id, [x, y, w, h]] of Object.entries(arm)) hit(id, `<rect x="${dx + x}" y="${dy + y}" width="${w}" height="${h}" rx="3"/>`);
  const diag = { povUpRight: [1, -1], povDownRight: [1, 1], povDownLeft: [-1, 1], povUpLeft: [-1, -1] };
  for (const [id, [sx, sy]] of Object.entries(diag)) hit(id, `<circle cx="${dx + sx * 21}" cy="${dy + sy * 21}" r="6"/>`);
  parts.push(`<rect class="hub" x="${dx - 10}" y="${dy - 10}" width="20" height="20"/>`);

  // sticks: centre is the click, the ring's four sectors are the axis directions
  const stick = ([cx, cy], click, dirs) => {
    parts.push(`<circle class="well" cx="${cx}" cy="${cy}" r="31"/>`);
    const R = 28, r = 14;
    const sector = (a0, a1) => {
      const p = (rad, a) => `${f(cx + rad * Math.cos(a))} ${f(cy + rad * Math.sin(a))}`;
      return `<path d="M${p(R, a0)} A${R} ${R} 0 0 1 ${p(R, a1)} L${p(r, a1)} A${r} ${r} 0 0 0 ${p(r, a0)} Z"/>`;
    };
    const q = Math.PI / 4;
    const angle = { [dirs[0]]: -2 * q, [dirs[3]]: 0, [dirs[1]]: 2 * q, [dirs[2]]: 4 * q };
    for (const [id, a] of Object.entries(angle)) hit(id, sector(a - q + 0.06, a + q - 0.06), '');
    hit(click, `<circle cx="${cx}" cy="${cy}" r="12.5"/>`, txt([cx, cy], ps ? (click === 'ls' ? 'L3' : 'R3') : (click === 'ls' ? 'LS' : 'RS'), 10));
  };
  stick(T.ls, 'ls', ['lsUp', 'lsDown', 'lsLeft', 'lsRight']);
  stick(T.rs, 'rs', ['rsUp', 'rsDown', 'rsLeft', 'rsRight']);

  return `<svg class="pad" viewBox="0 20 ${W} ${H - 20}" role="group" aria-label="${esc(c.name)} controller">${parts.join('')}</svg>`;
}
