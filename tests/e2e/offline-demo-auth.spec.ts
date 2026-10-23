import { expect, test } from '@playwright/test'

test('demo login still opens the app without backend database', async ({ page }) => {
  await page.goto('/#app')

  await page.getByRole('button', { name: 'Switch to English' }).click()
  await page.getByRole('button', { name: 'Login as Doctor', exact: true }).click()

  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15000 })
  await expect(page).toHaveURL(/#app(?:\/(dashboard|portal|account))?$/)
})
