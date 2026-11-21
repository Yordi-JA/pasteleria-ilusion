import { useEffect, useMemo } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, SRGBColorSpace } from 'three'
import type { FruitMesh } from './fruit.ts'

/**
 * Las mallas armadas sin three (`MeshBuilder` de `fruit.ts`) como geometría de three. La usan los detalles de las imágenes del
 * catálogo (`SampleDetails.tsx`) y los postres (D95); vive aparte para que los dos componentes la compartan.
 */

/** La geometría de three de una malla con colores por vértice (`sampleDetails.ts`, `dessertLayout.ts`), con los colores sRGB pasados a lineal; `uvTile` agrega coordenadas planas. */
function toGeometry(mesh: FruitMesh, uvTile?: number): BufferGeometry {
  const linear: number[] = []
  const color = new Color()
  for (let i = 0; i < mesh.colors.length; i += 3) {
    color.setRGB(mesh.colors[i], mesh.colors[i + 1], mesh.colors[i + 2], SRGBColorSpace)
    linear.push(color.r, color.g, color.b)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(mesh.normals, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(linear, 3))
  if (uvTile) {
    const uv: number[] = []
    for (let i = 0; i < mesh.positions.length; i += 3) uv.push(mesh.positions[i] / uvTile, mesh.positions[i + 2] / uvTile)
    geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  }
  geometry.setIndex(mesh.indices)
  return geometry
}

/** La geometría de una malla con colores por vértice, armada una vez y liberada al desmontar. */
export function useGeometry(mesh: FruitMesh | null, uvTile?: number): BufferGeometry | null {
  const geometry = useMemo(() => (mesh ? toGeometry(mesh, uvTile) : null), [mesh, uvTile])
  useEffect(() => () => geometry?.dispose(), [geometry])
  return geometry
}
