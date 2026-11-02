import { expect, test } from '@playwright/test'

test('an unknown route shows the h1 and a link back to the root', async ({ page }) => {
  await page.goto('/unknown-route')
  await expect(page.getByRole('heading', { level: 1, name: 'No encontramos esta página' })).toBeVisible()
  const homeLink = page.getByRole('link', { name: 'Ir a inicio' })
  await expect(homeLink).toHaveAttribute('href', '/')
  await homeLink.click()
  await expect(page).toHaveURL('/')
})
