import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import Home from './views/Home.tsx'
import NotFound from './views/NotFound.tsx'

// La muestra de componentes solo existe en desarrollo: Vite reemplaza `import.meta.env.DEV` por `false` en el build y descarta la rama.
const ComponentSample = import.meta.env.DEV ? lazy(() => import('./views/ComponentSample.tsx')) : null

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {ComponentSample && (
        <Route
          path="/muestra"
          element={
            <Suspense fallback={null}>
              <ComponentSample />
            </Suspense>
          }
        />
      )}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
