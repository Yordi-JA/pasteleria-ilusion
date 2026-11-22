import { TIER_EDGE_UNITS } from '../models/cakeDesignLayout.ts'
import { BOARD } from './cakeMetrics.ts'
import type { CakeDetails, CakeShape, CakeTier, ShapeColor, ShellPlace, SideBitsKind } from './cakeShape.ts'
import type { Placement, TierDecoration } from './decorationLayout.ts'
import { MeshBuilder } from './fruit.ts'
import type { FruitDividers, FruitMesh, KeepOut } from './fruit.ts'
import { resolveColor } from './palette.ts'
import { seededRandom } from './seededRandom.ts'

/**
 * Los detalles de las fotos de la pastelería que "Diseña tu pastel" no ofrece (tanda 4b), sin React ni three: dónde va cada pieza
 * y sus mallas, con los colores de la comida en cada vértice. Solo los usan las imágenes fijas del catálogo
 * (`/muestra/modelo/:slug`), en el último piso de un pastel redondo. Todo va en coordenadas del piso (origen en el centro de su base,
 * `y` hacia arriba), con semillas fijas: la misma muestra da siempre la misma imagen. Se arma una vez por forma; nada por cuadro.
 * `SampleDetails.tsx` lo dibuja.
 *
 * Las medidas son de las fotos (análisis del 18 de noviembre de 2026, `muestras.md`) en unidades de escena: el pastel de vitrina
 * mide 1.9 de diámetro y 0.46 de alto.
 */

type Vec3 = [number, number, number]
type RGB = [number, number, number]
const EDGE = TIER_EDGE_UNITS
const TAU = Math.PI * 2

/** Lo que se aparta la tapa de la cobertura para no parpadear con ella. */
const LIFT = 0.003

const rgbOf = (color: ShapeColor): RGB => {
  const hex = resolveColor(color)
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB
}
const scaleRgb = (c: RGB, k: number): RGB => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** La altura de la cobertura a la distancia `r` del centro: la tapa plana y, cerca de la orilla, el canto redondeado. */
export function surfaceHeight(radius: number, height: number, r: number): number {
  const into = r - (radius - EDGE)
  if (into <= 0) return height
  return height - EDGE + Math.sqrt(Math.max(0, EDGE * EDGE - Math.min(into, EDGE) ** 2))
}

// --- La charola ---

/**
 * El perfil de la charola para girarlo (`LatheGeometry`), con la cara de arriba en y = 0: del eje por abajo hasta la orilla, el
 * borde levantado y la cara de arriba de vuelta al eje. Es cartón negro con el borde enrollado, como en las 8 fotos.
 */
export function boardProfile(radius: number): [number, number][] {
  const t = BOARD.thickness
  const rim = BOARD.rim
  return [
    [0, -t],
    [radius - 0.03, -t],
    [radius - 0.006, -t + 0.012],
    [radius + 0.004, 0],
    [radius + 0.006, rim * 0.6],
    [radius - 0.004, rim],
    [radius - 0.02, rim - 0.006],
    [radius - 0.032, rim * 0.35],
    [radius - 0.05, 0.002],
    [radius - 0.09, 0],
    [0, 0],
  ]
}

// --- La tapa, el anillo y la franja ---

/** El perfil de la tapa en otro color: el canto de arriba desde 36° y la cara plana hasta el eje, apenas por encima de la cobertura. */
export function topCapProfile(radius: number, height: number): [number, number][] {
  const points: [number, number][] = []
  const reach = EDGE + LIFT
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI / 5 + (i / 6) * (Math.PI / 2 - Math.PI / 5)
    points.push([radius - EDGE + reach * Math.cos(a), height - EDGE + reach * Math.sin(a)])
  }
  points.push([0, height + LIFT])
  return points
}

/**
 * El anillo de mermelada de la tapa (la foto de fresa): de la orilla hacia el centro `width` del radio, con la orilla de adentro
 * irregular, abombado en medio y más oscuro en sus orillas, donde la mermelada es delgada.
 */
export function ringMesh(radius: number, height: number, width: number, color: ShapeColor): FruitMesh {
  const base = rgbOf(color)
  const random = seededRandom(31)
  const mesh = new MeshBuilder()
  const columns = 180
  const rows = 7
  const outer = radius - EDGE * 0.3
  const inner = outer - width * radius
  const wobble = Array.from({ length: columns }, (_, j) => {
    const a = (j / columns) * TAU
    return 1 + 0.03 * Math.sin(5 * a + 1.3) + 0.018 * Math.sin(11 * a + 0.4) + (random() - 0.5) * 0.012
  })
  const points: Vec3[][] = []
  const colors: RGB[][] = []
  for (let i = 0; i <= rows; i++) {
    const t = i / rows
    points.push(
      wobble.map((w, j) => {
        const a = (j / columns) * TAU
        const r = inner * w + (outer - inner * w) * t
        const y = surfaceHeight(radius, height, r) + LIFT + 0.0015 + 0.012 * Math.sin(Math.PI * t) ** 0.6
        return [Math.sin(a) * r, y, Math.cos(a) * r]
      }),
    )
    colors.push(wobble.map(() => scaleRgb(base, 0.8 + 0.22 * Math.sin(Math.PI * t) + (random() - 0.5) * 0.06)))
  }
  mesh.grid(points, colors, true)
  return mesh.build()
}

/**
 * La franja de abajo del costado: alta, como glaseado pintado a brochazos diagonales (durazno), o baja, como crema que se derrama
 * en la charola (cajeta, flan y cajeta, choco vainilla). Va un poco por fuera de la cobertura.
 */
export function bandMesh(radius: number, tierHeight: number, height: number, color: ShapeColor): FruitMesh {
  const base = rgbOf(color)
  const random = seededRandom(47)
  const mesh = new MeshBuilder()
  const columns = 220
  const rows = 6
  const band = height * tierHeight
  const painted = height >= 0.25
  const top = Array.from({ length: columns }, (_, j) => {
    const a = (j / columns) * TAU
    const raw = painted
      ? band * (0.86 + 0.18 * Math.sin(11 * a + 0.3) + 0.1 * Math.sin(23 * a + 1.1) + 0.05 * Math.sin(41 * a))
      : band * (1 + 0.28 * Math.sin(9 * a + 0.5) + 0.16 * Math.sin(17 * a + 2) + (random() - 0.5) * 0.1)
    return Math.min(tierHeight - EDGE, Math.max(band * 0.4, raw))
  })
  const points: Vec3[][] = []
  const colors: RGB[][] = []
  // La primera fila se derrama sobre la charola; las demás suben pegadas al costado.
  const spill = painted ? 0.006 : 0.014
  for (let i = 0; i <= rows; i++) {
    const t = i / rows
    points.push(
      top.map((y, j) => {
        const a = (j / columns) * TAU
        const r = radius + 0.004 + (i === 0 ? spill : (painted ? 0.002 : 0.008) * (1 - t) ** 2)
        return [Math.sin(a) * r, i === 0 ? 0.002 : y * t, Math.cos(a) * r]
      }),
    )
    colors.push(
      top.map((_, j) => {
        const a = (j / columns) * TAU
        const streak = painted ? 0.93 + 0.07 * Math.sin(37 * a + t * 3) : 0.97 + 0.04 * Math.sin(13 * a)
        return scaleRgb(base, streak)
      }),
    )
  }
  mesh.grid(points, colors, true)
  return mesh.build()
}

// --- Conchas de chocolate ---

/** Una concha colocada: dónde se apoya, su giro, su inclinación y hacia dónde, su ancho y alto, su color y si es cuenco. */
export type ShellPlacement = {
  p: Vec3
  yaw: number
  tilt: number
  toward: [number, number]
  width: number
  height: number
  color: number
  bowl: boolean
  /** Tulipán cerrado y redondo arriba (capuchino); sin él, un huevo abierto con la orilla rota. */
  closed: boolean
  /**
   * Solo las conchas de `back` y `full`: qué parte de la vuelta tiene la pieza (menos de 1 es un pedazo curvo de cascarón, como los
   * rizos de choco-pingüino) y si el espolvoreado cae según la cara que de verdad mira hacia arriba (los huevos boca abajo).
   */
  arc?: number
  dustByNormal?: boolean
}

/**
 * Las medidas de las fotos: huevos y tulipanes de chocolate de unos 5 cm de ancho y 4.5 cm de alto en el borde, unos 13 alrededor
 * (choco vainilla, capuchino); cuencos de unos 4 cm en la tapa.
 */
const EDGE_SHELL = { width: 0.18, height: 0.3 }
const BOWL = { width: 0.15, height: 0.12 }
/**
 * Los huevos grandes de chocolate blanco de queso y zarzamora: unos 6 cm de ancho, cuatro en el arco que va del lado izquierdo, un
 * poco al frente, a la parte de atrás (`BACK_ARC`, en el ángulo de la orilla: 0 es el frente y π/2 la derecha; la imagen fija gira el
 * pastel -20°, así que el arco va 20° más a la derecha que en la foto), acostados hacia el centro con la boca rota hacia la fruta.
 */
const BACK_SHELL = { width: 0.21, height: 0.32, count: 4, ring: 0.62 }
const BACK_ARC = { from: -0.6, to: -2.9 }
/**
 * Choco-pingüino: huevos de chocolate de leche boca abajo (el domo arriba) y pedazos curvos de cascarón que cubren toda la tapa. Van
 * en capas: cada una reparte sus piezas al azar (con semilla) hasta `reach` del radio, sin que dos centros queden a menos de
 * `spacing`, y la de encima se levanta `lift` sobre la de abajo, como el montón de la foto.
 */
const FULL_SHELL = {
  width: 0.18,
  height: 0.29,
  layers: [
    { reach: 0.88, spacing: 0.2, lift: 0.02 },
    { reach: 0.66, spacing: 0.22, lift: 0.13 },
    { reach: 0.36, spacing: 0.22, lift: 0.23 },
  ],
  tries: 400,
  /** Uno de cada tres es un pedazo curvo de cascarón (un rizo), no un huevo. */
  curlEvery: 3,
}

/**
 * Dónde van las conchas: alrededor del borde, apenas inclinadas hacia afuera (capuchino, choco vainilla), o amontonadas en la mitad
 * de atrás de la tapa (queso y chocolate), en dos capas.
 */
export function shellLayout(tier: CakeTier, place: ShellPlace, colors: number, inset = 0): ShellPlacement[] {
  if (place === 'back') return backShells(tier, colors)
  if (place === 'full') return fullShells(tier, colors)
  const random = seededRandom(place === 'top' ? 73 : 71)
  const { radius, height } = tier
  if (place !== 'top') {
    const closed = place === 'tulips'
    const { width, height: tall } = EDGE_SHELL
    // `inset` (parte del radio) mete la vuelta hacia el centro, para que abrace la fruta como en las fotos.
    const ring = radius - width * 0.85 - inset * radius
    const count = Math.max(6, Math.round((TAU * ring) / (2 * width * 1.05)))
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * TAU
      const size = 0.92 + random() * 0.16
      return {
        p: [Math.sin(a) * ring, height - 0.01, Math.cos(a) * ring],
        yaw: random() * TAU,
        // Los tulipanes de capuchino se recargan hacia afuera más que los huevos.
        tilt: (closed ? 0.75 : 0.28) + random() * 0.14,
        toward: [Math.sin(a), Math.cos(a)],
        width: width * size,
        height: tall * size,
        color: i % colors,
        bowl: false,
        closed,
      }
    })
  }
  // Los cuencos de queso y chocolate: una vuelta alrededor del montón, metida `inset`, y una segunda capa amontonada atrás, como la foto.
  const ring = radius - EDGE - BOWL.width * 0.9 - inset * radius
  const count = Math.max(8, Math.round((TAU * ring) / (2 * BOWL.width * 0.92)))
  const placed: ShellPlacement[] = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * TAU + random() * 0.08
    const size = 0.9 + random() * 0.2
    return {
      p: [Math.sin(a) * ring, height, Math.cos(a) * ring],
      yaw: random() * TAU,
      tilt: 0.3 + random() * 0.25,
      toward: [Math.sin(a), Math.cos(a)],
      width: BOWL.width * size,
      height: BOWL.height * size,
      color: i % colors,
      bowl: true,
      closed: false,
    }
  })
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * (0.7 + (k / 4) * 0.6) + (random() - 0.5) * 0.1
    const r = ring - BOWL.width * 0.35
    placed.push({
      p: [Math.sin(a) * r, height + BOWL.height * 0.7, Math.cos(a) * r],
      yaw: random() * TAU,
      tilt: 0.55 + random() * 0.3,
      toward: [Math.sin(a), Math.cos(a)],
      width: BOWL.width * (0.9 + random() * 0.15),
      height: BOWL.height,
      color: (count + k) % colors,
      bowl: true,
      closed: false,
    })
  }
  return placed
}

/** Los huevos grandes de la mitad de atrás (queso y zarzamora), del más grande, al frente a la izquierda, al de atrás. */
function backShells(tier: CakeTier, colors: number): ShellPlacement[] {
  const random = seededRandom(79)
  const { radius, height } = tier
  return Array.from({ length: BACK_SHELL.count }, (_, i) => {
    const t = i / (BACK_SHELL.count - 1)
    const a = BACK_ARC.from + (BACK_ARC.to - BACK_ARC.from) * t + (random() - 0.5) * 0.12
    const ring = radius * (BACK_SHELL.ring + (random() - 0.5) * 0.06)
    const size = (1.08 - 0.22 * t) * (0.94 + random() * 0.12)
    return {
      p: [Math.sin(a) * ring, height - 0.02, Math.cos(a) * ring],
      yaw: random() * TAU,
      // Acostados hacia el centro: el fondo del huevo mira a la orilla y la boca, a la fruta.
      tilt: 0.95 + random() * 0.3,
      toward: [-Math.sin(a), -Math.cos(a)],
      width: BACK_SHELL.width * size,
      height: BACK_SHELL.height * size,
      color: i % colors,
      bowl: false,
      closed: false,
      dustByNormal: true,
    }
  })
}

/** Los huevos boca abajo y los rizos que cubren la tapa de choco-pingüino, capa por capa. */
function fullShells(tier: CakeTier, colors: number): ShellPlacement[] {
  const random = seededRandom(89)
  const { radius, height } = tier
  const placed: ShellPlacement[] = []
  for (const layer of FULL_SHELL.layers) {
    const centers: [number, number][] = []
    for (let attempt = 0; attempt < FULL_SHELL.tries; attempt++) {
      const a = random() * TAU
      const r = radius * layer.reach * Math.sqrt(random())
      const [x, z] = [Math.sin(a) * r, Math.cos(a) * r]
      if (centers.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < layer.spacing)) continue
      centers.push([x, z])
      const curl = placed.length % FULL_SHELL.curlEvery === FULL_SHELL.curlEvery - 1
      const size = 0.88 + random() * 0.24
      // Un vector hacia afuera con un poco de azar: los huevos se recargan unos en otros como en la foto.
      const out = a + (random() - 0.5) * 1.2
      placed.push({
        p: [x, height - 0.02 + layer.lift, z],
        yaw: random() * TAU,
        // Boca abajo, con el domo arriba y la boca rota hacia un lado; los rizos, casi de pie.
        tilt: curl ? 1.05 + random() * 0.4 : 2.05 + random() * 0.45,
        toward: [Math.sin(out), Math.cos(out)],
        width: FULL_SHELL.width * size * (curl ? 1.15 : 1),
        height: FULL_SHELL.height * size * (curl ? 0.85 : 1),
        color: placed.length % colors,
        bowl: false,
        closed: false,
        arc: curl ? 0.42 + random() * 0.15 : 1,
        dustByNormal: true,
      })
    }
  }
  return placed
}

/** Lo que la fruta deja libre por las conchas: un margen desde la orilla hasta la orilla de adentro de su vuelta. */
export function shellAvoid(tier: CakeTier, shells: readonly ShellPlacement[], place: ShellPlace = 'edge'): { inset: number; areas: KeepOut[] } {
  if (shells.length === 0) return { inset: 0, areas: [] }
  // Los huevos de la mitad de atrás no dan la vuelta: la fruta solo se aparta de cada uno.
  if (place === 'back') return { inset: 0, areas: shells.map((shell) => ({ kind: 'circle', x: shell.p[0], z: shell.p[2], r: shell.width * 1.05 })) }
  // Todas dan la vuelta (huevos, tulipanes o cuencos): la fruta se queda por dentro de la orilla de adentro de la vuelta.
  const inner = Math.min(...shells.map((s) => Math.hypot(s.p[0], s.p[2]) - s.width * 1.1))
  return { inset: tier.radius - inner, areas: [] }
}

/** Gira un punto de la pieza: primero sobre su eje (yaw), luego inclinado hacia `toward`, y lo lleva a su lugar. */
function place(local: Vec3, shell: Pick<ShellPlacement, 'p' | 'yaw' | 'tilt' | 'toward'>): Vec3 {
  const [x0, y0, z0] = local
  const [cy, sy] = [Math.cos(shell.yaw), Math.sin(shell.yaw)]
  let x = x0 * cy + z0 * sy
  let z = -x0 * sy + z0 * cy
  let y = y0
  // Inclinar: en el plano de `toward` y la vertical, la parte de arriba se va hacia `toward`.
  const [tx, tz] = shell.toward
  const along = x * tx + z * tz
  const [ct, st] = [Math.cos(shell.tilt), Math.sin(shell.tilt)]
  const newAlong = along * ct + y * st
  y = -along * st + y * ct
  x += (newAlong - along) * tx
  z += (newAlong - along) * tz
  return [x + shell.p[0], y + shell.p[1], z + shell.p[2]]
}

/**
 * Las conchas en una sola malla: cada una es un torno abierto (huevo o tulipán con la orilla en picos, o un cuenco) de 32 por 12,
 * con su color en cada vértice, más claro hacia la orilla. Con espolvoreado, las partes que miran hacia arriba llevan motas de canela
 * o de azúcar glass.
 */
export function shellsMesh(shells: readonly ShellPlacement[], colors: readonly ShapeColor[], dusting: ShapeColor | null): FruitMesh {
  const palette = colors.map(rgbOf)
  const dust = dusting ? rgbOf(dusting) : null
  const random = seededRandom(83)
  const mesh = new MeshBuilder()
  const columns = 32
  const rows = 12
  for (const shell of shells) {
    const base = palette[shell.color % palette.length] ?? [1, 1, 1]
    const tone = 0.9 + random() * 0.18
    const petals = shell.bowl ? 7 : shell.closed ? 3 : 5
    const jag = shell.bowl ? 0.12 : shell.closed ? 0.02 : 0.16
    const phase = random() * TAU
    const rim = Array.from(
      { length: columns },
      (_, j) => 1 - jag * (0.5 + 0.5 * Math.cos((petals * j * TAU) / columns + phase)) - random() * (shell.closed ? 0.01 : 0.06),
    )
    const profile = (t: number) =>
      shell.bowl
        ? shell.width * (0.3 + 0.7 * Math.sin((Math.PI / 2) * t) ** 0.55)
        : shell.width * Math.sin(Math.PI * (0.06 + (shell.closed ? 0.94 : 0.78) * t)) ** (shell.closed ? 0.55 : 0.7)
    // Un pedazo de cascarón (`arc` menor que 1) no cierra la vuelta: lleva una columna más y no se une la última con la primera.
    const arc = shell.arc ?? 1
    const whole = arc >= 1
    const span = whole ? columns : columns + 1
    const points: Vec3[][] = []
    const tones: RGB[][] = []
    for (let i = 1; i <= rows; i++) {
      const t = i / rows
      const row: Vec3[] = []
      const rowTones: RGB[] = []
      for (let j = 0; j < span; j++) {
        const a = (j / columns) * TAU * arc
        const tt = t * rim[j % columns]
        const r = profile(tt)
        const local: Vec3 = [Math.sin(a) * r, shell.height * tt, Math.cos(a) * r]
        row.push(place(local, shell))
        let color = scaleRgb(base, tone * (0.86 + 0.22 * tt))
        if (dust && shell.dustByNormal) {
          // La normal de afuera de la pared a esa altura, girada como la pieza: el azúcar glass cubre lo que mira hacia arriba, con
          // motas más finas hacia los lados, como en la foto de choco-pingüino.
          const climb = profile(Math.min(1, tt + 0.02)) - profile(Math.max(0, tt - 0.02))
          const normal = place([Math.sin(a) * shell.height * 0.04, -climb, Math.cos(a) * shell.height * 0.04], { ...shell, p: [0, 0, 0] })
          const up = normal[1] / (Math.hypot(...normal) || 1)
          const speck = random()
          // Un velo fino y apenas desparejo en todo lo que mira hacia arriba.
          color = mixRgb(color, dust, Math.min(0.32, Math.max(0, up - 0.15) * 0.4 * (0.6 + 0.8 * speck)))
        } else if (dust) {
          // Hacia arriba: la normal de afuera, inclinada como la concha, sube; las motas salen de un ruido fijo por vértice.
          const up = place([Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3], { ...shell, p: [0, 0, 0] })[1]
          const speck = random()
          // En los tulipanes, la canela es un polvo fino que cubre parejo lo de arriba; en los cuencos, el azúcar glass cae en motas.
          if (shell.closed) color = mixRgb(color, dust, Math.min(0.32, Math.max(0, (up - 0.55) * 0.8)) * (0.8 + speck * 0.4))
          else if ((up > 0.8 || tt > 0.88) && speck > 0.55) color = mixRgb(color, dust, 0.45 + speck * 0.4)
        }
        rowTones.push(color)
      }
      points.push(row)
      tones.push(rowTones)
    }
    const ids = mesh.grid(points, tones, whole)
    if (whole) mesh.fan(mesh.vertex(place([0, 0, 0], shell), scaleRgb(base, tone * 0.85)), ids[0].slice().reverse())
  }
  return mesh.build()
}

// --- Migas, virutas y espolvoreado ---

/** Un punto del costado: su lugar y la base del costado (afuera, a lo largo y arriba). */
function sidePoint(radius: number, a: number, y: number, out = 0) {
  const n: Vec3 = [Math.sin(a), 0, Math.cos(a)]
  return { p: [n[0] * (radius + out), y, n[2] * (radius + out)] as Vec3, n, t: [Math.cos(a), 0, -Math.sin(a)] as Vec3 }
}

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]

/** Una miga: un octaedro deforme con caras planas (cada cara con sus vértices), medio hundido en la crema. */
function crumb(mesh: MeshBuilder, center: Vec3, size: number, color: RGB, random: () => number) {
  const axes: Vec3[] = [
    [size * (0.8 + random() * 0.5), 0, 0],
    [0, size * (0.5 + random() * 0.5), 0],
    [0, 0, size * (0.7 + random() * 0.5)],
  ]
  const spin = random() * TAU
  const turn = (v: Vec3): Vec3 => [v[0] * Math.cos(spin) - v[2] * Math.sin(spin), v[1], v[0] * Math.sin(spin) + v[2] * Math.cos(spin)]
  const tips = [axes[0], axes[1], axes[2]].flatMap((v) => [turn(v), turn([-v[0], -v[1], -v[2]])])
  const [px, nx, py, ny, pz, nz] = tips
  const faces: [Vec3, Vec3, Vec3][] = [
    [px, py, pz], [pz, py, nx], [nx, py, nz], [nz, py, px],
    [pz, ny, px], [nx, ny, pz], [nz, ny, nx], [px, ny, nz],
  ]
  for (const [a, b, c] of faces) {
    const shade = scaleRgb(color, 0.85 + random() * 0.3)
    mesh.triangle(mesh.vertex(add(center, a), shade), mesh.vertex(add(center, b), shade), mesh.vertex(add(center, c), shade))
  }
}

/** Una viruta: una lámina curva de 4 por 3 vértices, casi pegada al costado y con una punta hacia afuera. */
function flake(mesh: MeshBuilder, at: ReturnType<typeof sidePoint>, size: number, color: RGB, random: () => number) {
  const length = size
  const width = size * (0.4 + random() * 0.3)
  const angle = random() * TAU
  const curl = (random() - 0.3) * 0.5 * size
  const out = 0.25 + random() * 0.8
  const up: Vec3 = [0, 1, 0]
  const ids: number[][] = []
  for (let i = 0; i < 4; i++) {
    const u = i / 3 - 0.5
    const row: number[] = []
    for (let j = 0; j < 3; j++) {
      const v = j / 2 - 0.5
      const a = u * length
      const b = v * width
      const along = a * Math.cos(angle) - b * Math.sin(angle)
      const high = a * Math.sin(angle) + b * Math.cos(angle)
      const lift = 0.002 + curl * 4 * u * u + out * Math.max(0, a)
      const p = add(add(add(at.p, at.t, along), up, high), at.n, lift)
      row.push(mesh.vertex(p, scaleRgb(color, 0.9 + 0.15 * (j === 1 ? 1 : 0) + (random() - 0.5) * 0.08)))
    }
    ids.push(row)
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) mesh.quad(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1])
}

/**
 * Una semilla de zarzamora en la mermelada del costado: un óvalo plano de seis lados, pegado a la superficie y apenas por fuera,
 * más oscuro al centro.
 */
function seed(mesh: MeshBuilder, at: ReturnType<typeof sidePoint>, size: number, color: RGB, random: () => number) {
  const turn = random() * TAU
  const long = size * (1.2 + random() * 0.5)
  const up: Vec3 = [0, 1, 0]
  const corner = (k: number) => {
    const a = (k / 6) * TAU
    const [u, v] = [Math.cos(a) * long, Math.sin(a) * size]
    return add(add(add(at.p, at.t, u * Math.cos(turn) - v * Math.sin(turn)), up, u * Math.sin(turn) + v * Math.cos(turn)), at.n, 0.0025)
  }
  const middle = mesh.vertex(add(at.p, at.n, 0.003), scaleRgb(color, 0.8))
  const ring = Array.from({ length: 6 }, (_, k) => mesh.vertex(corner(k), color))
  mesh.fan(middle, ring)
}

/**
 * Las virutas grandes y tupidas de choco-pingüino: casi el triple que las virutas de siempre y más grandes, por todo el costado,
 * algunas más oscuras y otras más claras, como el chocolate rallado de la foto.
 */
const SHAVINGS = { perArea: 800, size: [0.03, 0.09] as const }

/** Las semillas de la mermelada de zarzamora en el costado (queso y zarzamora): sueltas por todo el alto, sin juntarse. */
const SEEDS = { perArea: 150, size: [0.006, 0.012] as const, from: 0.12, to: 0.96 }

/**
 * Lo pegado al costado: migas de galleta de polvo a trozos de 1 cm por el costado y la tapa (galleta), virutas de chocolate por
 * el costado, más tupidas arriba y al pie (capuchino) o parejas (queso y chocolate), virutas grandes y tupidas (choco-pingüino) o las
 * semillas oscuras de la mermelada.
 */
export function sideBitsMesh(tier: CakeTier, kind: SideBitsKind, color: ShapeColor, topInset: number): FruitMesh {
  const base = rgbOf(color)
  const random = seededRandom({ crumbs: 97, flakes: 101, seeds: 103, shavings: 107 }[kind])
  const mesh = new MeshBuilder()
  const { radius, height } = tier
  const side = TAU * radius * height
  if (kind === 'shavings') {
    for (let i = 0, count = Math.round(side * SHAVINGS.perArea); i < count; i++) {
      const at = sidePoint(radius, random() * TAU, height * (0.04 + random() * 0.92))
      flake(mesh, at, SHAVINGS.size[0] + (SHAVINGS.size[1] - SHAVINGS.size[0]) * random() ** 2, scaleRgb(base, 0.8 + random() * 0.9), random)
    }
  } else if (kind === 'seeds') {
    for (let i = 0, count = Math.round(side * SEEDS.perArea); i < count; i++) {
      const at = sidePoint(radius, random() * TAU, height * (SEEDS.from + random() * (SEEDS.to - SEEDS.from)))
      seed(mesh, at, SEEDS.size[0] + random() * (SEEDS.size[1] - SEEDS.size[0]), scaleRgb(base, 0.8 + random() * 0.4), random)
    }
  } else if (kind === 'crumbs') {
    for (let i = 0, count = Math.round(side * 420); i < count; i++) {
      const y = EDGE * 0.4 + random() * (height - EDGE * 0.8)
      const at = sidePoint(radius, random() * TAU, y)
      const size = 0.005 + 0.03 * random() ** 3.5
      crumb(mesh, add(at.p, at.n, size * 0.25), size, scaleRgb(base, 0.75 + random() * 0.5), random)
    }
    const top = Math.PI * radius * radius
    const reach = radius - EDGE * 0.5 - topInset
    for (let i = 0, count = Math.round(top * 220); i < count; i++) {
      const a = random() * TAU
      const r = Math.sqrt(random()) * reach
      const size = 0.006 + 0.03 * random() ** 3
      crumb(mesh, [Math.sin(a) * r, surfaceHeight(radius, height, r) + size * 0.2, Math.cos(a) * r], size, scaleRgb(base, 0.75 + random() * 0.5), random)
    }
  } else {
    for (let i = 0, count = Math.round(side * 330); i < count; i++) {
      const pick = random()
      // Arriba y al pie, como en la foto de capuchino; la de queso y chocolate también va pareja por en medio.
      const y = pick < 0.55 ? height * (0.55 + random() * 0.4) : pick < 0.8 ? height * (0.05 + random() * 0.2) : height * (0.1 + random() * 0.8)
      const at = sidePoint(radius, random() * TAU, y)
      flake(mesh, at, 0.02 + 0.04 * random() ** 2, scaleRgb(base, 0.85 + random() * 0.3), random)
    }
  }
  return mesh.build()
}

/** El espolvoreado de la tapa: motas planas de 0.4 a 1 mm de lado, repartidas por toda la cara de arriba. */
export function dustMesh(tier: CakeTier, color: ShapeColor): FruitMesh {
  const base = rgbOf(color)
  const random = seededRandom(109)
  const mesh = new MeshBuilder()
  const { radius, height } = tier
  const reach = radius - EDGE * 0.6
  for (let i = 0; i < 3200; i++) {
    const a = random() * TAU
    const r = Math.sqrt(random()) * reach
    const size = 0.004 + random() * 0.006
    const spin = random() * TAU
    const [x, z] = [Math.sin(a) * r, Math.cos(a) * r]
    const y = surfaceHeight(radius, height, r) + LIFT + 0.0012
    const corner = (k: number): Vec3 => [x + Math.cos(spin + k * (Math.PI / 2)) * size, y, z + Math.sin(spin + k * (Math.PI / 2)) * size]
    const shade = scaleRgb(base, 0.8 + random() * 0.35)
    const ids = [0, 1, 2, 3].map((k) => mesh.vertex(corner(k), shade))
    mesh.quad(ids[0], ids[3], ids[2], ids[1])
  }
  return mesh.build()
}

// --- Hilos ---

/**
 * El encaje de chocolate sobre la tapa (la foto de durazno): dos vueltas dibujadas con manga, una de lazos cerca de la orilla y otra
 * de arcos más adentro. Cada una es una curva cerrada de puntos sobre la tapa.
 */
export function laceCurves(tier: CakeTier, lifted: boolean): Vec3[][] {
  const { radius, height } = tier
  const y = height + (lifted ? LIFT : 0) + 0.006
  const flat = radius - EDGE
  const loops: Vec3[] = []
  const r1 = flat * 0.84
  const a1 = 0.045
  const k1 = 30
  for (let i = 0, n = k1 * 24; i < n; i++) {
    const t = (i / n) * TAU
    const [dx, dz] = [Math.sin(t), Math.cos(t)]
    const along = r1 + a1 * Math.cos(k1 * t)
    const side = a1 * Math.sin(k1 * t)
    loops.push([dx * along + dz * side, y, dz * along - dx * side])
  }
  const arcs: Vec3[] = []
  const r2 = flat * 0.62
  const k2 = 18
  for (let i = 0, n = k2 * 20; i < n; i++) {
    const t = (i / n) * TAU
    const r = r2 + 0.07 * Math.abs(Math.sin((k2 * t) / 2))
    arcs.push([Math.sin(t) * r, y, Math.cos(t) * r])
  }
  return [loops, arcs]
}

/**
 * Los hilos de cajeta sobre los copos del borde (la foto de cajeta): dos curvas que dan la vuelta zigzagueando sobre los rosetones
 * ya colocados, montadas en cada uno y apoyadas en la tapa entre ellos. Sin rosetones, ninguna.
 */
export function threadCurves(tier: CakeTier, decoration: TierDecoration | undefined): Vec3[][] {
  const rosettes = decoration?.parts.find((part) => part.shape === 'rosette')?.placements ?? []
  if (rosettes.length === 0) return []
  const { height } = tier
  const random = seededRandom(59)
  // La roseta de `Decoration.tsx`: radio 0.1 y alto 0.075 con escala 1; su radio baja como 1 − t^1.6 y su alto sube como sen(t·π/2)^0.8.
  const dome = (x: number, z: number) => {
    let best = 0
    for (const r of rosettes) {
      const rho = 0.1 * r.s[0]
      const d = Math.hypot(x - r.p[0], z - r.p[2])
      if (d >= rho) continue
      const t = (1 - d / rho) ** (1 / 1.6)
      best = Math.max(best, r.p[1] - height + 0.075 * r.s[1] * Math.sin((t * Math.PI) / 2) ** 0.8)
    }
    return best
  }
  // Como en la foto: tres hilos paralelos que cruzan cada copo en diagonal respecto a la orilla, montados en él.
  return rosettes.flatMap((rosette) => {
    const rho = 0.1 * rosette.s[0]
    const turn = Math.atan2(rosette.p[2], rosette.p[0]) + Math.PI / 2 + 0.6 + (random() - 0.5) * 0.2
    const [c, s] = [Math.cos(turn), Math.sin(turn)]
    return [-0.42, 0, 0.42].map((offset) => {
      const across = offset * rho
      const half = Math.sqrt(Math.max(0, rho * rho - across * across)) * 0.95
      const points: Vec3[] = []
      for (let i = 0, n = 16; i <= n; i++) {
        const along = -half + (2 * half * i) / n
        const [x, z] = [rosette.p[0] + along * c - across * s, rosette.p[2] + along * s + across * c]
        points.push([x, height + dome(x, z) + 0.009, z])
      }
      return points
    })
  })
}

/**
 * El arco de la orilla donde va el garabato de queso y zarzamora (en el ángulo de la orilla: 0 es el frente, π/2 la derecha): el lado
 * izquierdo, de atrás hacia el frente, 20° más a la derecha que en la foto porque la imagen fija gira el pastel -20°. Ahí no van
 * rosetones, como en la foto.
 */
export const SCRIBBLE_ARC = { from: -2.45, to: -0.2 }

/**
 * El garabato de hilos de queso y zarzamora: dos trazos de lazos que avanzan por el arco `SCRIBBLE_ARC`, uno junto a la orilla y otro
 * más adentro, como la letra corrida que dibuja la manga. Cada lazo es una trocoide: avanza por la orilla y da una vuelta chica.
 */
export function scribbleCurves(tier: CakeTier, lifted: boolean): Vec3[][] {
  const { radius, height } = tier
  const y = height + (lifted ? LIFT : 0) + 0.006
  const flat = radius - EDGE
  const random = seededRandom(61)
  // Tres trazos que se cruzan: lazos de tamaño y paso desparejos y un vaivén hacia adentro y hacia afuera, como el de la foto.
  const strands = [
    { mid: 0.82, loops: 13, loop: 0.04, wave: 0.07 },
    { mid: 0.7, loops: 10, loop: 0.055, wave: 0.09 },
    { mid: 0.76, loops: 7, loop: 0.03, wave: 0.12 },
  ]
  return strands.map(({ mid, loops, loop, wave }) => {
    const points: Vec3[] = []
    const phases = Array.from({ length: 4 }, () => random() * TAU)
    const n = loops * 28
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const turn = loops * TAU * (t + 0.035 * Math.sin(t * 23 + phases[0])) + phases[1]
      const size = loop * (0.55 + 0.55 * (0.5 + 0.5 * Math.sin(t * 11.7 + phases[2])))
      const base = SCRIBBLE_ARC.from + (SCRIBBLE_ARC.to - SCRIBBLE_ARC.from) * t
      const sway = wave * (0.65 * Math.sin(t * 7.1 + phases[3]) + 0.35 * Math.sin(t * 17.3 + phases[0]))
      const r = Math.min(flat - 0.014, Math.max(flat * 0.5, flat * mid + sway - size * Math.cos(turn)))
      const a = base + (size * Math.sin(turn) * 1.4) / r
      points.push([Math.sin(a) * r, y, Math.cos(a) * r])
    }
    return points
  })
}

/** Un arco de la orilla sin rosetones, en el ángulo de la orilla (0 es el frente, π/2 la derecha), de `from` a `to`. */
export type EdgeGap = { from: number; to: number }

/**
 * El arco sin rosetones: el del garabato y, con los huevos grandes de la mitad de atrás, todo el lado de atrás e izquierdo hasta el
 * primer huevo (en la foto de queso y zarzamora los rosetones solo van por el frente y la derecha, alrededor de la fruta). Los dos se
 * enciman, así que su unión es un solo arco.
 */
function edgeGapOf(details: CakeDetails): EdgeGap | null {
  const gaps = [details.drizzle?.kind === 'scribble' ? SCRIBBLE_ARC : null, details.shells?.place === 'back' ? { from: -Math.PI, to: BACK_ARC.from } : null].filter(
    (gap): gap is EdgeGap => gap !== null,
  )
  if (gaps.length === 0) return null
  return { from: Math.min(...gaps.map((gap) => Math.min(gap.from, gap.to))), to: Math.max(...gaps.map((gap) => Math.max(gap.from, gap.to))) }
}

const inGap = (gap: EdgeGap, x: number, z: number) => {
  const a = Math.atan2(x, z)
  return a >= Math.min(gap.from, gap.to) && a <= Math.max(gap.from, gap.to)
}

/**
 * La decoración del último piso con lo que cambian las fotos: sin los rosetones del arco del garabato y con las hileras de rosetones
 * entre las franjas de fruta (`FruitDividers`), del mismo color que los del borde. Sin nada que cambiar, la misma decoración.
 */
export function sampleDecoration(decoration: TierDecoration, gap: EdgeGap | null, dividers: FruitDividers | undefined): TierDecoration {
  const extra = dividers?.p ?? []
  if (!gap && extra.length === 0) return decoration
  const random = seededRandom(113)
  const parts = decoration.parts.map((part) => {
    if (part.shape !== 'rosette') return part
    const kept = gap ? part.placements.filter((placement) => !inGap(gap, placement.p[0], placement.p[2])) : part.placements
    const scale = dividers?.scale ?? 1
    const added = extra.map(
      (p): Placement => ({ p: [p[0], p[1] - 0.005, p[2]], dir: [0, 0, 1], roll: 0, s: [scale, scale, scale], color: 0, tint: (random() - 0.5) * 0.08 }),
    )
    return { ...part, placements: [...kept, ...added] }
  })
  return { ...decoration, parts }
}

// --- Todo junto ---

export type SampleDetailsLayout = {
  cap: { profile: [number, number][]; color: ShapeColor; glossy: boolean } | null
  ring: FruitMesh | null
  band: FruitMesh | null
  shells: { placements: ShellPlacement[]; mesh: FruitMesh } | null
  bits: { kind: SideBitsKind; mesh: FruitMesh } | null
  dust: FruitMesh | null
  /** Las curvas del encaje son cerradas; los hilos de cada copo y el garabato, abiertos. */
  drizzle: { kind: 'lace' | 'threads' | 'scribble'; color: ShapeColor; curves: Vec3[][]; closed: boolean } | null
  /** Lo que la fruta deja libre por las conchas (`fruitLayout`). */
  avoid: { inset: number; areas: KeepOut[] }
  /** El arco de la orilla sin rosetones (el del garabato o el de los huevos de atrás); `null` si no lo hay. Lo aplica `sampleDecoration`. */
  edgeGap: EdgeGap | null
  triangles: number
}

const trianglesOf = (mesh: FruitMesh | null) => (mesh ? mesh.indices.length / 3 : 0)

/**
 * Los detalles del último piso de `shape`, o `null` si no los lleva (o no es redondo: las muestras son pasteles de vitrina).
 * `decoration` es la decoración ya colocada de ese piso, para los hilos sobre los rosetones.
 */
export function sampleDetailsLayout(shape: CakeShape, decoration?: TierDecoration): SampleDetailsLayout | null {
  const details: CakeDetails | undefined = shape.details
  const tier = shape.tiers[shape.tiers.length - 1]
  if (!details || !tier || (shape.form ?? 'round') !== 'round' || !tier.frosting) return null
  const { radius, height } = tier
  const cap = details.top ? { profile: topCapProfile(radius, height), color: details.top.color, glossy: details.top.glossy } : null
  const shellPlacements = details.shells ? shellLayout(tier, details.shells.place, details.shells.colors.length, details.shells.inset ?? 0) : []
  const shellsAvoid = shellAvoid(tier, shellPlacements, details.shells?.place)
  const ringInset = details.ring ? details.ring.width * radius * 0.3 : 0
  const avoid = { inset: Math.max(shellsAvoid.inset, ringInset), areas: shellsAvoid.areas }
  const shells = details.shells ? { placements: shellPlacements, mesh: shellsMesh(shellPlacements, details.shells.colors, details.dusting ?? null) } : null
  const ring = details.ring ? ringMesh(radius, height, details.ring.width, details.ring.color) : null
  const band = details.band ? bandMesh(radius, height, details.band.height, details.band.color) : null
  const bits = details.sideBits ? { kind: details.sideBits.kind, mesh: sideBitsMesh(tier, details.sideBits.kind, details.sideBits.color, avoid.inset) } : null
  // El espolvoreado de la tapa solo donde la tapa se ve: con las conchas amontonadas o cubriéndola, cae solo en ellas.
  const coveredTop = details.shells && (['top', 'back', 'full'] as const).some((place) => place === details.shells?.place)
  const dust = details.dusting && !coveredTop ? dustMesh(tier, details.dusting) : null
  const drizzleCurves = { lace: () => laceCurves(tier, cap !== null), threads: () => threadCurves(tier, decoration), scribble: () => scribbleCurves(tier, cap !== null) }
  const curves = details.drizzle ? drizzleCurves[details.drizzle.kind]() : []
  const drizzle =
    details.drizzle && curves.length > 0 ? { kind: details.drizzle.kind, color: details.drizzle.color, curves, closed: details.drizzle.kind === 'lace' } : null
  const edgeGap = edgeGapOf(details)
  const triangles = [ring, band, shells?.mesh ?? null, bits?.mesh ?? null, dust].reduce((sum, mesh) => sum + trianglesOf(mesh), 0)
  return { cap, ring, band, shells, bits, dust, drizzle, avoid, edgeGap, triangles }
}
