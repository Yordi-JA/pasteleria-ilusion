import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { DoubleSide, Vector2 } from 'three'
import { cupProfile, LATHE_SEGMENTS, lidProfile } from './dessertLayout.ts'
import type { ProfilePoint } from './dessertLayout.ts'
import { finishEnvironment } from './finish.ts'
import { brandColor } from './palette.ts'

/**
 * Las piezas que comparten los postres (D95): el torno que gira un perfil de `dessertLayout.ts` y el plástico transparente del vaso,
 * su tapa y el recipiente del flan.
 */

/** Un torno: el perfil (radio y altura en cm) girado alrededor del eje vertical, con el material que se le dé. */
export function Lathe({ profile, renderOrder, children }: { profile: readonly ProfilePoint[]; renderOrder?: number; children: ReactNode }) {
  const points = useMemo(() => profile.map(([r, y]) => new Vector2(r, y)), [profile])
  return (
    <mesh renderOrder={renderOrder}>
      <latheGeometry args={[points, LATHE_SEGMENTS]} />
      {children}
    </mesh>
  )
}

/**
 * El plástico transparente: casi invisible, con los reflejos del mismo entorno de la mermelada y la cajeta (`finishEnvironment`).
 * No escribe profundidad, así lo de adentro se ve completo; se dibuja después (`renderOrder`) de la comida.
 */
export function ClearPlastic({ opacity = 0.2 }: { opacity?: number }) {
  return (
    <meshStandardMaterial
      color={brandColor('betun')}
      transparent
      opacity={opacity}
      roughness={0.06}
      envMap={finishEnvironment()}
      envMapIntensity={1.4}
      depthWrite={false}
      side={DoubleSide}
    />
  )
}

const CUP = cupProfile()
const LID = lidProfile()

/**
 * El vaso estriado y su tapa, transparentes, que comparten los vasos de gelatina. El vaso casi no tiñe (con más plástico, los colores
 * de adentro se volvían grises) y la tapa se nota más: es más gruesa y la cruza la luz de arriba. Se dibujan después de la comida.
 */
export function CupShell() {
  return (
    <>
      <Lathe profile={CUP} renderOrder={2}>
        <ClearPlastic opacity={0.09} />
      </Lathe>
      <Lathe profile={LID} renderOrder={3}>
        <ClearPlastic opacity={0.42} />
      </Lathe>
    </>
  )
}
