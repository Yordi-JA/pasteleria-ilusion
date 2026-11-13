import { expect, test } from '@playwright/test'
import { mockCakeDesignOptions } from './support/cake-design.ts'
import { durazno, mockProductDetails, mockProducts } from './support/products.ts'
import { mockStoreInfo } from './support/store-info.ts'

/**
 * Cada ruta de docs/mapa-de-vistas.md con su h1 tal como el mockup. Cuando el h1 es un dato que todavía no
 * existe, lleva el marcador de pendiente y la pestaña (`title`) usa el nombre de la vista, sin corchetes.
 */
const routes: { path: string; heading: string; title?: string }[] = [
  { path: '/catalogo', heading: 'Catálogo' },
  { path: '/vitrina', heading: 'Vitrina' },
  { path: '/rebanadas', heading: 'Rebanadas de hoy' },
  { path: '/pasteles/tres-leches-de-durazno', heading: 'Tres leches de durazno' },
  { path: '/bases', heading: 'Bases en préstamo' },
  { path: '/entrar', heading: 'Inicia sesión' },
  { path: '/registro', heading: 'Crea tu cuenta' },
  { path: '/recuperar', heading: 'Recupera tu contraseña' },
  { path: '/verificar', heading: 'Revisa tu correo' },
  { path: '/cuenta', heading: 'Hola, [nombre por confirmar]', title: 'Mis pedidos' },
  { path: '/cuenta/bases', heading: 'Hola, [nombre por confirmar]', title: 'Bases en préstamo' },
  { path: '/cuenta/datos', heading: 'Hola, [nombre por confirmar]', title: 'Datos y avisos' },
  { path: '/cuenta/pedidos/123', heading: 'Pedido #[número por confirmar]', title: 'Detalle de pedido' },
  { path: '/cuenta/cotizaciones/45', heading: 'Solicitud #[número por confirmar]', title: 'Cotización' },
  { path: '/carrito', heading: 'Tu carrito' },
  { path: '/pedido', heading: 'Realizar pedido' },
  { path: '/pedido/disena', heading: 'Diseña tu pastel' },
  { path: '/pedido/referencia', heading: 'Envía tu referencia' },
  { path: '/pedido/referencia/enviada', heading: 'Recibimos tu solicitud' },
  { path: '/pedido/entrega', heading: '¿Cómo recibes tu pedido?' },
  { path: '/pedido/pago', heading: 'Paga tu pedido' },
  { path: '/pedido/confirmacion', heading: 'Recibimos tu pedido' },
  { path: '/pedido/apartado', heading: 'Tu pedido está apartado' },
  { path: '/nota/abc123', heading: 'Verificación de nota' },
  { path: '/legal', heading: 'Aviso de privacidad y términos' },
]

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  // El catálogo y la ficha ya muestran datos (D59): se simulan para que el h1 de la ficha sea el del producto.
  await mockCakeDesignOptions(page)
  await mockProducts(page)
  await mockProductDetails(page, [durazno])
})

for (const { path, heading, title = heading } of routes) {
  test(`route ${path} shows its h1, its title and the site frame`, async ({ page }) => {
    await page.goto(path)
    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toHaveText(heading)
    await expect(h1).toHaveCount(1)
    await expect(h1.locator('[data-pendiente]')).toHaveCount(heading.includes('por confirmar') ? 1 : 0)
    await expect(page).toHaveTitle(`${title} · Pastelería Ilusión`)
    await expect(page).not.toHaveTitle(/\[|\]/)
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.locator('main#contenido')).toBeVisible()
    await expect(page.getByRole('contentinfo')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#contenido')
    // Vocabulario de la interfaz: nunca "cotizador", "bizcocho" ni "stand", y el 3D no se anuncia.
    await expect(page.locator('body')).not.toContainText(/cotizador|3D|bizcocho|stand/i)
  })
}

test('the root and the 404 keep their titles inside the frame', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Pastelería Ilusión')
  await expect(page.getByRole('banner')).toBeVisible()
  await page.goto('/no-existe')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('No encontramos esta página')
  await expect(page).toHaveTitle('No encontramos esta página · Pastelería Ilusión')
  await expect(page.getByRole('contentinfo')).toBeVisible()
})

test('legal: one page with the privacy and terms sections, text still pending', async ({ page }) => {
  await page.goto('/legal')
  const privacy = page.locator('section#privacidad')
  const terms = page.locator('section#terminos')
  await expect(privacy.getByRole('heading', { level: 2 })).toHaveText('Aviso de privacidad')
  await expect(terms.getByRole('heading', { level: 2 })).toHaveText('Términos y condiciones')
  for (const section of [privacy, terms]) {
    await expect(section.locator('[data-pendiente]')).toHaveText('[Texto por confirmar]')
  }
})

for (const path of ['/legal/algo', '/legal/aviso-de-privacidad']) {
  test(`legal: ${path} is not a page`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No encontramos esta página')
  })
}
