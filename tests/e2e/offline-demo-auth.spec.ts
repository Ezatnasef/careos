import { expect, test } from '@playwright/test'

test('demo login still opens the app without backend database', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/#app')

  await page.getByRole('button', { name: 'Switch to English' }).click()
  await page.getByRole('button', { name: 'Login as Doctor', exact: true }).click()

  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15000 })
  await expect(page).toHaveURL(/#app(?:\/(dashboard|portal|account))?$/)
})

test('offline demo session is upgraded when the API comes back', async ({ page }) => {
  let apiAvailable = false
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Offline"}' }),
  )
  await page.route('**/api/v1/auth/demo-login', async (route) => {
    if (!apiAvailable) {
      await route.abort()
      return
    }

    const user = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('careos-demo-user') || '{}'),
    )
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        demo_role: 'doctor',
        access_token: 'restored-session-token',
        token_type: 'bearer',
        user,
      }),
    })
  })

  await page.goto('http://127.0.0.1:5173/#app')
  await page.getByRole('button', { name: 'Switch to English' }).click()
  await page.getByRole('button', { name: 'Login as Doctor', exact: true }).click()
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15000 })
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('careos-demo-mode')))
    .toBe('true')

  apiAvailable = true
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('careos-access-token')))
    .toBe('restored-session-token')
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('careos-demo-mode')))
    .toBe('false')
})

test('mobile Arabic header controls keep their size and stay inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:5173/#app')
  await page.getByRole('button', { name: 'Switch to English' }).click()
  await page.getByRole('button', { name: 'Login as Doctor', exact: true }).click()
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Switch to Arabic' }).click()

  for (const viewportWidth of [390, 320]) {
    await page.setViewportSize({ width: viewportWidth, height: 844 })
    const controls = page.locator('.topbar .menu-btn, .topbar .top-actions button')
    await expect(controls).toHaveCount(6)
    const bounds = await controls.evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height, right, bottom } = element.getBoundingClientRect()
        return { x, y, width, height, right, bottom }
      }),
    )

    for (const control of bounds) {
      expect(control.width).toBeGreaterThanOrEqual(34)
      expect(control.height).toBeGreaterThanOrEqual(34)
      expect(control.x).toBeGreaterThanOrEqual(0)
      expect(control.right).toBeLessThanOrEqual(viewportWidth)
    }
    for (let index = 0; index < bounds.length; index += 1) {
      for (const other of bounds.slice(index + 1)) {
        const overlaps =
          bounds[index].x < other.right &&
          bounds[index].right > other.x &&
          bounds[index].y < other.bottom &&
          bounds[index].bottom > other.y
        expect(overlaps).toBe(false)
      }
    }
  }
})
