// The Bokka mark: a stacked, roped cargo pile in the sprite palette.
// Defined as pixel rects so one source renders everywhere — inline SVG in the
// pill / options / web header, and rasterized PNGs for the extension icons
// (see scripts/build-extension.mjs).

export const LOGO_SIZE = 14

// [x, y, w, h, color]
export type LogoRect = [number, number, number, number, string]

const ROPE = '#5e4326'

function crate(
  x: number,
  y: number,
  w: number,
  h: number,
  base: string,
  lt: string,
  dk: string,
  ropes: number[],
): LogoRect[] {
  const rects: LogoRect[] = [
    [x, y, w, h, base],
    [x, y, w, 1, lt],
    [x, y + h - 1, w, 1, dk],
    [x + w - 1, y, 1, h, dk],
  ]
  for (const r of ropes) rects.push([x + r, y, 1, h, ROPE])
  return rects
}

export const LOGO_RECTS: LogoRect[] = [
  ...crate(3, 9, 10, 5, '#b07f3d', '#d8a75c', '#6e4a1e', [2, 7]),
  ...crate(2, 5, 10, 4, '#5c7f4a', '#7fa267', '#38512f', [2, 7]),
  ...crate(4, 1, 8, 4, '#a04f45', '#c26f5d', '#6e2f2c', [3]),
]

// DOM-built variant for extension contexts, where innerHTML assignment
// trips AMO's linter
export function logoElement(px: number): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', String(px))
  svg.setAttribute('height', String(px))
  svg.setAttribute('viewBox', `0 0 ${LOGO_SIZE} ${LOGO_SIZE}`)
  svg.setAttribute('shape-rendering', 'crispEdges')
  svg.setAttribute('aria-hidden', 'true')
  for (const [x, y, w, h, c] of LOGO_RECTS) {
    const rect = document.createElementNS(NS, 'rect')
    rect.setAttribute('x', String(x))
    rect.setAttribute('y', String(y))
    rect.setAttribute('width', String(w))
    rect.setAttribute('height', String(h))
    rect.setAttribute('fill', c)
    svg.appendChild(rect)
  }
  return svg
}

export function logoSVG(px: number): string {
  const rects = LOGO_RECTS.map(
    ([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`,
  ).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" ` +
    `viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`
  )
}
