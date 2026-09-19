import { expect, test } from '@playwright/test'

test('Hospital SSO access method is not carried into Create account', async ({ page }) => {
  await page.goto('/#app')
  await page.getByRole('button', { name: 'Hospital SSO' }).click()
  await expect(page.getByText('This is the Hospital SSO route. It uses your organization identity provider to verify your hospital account securely.')).toBeVisible()
  await page.getByRole('tab', { name: 'Create account' }).click()
  await expect(page.getByText('This is the Hospital SSO route. It uses your organization identity provider to verify your hospital account securely.')).toHaveCount(0)
})

test('Arabic and English workspace labels switch together', async ({ page }) => {
  await page.goto('/#app')
  await page.getByRole('button', { name: 'Sign in to your workspace' }).last().click()
  await page.locator('.onboarding-screen, .app-shell').first().waitFor({ state: 'visible' })
  if (await page.locator('.onboarding-screen').isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: /Organization name|اسم المؤسسة/ }).fill('CityCare')
    await page.getByRole('button', { name: /Continue|متابعة/ }).click()
    await expect(page.locator('.onboarding-screen')).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Switch to Arabic' }).click()
  await expect(page.getByRole('button', { name: 'المساعدة' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'المساعد السريري' })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to English' }).click()
  await expect(page.getByRole('button', { name: 'Help' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clinical Assistant' })).toBeVisible()
})

test('workspace deep links keep the selected view after navigation', async ({ page }) => {
  await page.goto('/#app')
  await page.getByRole('button', { name: 'Sign in to your workspace' }).last().click()
  await page.locator('.onboarding-screen, .app-shell').first().waitFor({ state: 'visible' })
  if (await page.locator('.onboarding-screen').isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: /Organization name|اسم المؤسسة/ }).fill('CityCare')
    await page.getByRole('button', { name: /Continue|متابعة/ }).click()
    await expect(page.locator('.onboarding-screen')).toHaveCount(0)
  }
  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/patients')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.locator('.breadcrumb strong')).toContainText(/Patients|المرضى/)
})
