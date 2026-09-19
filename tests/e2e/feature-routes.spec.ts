import { expect, test, type Page } from '@playwright/test'

async function openWorkspace(page: Page) {
  await page.goto('/#app')
  await page.getByRole('button', { name: 'Sign in to your workspace' }).last().click()
  await page.locator('.onboarding-screen, .app-shell').first().waitFor({ state: 'visible' })
  if (await page.locator('.onboarding-screen').isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: /Organization name|اسم المؤسسة/ }).fill('CityCare')
    await page.getByRole('button', { name: /Continue|متابعة/ }).click()
    await expect(page.locator('.onboarding-screen')).toHaveCount(0)
  }
}

test('feature routes render after workspace navigation', async ({ page }) => {
  await openWorkspace(page)
  for (const [route, heading] of [
    ['documents', /DOCUMENTATION|Documentation|التوثيق/],
    ['appointments', /Appointments|المواعيد/],
    ['analytics', /Analytics|التحليلات/],
    ['messages', /Messages|الرسائل/],
  ] as const) {
    await page.evaluate((nextRoute) => {
      window.history.pushState({}, '', `#app/${nextRoute}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, route)
    await expect(page.locator('.breadcrumb strong')).toContainText(heading)
  }
})

test('feature controls are interactive', async ({ page }) => {
  await openWorkspace(page)

  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/patients')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.getByPlaceholder(/Search patients|البحث عن المرضى/).fill('Mariam')
  await expect(page.getByPlaceholder(/Search patients|البحث عن المرضى/)).toHaveValue('Mariam')

  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/appointments')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.getByRole('button', { name: /New appointment|موعد جديد/ }).click()
  await expect(page.locator('.modal')).toBeVisible()
  await page.locator('.modal .icon-btn').click()
  await expect(page.locator('.modal')).toHaveCount(0)

  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/documents')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.locator('input[type="file"]')).toHaveCount(1)
})
