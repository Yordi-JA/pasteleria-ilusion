import { expect, test } from '@playwright/test'
import { mockStoreInfo } from './support/store-info.ts'

// No hay corredor de pruebas unitarias: el módulo se importa en el navegador desde el servidor de desarrollo.
const MODULE = '/src/models/apiClient.ts'

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
  await page.goto('/')
})

test('apiPath encodes each segment so a slug or an id cannot leave its route', async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const { apiPath } = await import(url)
    const resolve = (path: string) => new URL(`/api/v1/${path}`, 'http://localhost').pathname
    const encodedSlash = apiPath('products', '..%2F..%2Fadmin')
    return {
      plain: apiPath('store', 'info'),
      encodedSlash,
      encodedSlashResolved: resolve(encodedSlash),
      rawSlashResolved: resolve(apiPath('products', '../admin')),
      reserved: apiPath('notes', 'a b?c#d'),
    }
  }, MODULE)
  expect(result.plain).toBe('store/info/')
  expect(result.encodedSlash).toBe('products/..%252F..%252Fadmin/')
  expect(result.encodedSlashResolved).toBe('/api/v1/products/..%252F..%252Fadmin/')
  expect(result.rawSlashResolved).toBe('/api/v1/products/..%2Fadmin/')
  expect(result.reserved).toBe('notes/a%20b%3Fc%23d/')
})

test('apiPath rejects dot and empty segments, which the URL parser would collapse', async ({ page }) => {
  const outcomes = await page.evaluate(async (url) => {
    const { apiPath } = await import(url)
    return ['..', '.', '', '%2e%2e', '%2E'].map((segment) => {
      try {
        return `aceptado: ${apiPath('products', segment)}`
      } catch (error) {
        return (error as Error).name
      }
    })
  }, MODULE)
  // "%2e%2e" y "%2E" no colapsan: encodeURIComponent los vuelve "%252e%252e" y "%252E".
  expect(outcomes).toEqual(['RangeError', 'RangeError', 'RangeError', 'aceptado: products/%252e%252e/', 'aceptado: products/%252E/'])
})
