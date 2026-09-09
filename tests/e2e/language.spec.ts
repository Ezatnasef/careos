import { expect, test } from '@playwright/test'

test('Arabic and English workspace labels switch together', async ({ page }) => {
  await page.goto('/#app')
  await page.getByRole('button', { name: 'Sign in to your workspace' }).last().click()
  if (await page.locator('.onboarding-screen').count()) {
    await page.getByRole('textbox', { name: /Organization name|اسم المؤسسة/ }).fill('CityCare')
    await page.getByRole('button', { name: /Continue|متابعة/ }).click()
    await page.getByRole('button', { name: /Continue|متابعة/ }).click()
    await page.getByRole('button', { name: /Open workspace|فتح مساحة العمل/ }).click()
  }
  await page.getByRole('button', { name: 'العربية' }).click()
  await expect(page.getByRole('button', { name: 'المساعدة' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'الفريق وسجل التدقيق' })).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('button', { name: 'Help' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Team & audit' })).toBeVisible()
})
