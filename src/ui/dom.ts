import { hex } from '../content/palette.ts';
import { shapeToSvg } from '../content/shapes.ts';
import type { ShapeId } from '../content/types.ts';

type Child = Node | string | number | null | undefined | false;

/** Tiny DOM builder: `h('div', 'card selected', h('span', null, 'Text'))`. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  ...children: SVGElement[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}

/** Appends a content shape as SVG paths, centred on (cx, cy) with radius r. */
export function shapePaths(
  parent: SVGElement,
  id: ShapeId,
  cx: number,
  cy: number,
  r: number,
  color: number,
  width: number,
  rotation = 0,
): void {
  const g = svg(
    'g',
    rotation !== 0 ? { transform: `rotate(${(rotation * 180) / Math.PI} ${cx} ${cy})` } : {},
  );
  for (const p of shapeToSvg(id, r, cx, cy)) {
    g.append(
      svg('path', {
        d: p.d,
        fill: p.fill ? hex(color) : 'none',
        'fill-opacity': p.fill ? 0.85 : 0,
        stroke: hex(color),
        'stroke-width': width,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      }),
    );
  }
  parent.append(g);
}

/** Standalone glowing shape icon. */
export function shapeIcon(id: ShapeId, color: number, size = 32): SVGSVGElement {
  const s = svg('svg', {
    viewBox: '-16 -16 32 32',
    width: size,
    height: size,
    class: 'shape-icon',
  });
  shapePaths(s, id, 0, 0, 11, color, 2);
  s.style.filter = `drop-shadow(0 0 3px ${hex(color)})`;
  return s;
}

export function show(el: HTMLElement, visible: boolean): void {
  el.classList.toggle('hidden', !visible);
}

/** Restarts a CSS animation class. */
export function replay(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  // Forces a style/layout flush so the re-added class starts the animation again.
  el.getBoundingClientRect();
  el.classList.add(cls);
}

/** Sets text only when it changed (avoids layout work in the per-frame HUD). */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
