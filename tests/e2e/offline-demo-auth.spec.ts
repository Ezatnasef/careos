import { expect, test } from '@playwright/test'

test('demo login still opens the app without backend database', async ({ page }) => {
  await page.goto('/#app')

  await page.getByRole('button', { name: 'Switch to English' }).click()
  await page.getByRole('button', { name: 'Login as Doctor', exact: true }).click()

  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15000 })
  await expect(page).toHaveURL(/#app(?:\/(dashboard|portal|account))?$/)
})

test('demo login falls back to local preview when production disables the endpoint', async ({ page }) => {
  await page.route('**/api/v1/auth/demo-login', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"Demo login is disabled"}' }),
  )
  await page.route('**/api/v1/dashboard', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"Authentication required"}' }),
  )
  await page.goto('/#app')

  await page.getByRole('button', { name: 'Switch to English' }).click()
  await page.getByRole('button', { name: 'Login as Doctor', exact: true }).click()

  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15000 })
  await expect(page).toHaveURL(/#app(?:\/dashboard|\/patients)?$/)
  await expect(page.locator('.app-shell')).toContainText('Dr. Rana Samir')
  await expect(page.evaluate(() => localStorage.getItem('careos-demo-mode'))).resolves.toBe('true')
  await page.waitForTimeout(500)
  await expect(page.locator('.app-shell')).toBeVisible()
  await expect(page.evaluate(() => localStorage.getItem('careos-demo-mode'))).resolves.toBe('true')
})
