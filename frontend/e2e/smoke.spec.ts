import { expect, test } from '@playwright/test'
import { mockStoreInfo } from './support/store-info.ts'

test.beforeEach(async ({ page }) => {
  await mockStoreInfo(page)
})

test('the root opens with the title, the main region and the h1', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Pastelería Ilusión')
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Pastelería Ilusión' })).toBeVisible()
})
