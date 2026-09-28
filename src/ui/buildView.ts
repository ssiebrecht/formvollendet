import { hex } from '../content/palette.ts';
import { PLAYER } from '../content/tuning.ts';
import { vertexAngle } from '../sim/math/geometry.ts';
import type { Player } from '../sim/world.ts';
import { shapePaths, svg } from './dom.ts';

/** Signature of everything the build picture shows; redraw only when it changes. */
export function buildSignature(p: Player): string {
  let s = `${p.vertices}|`;
  for (let i = 0; i < p.vertices; i++) {
    const wpn = p.weapons[i];
    const ax = p.axioms[i];
    s += `${wpn ? `${wpn.def.id}${wpn.level}` : '-'},${ax ? `${ax.def.id}${ax.level}` : '-'};`;
  }
  return s;
}

/**
 * The build as a polygon: weapon glyphs on the vertices, axiom colours and symbols on the edges. Missing
 * vertices up to the hexagon show as a faint dashed outline – the form still to be reached.
 */
export function buildSvg(p: Player, size: number): SVGSVGElement {
  const c = size / 2;
  const R = size * 0.34;
  const root = svg('svg', {
    viewBox: `0 0 ${size} ${size}`,
    width: size,
    height: size,
    class: 'build-svg',
  });
  const n = p.vertices;
  const color = p.char.color;

  if (n < PLAYER.maxVertices) {
    const pts: string[] = [];
    for (let i = 0; i < PLAYER.maxVertices; i++) {
      const a = vertexAngle(i, PLAYER.maxVertices, 0);
      pts.push(`${(c + Math.cos(a) * R).toFixed(1)},${(c + Math.sin(a) * R).toFixed(1)}`);
    }
    root.append(
      svg('polygon', {
        points: pts.join(' '),
        fill: 'none',
        stroke: hex(color),
        'stroke-opacity': 0.12,
        'stroke-dasharray': '3 4',
        'stroke-width': 1.5,
      }),
    );
  }

  const vx: number[] = [];
  const vy: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = vertexAngle(i, n, 0);
    vx.push(c + Math.cos(a) * R);
    vy.push(c + Math.sin(a) * R);
  }
  const fill = svg('polygon', {
    points: vx.map((x, i) => `${x.toFixed(1)},${vy[i]!.toFixed(1)}`).join(' '),
    fill: hex(color),
    'fill-opacity': 0.08,
    stroke: 'none',
  });
  root.append(fill);

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p.axioms[i];
    root.append(
      svg('line', {
        x1: vx[i]!.toFixed(1),
        y1: vy[i]!.toFixed(1),
        x2: vx[j]!.toFixed(1),
        y2: vy[j]!.toFixed(1),
        stroke: hex(ax ? ax.def.color : color),
        'stroke-opacity': ax ? 1 : 0.3,
        'stroke-width': ax ? 3.5 : 2,
        'stroke-linecap': 'round',
        class: ax ? 'edge lit' : 'edge',
      }),
    );
  }

  const glyph = size * 0.085;
  const edgeGlyph = size * 0.055;
  for (let i = 0; i < n; i++) {
    const ax = p.axioms[i];
    if (!ax) continue;
    const j = (i + 1) % n;
    const x = (vx[i]! + vx[j]!) / 2;
    const y = (vy[i]! + vy[j]!) / 2;
    root.append(
      svg('circle', { cx: x, cy: y, r: edgeGlyph + 2.5, fill: '#07080d', stroke: 'none' }),
    );
    shapePaths(root, ax.def.icon, x, y, edgeGlyph, ax.def.color, 1.3);
  }
  for (let i = 0; i < n; i++) {
    const slot = p.weapons[i];
    const x = vx[i]!;
    const y = vy[i]!;
    root.append(svg('circle', { cx: x, cy: y, r: glyph + 3, fill: '#07080d', stroke: 'none' }));
    if (slot) {
      if (slot.def.theoremOf) {
        root.append(
          svg('circle', {
            cx: x,
            cy: y,
            r: glyph + 5,
            fill: 'none',
            stroke: '#ffd23f',
            'stroke-width': 1.5,
          }),
        );
      }
      shapePaths(root, slot.def.icon, x, y, glyph, slot.def.color, 1.6);
    } else {
      root.append(svg('circle', { cx: x, cy: y, r: 2.5, fill: hex(color), 'fill-opacity': 0.4 }));
    }
  }
  root.append(svg('circle', { cx: c, cy: c, r: 2.5, fill: '#ffffff' }));
  return root;
}
