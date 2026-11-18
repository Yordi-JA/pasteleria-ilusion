/**
 * El relieve del mensaje sobre la tapa (tanda 4): que las letras se vean como betún de duya y no impresas. Se calcula una vez
 * por textura sobre los píxeles del lienzo (sin sombreador y sin costo por cuadro): el alfa de las letras, suavizado, es la
 * altura del cordón; de su pendiente sale la normal y, con la luz de la escena, el sombreado. Lo plano de arriba conserva el
 * color elegido; el canto que mira a la luz se aclara (con un brillo) y el otro se oscurece. Una sombra suave cae del lado
 * contrario. La forma de la tinta no cambia: donde la tinta es llena, el alfa se queda; sus bordes suaves se componen sobre
 * la sombra.
 *
 * El lienzo tiene la `x` a la derecha, la `y` hacia abajo (hacia el frente del pastel) y la `z` hacia la cámara.
 */

/** Hasta dónde baja el cordón desde su cresta, en cm de la tapa: unos 0.7 mm, como una duya delgada. */
export const RELIEF_RADIUS_CM = 0.07
/** Margen alrededor de la caja del texto para que la sombra no se corte, en cm. */
export const RELIEF_PAD_CM = 0.3

function normalize(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z)
  return [x / length, y / length, z / length]
}

// La luz direccional de la escena está en (-3, 5, 4): a la izquierda, arriba y al frente. En el lienzo: x = -3, y = 4, z = 5.
const LIGHT = normalize(-3, 4, 5)
const HALF = normalize(LIGHT[0], LIGHT[1], LIGHT[2] + 1)
const DIFFUSE = 0.6
/** Lo plano queda en 1: el color de la tinta tal cual. */
const AMBIENT = 1 - DIFFUSE * LIGHT[2]
/** Lo más oscuro del canto en sombra, para que la tinta siga siendo de su color. */
const MIN_SHADE = 0.62
/** Cuánto se acerca al blanco el canto iluminado (lo que pasa de 1); así también una tinta negra muestra el relieve. */
const LIFT = 1.5
const SPECULAR = 0.55
const SHININESS = 14
/** El brillo de lo plano, que se descuenta: arriba no hay destello. */
const FLAT_SPECULAR = HALF[2] ** SHININESS
/** Qué tanto se inclina el cordón por cada unidad de pendiente del alfa suavizado, por px de radio. */
const TILT_PER_RADIUS = 2.2
const SHADOW_ALPHA = 0.28

/** Promedio de caja de radio `radius` a lo largo de una fila o columna, con ceros fuera del lienzo. */
function boxBlur(source: Float32Array, width: number, height: number, radius: number, horizontal: boolean): Float32Array {
  const out = new Float32Array(source.length)
  const [lines, length] = horizontal ? [height, width] : [width, height]
  const index = (line: number, at: number) => (horizontal ? line * width + at : at * width + line)
  const size = radius * 2 + 1
  for (let line = 0; line < lines; line++) {
    let sum = 0
    for (let at = 0; at <= radius && at < length; at++) sum += source[index(line, at)]
    for (let at = 0; at < length; at++) {
      out[index(line, at)] = sum / size
      const enter = at + radius + 1
      const leave = at - radius
      if (enter < length) sum += source[index(line, enter)]
      if (leave >= 0) sum -= source[index(line, leave)]
    }
  }
  return out
}

/** Dos pasadas de caja en cada eje: casi una campana, en tiempo lineal. */
function smooth(source: Float32Array, width: number, height: number, radius: number): Float32Array {
  let field = source
  for (let pass = 0; pass < 2; pass++) {
    field = boxBlur(field, width, height, radius, true)
    field = boxBlur(field, width, height, radius, false)
  }
  return field
}

/** Aplica el relieve y la sombra a los píxeles de un lienzo con tinta sobre transparente. Cambia `image` en su lugar. */
export function pipeRelief(image: ImageData, radius: number): void {
  const { width, height, data } = image
  const r = Math.max(1, Math.round(radius))
  const alpha = new Float32Array(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3] / 255
  const ridge = smooth(alpha, width, height, r)
  const sample = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : ridge[y * width + x])
  const tilt = r * TILT_PER_RADIUS
  // La sombra cae lejos de la luz: a la derecha y hacia atrás (arriba en el lienzo).
  const shadowX = Math.round(r * 0.45)
  const shadowY = Math.round(r * 0.6)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const ink = alpha[i]
      const shadow = sample(x - shadowX, y + shadowY) * SHADOW_ALPHA
      const p = i * 4
      if (ink > 0) {
        // La normal del cordón, sin crear objetos: el lienzo puede tener un millón de píxeles.
        const gx = -(sample(x + 1, y) - sample(x - 1, y)) * 0.5 * tilt
        const gy = -(sample(x, y + 1) - sample(x, y - 1)) * 0.5 * tilt
        const length = Math.sqrt(gx * gx + gy * gy + 1)
        const [nx, ny, nz] = [gx / length, gy / length, 1 / length]
        const lambert = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2])
        const shade = Math.max(MIN_SHADE, AMBIENT + DIFFUSE * lambert)
        const facing = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2])
        const gloss = (SPECULAR * Math.max(0, facing ** SHININESS - FLAT_SPECULAR)) / (1 - FLAT_SPECULAR)
        const lift = Math.max(0, shade - 1) * LIFT
        // La tinta sobre su propia sombra (alfa no premultiplicado): solo cambia el color de los bordes suaves de las letras.
        const covered = ink + shadow * (1 - ink)
        for (let c = 0; c < 3; c++) {
          const lit = data[p + c] * Math.min(1, shade) + (255 - data[p + c]) * lift + 255 * gloss
          data[p + c] = Math.round((Math.min(255, lit) * ink) / covered)
        }
        // Donde la tinta es llena, el alfa no cambia: la forma de las letras es la misma que en el editor.
        if (ink < 1) data[p + 3] = Math.round(covered * 255)
      } else if (shadow > 0) {
        data[p] = 0
        data[p + 1] = 0
        data[p + 2] = 0
        data[p + 3] = Math.round(shadow * 255)
      }
    }
  }
}
