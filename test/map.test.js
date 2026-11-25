// The controller map's layout: every callout fits, none overlaps another, and its leader starts on its input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutMap, mapSvg } from '../src/ui/pad.js';
import { INPUTS, inputLabel } from '../src/core/model.js';

const line = (n) => Array.from({ length: n }, (_, i) => ({ verb: 'Press', text: `Command ${i + 1}`, note: '' }));
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const type of ['xbox', 'ps4', 'ps5']) {
  test(`${type}: every input bound, callouts stay apart and inside the map`, () => {
    const lines = new Map(INPUTS.map((d, i) => [d.id, line(1 + (i % 3))]));
    const L = layoutMap(type, lines, (id) => inputLabel(type, id));
    const shown = L.callouts.flatMap((k) => k.rows.map((r) => r.input));
    assert.deepEqual(shown.sort(), INPUTS.map((d) => d.id).sort(), 'every bound input is called out once');
    for (const k of L.callouts) {
      assert.ok(k.x >= 0 && k.y >= 0 && k.x + k.w <= L.width && k.y + k.h <= L.height, `${k.id} fits in the map`);
      assert.match(k.path, /^M[\d. ]+( L[\d. ]+)+$/, `${k.id} has a leader`);
    }
    for (let i = 0; i < L.callouts.length; i++) {
      for (let j = i + 1; j < L.callouts.length; j++) {
        assert.ok(!overlap(L.callouts[i], L.callouts[j]), `${L.callouts[i].id} and ${L.callouts[j].id} don't overlap`);
      }
    }
  });
}

test('each side keeps its clusters in drawing order, so leader lines never cross', () => {
  const lines = new Map(INPUTS.map((d) => [d.id, line(1)]));
  const L = layoutMap('xbox', lines, (id) => inputLabel('xbox', id));
  for (const side of ['l', 'r']) {
    const ks = L.callouts.filter((k) => k.side === side);
    const byAnchor = [...ks].sort((a, b) => a.ay - b.ay).map((k) => k.id);
    const byLabel = [...ks].sort((a, b) => a.y - b.y).map((k) => k.id);
    assert.deepEqual(byLabel, byAnchor);
  }
  assert.deepEqual(L.callouts.filter((k) => k.side === 'l').map((k) => k.id).sort(), ['dpad', 'lb', 'ls', 'lt']);
  assert.deepEqual(L.callouts.filter((k) => k.side === 'r').map((k) => k.id).sort(), ['face', 'rb', 'rs', 'rt']);
});

test('the map escapes names and command text, and names a cluster once', () => {
  const svg = mapSvg({ id: 'driver', name: 'Driver <b>', type: 'xbox' }, new Map(), null,
    new Map([['povUp', [{ verb: 'Hold', text: '<img src=x onerror=alert(1)>', note: '' }]]]));
  assert.doesNotMatch(svg, /<img/);
  assert.match(svg, /&lt;img/);
  assert.match(svg, /<p class="ch">D-pad<\/p>/);
  assert.match(svg, /<b>Up<\/b>/);
  assert.match(svg, /data-crop="[\d. ]+"/);
});
