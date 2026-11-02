import { Route, Routes } from 'react-router'
import Home from './views/Home.tsx'
import NotFound from './views/NotFound.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
