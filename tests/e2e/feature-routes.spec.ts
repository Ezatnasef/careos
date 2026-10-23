import { expect, test, type Page, type APIRequestContext } from '@playwright/test'

async function openWorkspace(page: Page, request: APIRequestContext, role = 'admin') {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const ownerEmail = `owner-${suffix}@example.org`
  const email = role === 'admin' ? ownerEmail : `member-${role}-${suffix}@example.org`
  const registration = await request.post('/api/v1/auth/register', { data: { email: ownerEmail, password: 'strong-password', full_name: 'E2E Owner', organization_name: 'E2E Care' } })
  expect(registration.ok()).toBeTruthy()
  let accessToken = (await registration.json()).access_token as string
  if (role !== 'admin') {
    const invitation = await request.post('/api/v1/team/invites', { headers: { Authorization: `Bearer ${accessToken}` }, data: { email, role } })
    expect(invitation.ok(), await invitation.text()).toBeTruthy()
    const invitationToken = (await invitation.json()).development_token as string
    const accepted = await request.post('/api/v1/auth/invitations/accept', { data: { token: invitationToken, full_name: `E2E ${role}`, password: 'strong-password' } })
    expect(accepted.ok()).toBeTruthy()
    accessToken = (await accepted.json()).access_token as string
  }
  await page.goto('/#app')
  await page.getByRole('button', { name: 'Switch to English' }).click()
  await page.getByRole('button', { name: /Sign in to your workspace|تسجيل الدخول إلى مساحة العمل/ }).last().click()
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill('strong-password')
  await page.getByRole('button', { name: /Sign in|تسجيل الدخول/ }).last().click()
  await page.locator('.onboarding-screen, .app-shell').first().waitFor({ state: 'visible' })
  if (await page.locator('.onboarding-screen').isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: /Organization name|اسم المؤسسة/ }).fill('CityCare')
    await page.getByRole('button', { name: /Continue|متابعة/ }).click()
    await expect(page.locator('.onboarding-screen')).toHaveCount(0)
  }
}

test('landing defaults to Arabic for the public voice assistant', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'رعاية تفكر معك.' })).toBeVisible()
})

test('public assistant voice mode exposes a real mic action in the browser', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'المساعد' }).click()
  await page.getByRole('button', { name: /صوت|Voice/ }).click()

  await expect(page.getByRole('button', { name: /تشغيل المساعد الصوتي|Start voice assistant|تبديل الميكروفون|Toggle microphone/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /تبديل الميكروفون|Toggle microphone/ })).toBeVisible()
  await expect(page.locator('.assistant-voice-orb')).toBeVisible()
})

test('feature routes render after workspace navigation', async ({ page, request }) => {
  await openWorkspace(page, request)
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

test('integration hub content follows the selected language', async ({ page, request }) => {
  await openWorkspace(page, request)
  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/integrations')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  await expect(page.getByRole('heading', { name: 'Integration hub' })).toBeVisible()
  await expect(page.getByText('Clinical drafting', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Switch to Arabic' }).click()

  await expect(page.locator('.app-shell')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { name: 'مركز التكاملات' })).toBeVisible()
  await expect(page.getByText('صياغة الملاحظات السريرية', { exact: true })).toBeVisible()
  await expect(page.getByText('الأسرار والاعتماد', { exact: true })).toBeVisible()
})

test('patient QR opens the secure, patient-filtered record route', async ({ page }) => {
  await page.goto('/#app')
  await page.getByRole('button', { name: 'Switch to English' }).click()
  await page.getByRole('button', { name: 'Login as Doctor', exact: true }).click()
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/patients')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  const qrButton = page.getByRole('button', { name: /Show patient QR/ }).first()
  await expect(qrButton).toBeVisible()
  await qrButton.click()
  const dialog = page.getByRole('dialog')
  const recordLink = dialog.getByRole('link', { name: 'Open secure patient record' })
  await expect(dialog.locator('#patient-qr-code svg')).toBeVisible()
  const recordUrl = await recordLink.getAttribute('href')
  expect(recordUrl).toMatch(/#app\/patients\?code=/)
  if (!recordUrl) throw new Error('The secure patient record link is missing.')

  await page.goto(recordUrl)
  await expect(page.locator('.patient-table-row')).toHaveCount(1)
})

test('care team reply appears in the active message thread', async ({ page }) => {
  await page.goto('/#app')
  await page.getByRole('button', { name: 'Switch to English' }).click()
  await page.getByRole('button', { name: 'Login as Doctor', exact: true }).click()
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/messages')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  await page.getByRole('button', { name: 'New message' }).click()
  const dialog = page.getByRole('dialog')
  const patientSelect = dialog.locator('select')
  const patientOption = patientSelect.locator('option').filter({ hasText: 'Mariam Hassan' }).first()
  await expect(patientOption).toBeAttached()
  const patientId = await patientOption.getAttribute('value')
  if (!patientId) throw new Error('The patient option is missing its ID.')
  await patientSelect.selectOption(patientId)
  await dialog.getByLabel('Subject').fill(`Reply verification ${Date.now()}`)
  await dialog.getByLabel('Type a message').fill('Please reply to this message.')
  await dialog.getByRole('button', { name: 'Send message' }).click()

  const reply = `Care team response ${Date.now()}`
  await page.getByRole('textbox', { name: 'Reply to this patient' }).fill(reply)
  await page.getByRole('button', { name: 'Reply', exact: true }).click()
  await expect(page.locator('.message-view')).toContainText(reply)
})

test('patient portal can reply without retyping the subject', async ({ page }) => {
  await page.goto('/#app')
  await page.getByRole('button', { name: 'Switch to English' }).click()
  await page.getByRole('button', { name: 'Login as Patient', exact: true }).click()
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.getByRole('button', { name: 'Messages', exact: true }).click()

  const reply = `Portal reply ${Date.now()}`
  await page.getByRole('textbox', { name: 'Type a message' }).fill(reply)
  await page.getByRole('button', { name: 'Reply', exact: true }).click()
  await expect(page.locator('.portal-section')).toContainText(reply)
})

test('staff can manage patient messages from the inbox', async ({ page }) => {
  await page.goto('/#app')
  await page.getByRole('button', { name: 'Switch to English' }).click()
  await page.getByRole('button', { name: 'Login as Doctor', exact: true }).click()
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/messages')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.getByRole('button', { name: 'New message' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const patientSelect = dialog.locator('select')
  const patientOption = patientSelect.locator('option').filter({ hasText: 'Mariam Hassan' }).first()
  await expect(patientOption).toBeAttached()
  const patientId = await patientOption.getAttribute('value')
  const patientName = (await patientOption.textContent())?.split('·')[0].trim()
  if (!patientId || !patientName) throw new Error('The selected patient option is missing its identity.')
  await patientSelect.selectOption(patientId)
  await dialog.getByLabel('Subject').fill('Follow-up from your care team')
  const messageBody = `Please contact your care team. ${Date.now()}`
  await dialog.getByLabel('Type a message').fill(messageBody)
  await dialog.getByRole('button', { name: 'Send message' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.thread-list')).toContainText(patientName)
  await expect(page.locator('.message-view')).toContainText(messageBody)
  await expect(page.locator('.message-view')).toContainText(`To: ${patientName}`)
  await expect(page.locator('.message-view')).not.toContainText('Unknown patient')

  const replyBody = `A second follow-up ${Date.now()}`
  await page.getByPlaceholder('Write a secure message...').fill(replyBody)
  await page.getByRole('button', { name: 'Reply' }).click()
  await expect(page.locator('.message-view')).toContainText(replyBody)

  page.once('dialog', (dialog) => dialog.accept())
  const deleteResponse = page.waitForResponse((response) => {
    const path = new URL(response.url()).pathname
    return response.request().method() === 'DELETE' &&
      path.startsWith('/api/v1/messages/') &&
      !path.includes('/patient/')
  })
  await page.getByRole('button', { name: 'Delete message' }).last().click()
  const deleteResult = await deleteResponse
  expect(
    deleteResult.ok(),
    `${deleteResult.url()}: ${await deleteResult.text()}`,
  ).toBeTruthy()
  await expect(page.locator('.message-view')).not.toContainText(replyBody)
  await expect(page.locator('.message-view')).toContainText(messageBody)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete conversation' }).click()
  await expect(page.locator('.thread-list')).not.toContainText(patientName)

  await page.getByRole('button', { name: 'Switch to Arabic' }).click()
  await page.getByRole('button', { name: 'رسالة جديدة' }).click()
  const arabicDialog = page.getByRole('dialog')
  await expect(arabicDialog.getByRole('heading', { name: 'رسالة جديدة لمريض' })).toBeVisible()
  await arabicDialog.getByRole('button', { name: 'إغلاق' }).click()
})

test('chatbot can clear its conversation and reset its context', async ({ page, request }) => {
  await openWorkspace(page, request)
  await page.route('**/api/v1/assistant/orchestrator/chat', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        answer: 'Mock chatbot response.',
        intent: 'unknown',
        status: 'idle',
        active_agent: null,
        conversation_id: null,
        patient_id: null,
        orchestrator_state: { turn: 1 },
      }),
    }),
  )
  await page.getByRole('button', { name: 'Open general chat' }).click()
  const chat = page.getByRole('dialog', { name: 'General chat' })
  await chat.getByRole('textbox', { name: 'Message the assistant' }).fill('Test chatbot history')
  await chat.getByRole('button', { name: 'Send message' }).click()
  await expect(chat).toContainText('Mock chatbot response.')

  page.once('dialog', (dialog) => dialog.accept())
  await chat.getByRole('button', { name: 'Clear conversation' }).click()
  await expect(chat).toContainText('Ask a general question.')
  await expect(chat).not.toContainText('Test chatbot history')
  await expect(chat).not.toContainText('Mock chatbot response.')
})

test('feature controls are interactive', async ({ page, request }) => {
  await openWorkspace(page, request)

  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/patients')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  const patientSearch = page.getByPlaceholder(/Search by name or patient ID|البحث بالاسم أو رقم المريض/)
  await patientSearch.fill('Mariam')
  await expect(patientSearch).toHaveValue('Mariam')

  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/appointments')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await page.getByRole('button', { name: /New appointment|موعد جديد/ }).click()
  await expect(page.locator('.modal')).toBeVisible()
  await page.locator('.modal .icon-btn').click()
  await expect(page.locator('.modal')).toHaveCount(0)

  const calendarRange = page.locator('.calendar-bar strong')
  const initialDate = await calendarRange.textContent()
  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(calendarRange).not.toHaveText(initialDate || '')
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(calendarRange).toHaveText(initialDate || '')
  await expect(page.locator('.view-mode-toggle')).toHaveCount(0)

  const calendarToggle = page.getByRole('button', { name: 'Calendar' })
  await calendarToggle.click()
  const monthCalendar = page.locator('.calendar-month-view')
  await expect(monthCalendar).toBeVisible()
  await expect(calendarToggle).toHaveAttribute('aria-expanded', 'true')
  const calendarMonthHeading = page.locator('.calendar-month-heading h2')
  const initialCalendarMonth = await calendarMonthHeading.textContent()
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(calendarMonthHeading).not.toHaveText(initialCalendarMonth || '')
  await page.getByRole('button', { name: 'Previous month' }).click()
  await expect(calendarMonthHeading).toHaveText(initialCalendarMonth || '')
  const calendarDate = monthCalendar.locator('.calendar-days button').nth(10)
  const selectedDateKey = await calendarDate.getAttribute('data-date')
  const selectedDateLabel = await page.evaluate((dateKey) => {
    const [year, month, day] = (dateKey || '').split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  }, selectedDateKey)
  await calendarDate.click()
  await expect(monthCalendar).toHaveCount(0)
  await expect(calendarRange).toHaveText(selectedDateLabel)

  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/documents')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.locator('input[type="file"]')).toHaveCount(1)

  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/settings')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  const settingsTabs = page.locator('.settings-nav button')
  await settingsTabs.filter({ hasText: 'Preferences' }).click()
  await expect(page.locator('.settings-form .panel-heading h2')).toHaveText('Preferences')
  await page.locator('.settings-theme-options button').filter({ hasText: 'Dark mode' }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/dark-mode/)
  await page.locator('.settings-theme-options button').filter({ hasText: 'Light mode' }).click()
  await settingsTabs.filter({ hasText: 'Security' }).click()
  await expect(page.locator('.settings-form .panel-heading h2')).toHaveText('Security')
  await expect(page.getByText('Two-step verification', { exact: true })).toBeVisible()
  await settingsTabs.filter({ hasText: 'Notifications' }).click()
  await expect(page.locator('.settings-form .panel-heading h2')).toHaveText('Notifications')
})

test('general chat is available to non-clinical staff without patient context', async ({ page, request }) => {
  await openWorkspace(page, request, 'receptionist')

  const chatToggle = page.getByRole('button', { name: 'Open general chat' })
  await expect(chatToggle).toBeVisible()
  await chatToggle.click()
  await expect(page.getByRole('dialog', { name: 'General chat' })).toBeVisible()
  await expect(page.locator('.global-chat-panel select')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Message the assistant' }).fill('Hello')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.locator('.global-chat-message.assistant').last()).not.toBeEmpty()
  await expect(page.locator('.global-chat-sources').last()).toBeVisible()
})

test('patient code is visible and can find the patient record', async ({ page, request }) => {
  const login = await request.post('/api/v1/auth/demo-login', {
    data: { role: 'admin', username: 'admin.demo', password: 'Admin@123' },
  })
  expect(login.ok()).toBeTruthy()
  const token = (await login.json()).access_token as string
  await page.goto('/#app')
  await page.evaluate((accessToken) => localStorage.setItem('careos-access-token', accessToken), token)
  await page.reload()
  await page.goto('/#app/patients')

  const patientCode = page.locator('.patient-code').first()
  await expect(patientCode).toBeVisible()
  const code = (await patientCode.textContent())?.trim() ?? ''
  expect(code).toMatch(/^CARE-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/)
  await page.locator('.patient-qr-button').first().click()
  await expect(page.locator('#patient-qr-code svg')).toBeVisible()
  await page.locator('.patient-qr-modal .patient-modal-actions .outline-btn').click()
  await page.getByPlaceholder(/Search by name or patient ID|البحث بالاسم أو رقم المريض/).fill(code)
  await expect(page.locator('.patient-table-row')).toHaveCount(1)
})

test('workspace remains usable at mobile width without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#app')
  await expect(page.locator('body')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})

test('local demo personas expose staff and patient sessions', async ({ request }) => {
  const accounts = [
    ['admin', 'admin.demo', 'Admin@123'],
    ['doctor', 'doctor.demo', 'Doctor@123'],
    ['nurse', 'nurse.demo', 'Nurse@123'],
    ['receptionist', 'reception.demo', 'Reception@123'],
    ['hospital_director', 'director.demo', 'Director@123'],
    ['it_admin', 'itadmin.demo', 'ITAdmin@123'],
    ['administrative_staff', 'staff.demo', 'Staff@123'],
  ] as const
  for (const [role, username, password] of accounts) {
    const response = await request.post('/api/v1/auth/demo-login', { data: { role, username, password } })
    expect(response.ok(), `${role}: ${await response.text()}`).toBeTruthy()
    expect((await response.json()).access_token).toBeTruthy()
  }
  const patient = await request.post('/api/v1/auth/demo-login', { data: { role: 'patient', username: 'patient.demo', password: 'Patient@123' } })
  expect(patient.ok(), await patient.text()).toBeTruthy()
  expect((await patient.json()).portal_access_token).toBeTruthy()
})

test('patient demo login opens the patient portal from the login card', async ({ page }) => {
  await page.goto('/#app')
  const loginResponse = page.waitForResponse((response) =>
    response.url().includes('/auth/demo-login'),
  )
  await page.getByRole('button', { name: /تسجيل الدخول بصفة مريض|Sign in as Patient/i }).click()
  const response = await loginResponse
  expect(response.ok(), await response.text()).toBeTruthy()
  const loginPayload = await response.json()
  expect(loginPayload.portal_access_token).toBeTruthy()

  await expect(page.locator('.portal-patient-id code')).toBeVisible()
  const portalToken = await page.evaluate(() => localStorage.getItem('careos-portal-token'))
  expect(portalToken, 'patient login should preserve the portal access token').toBeTruthy()
  await expect(page.getByRole('heading', { name: 'Mariam Hassan' })).toBeVisible()
  await expect(page.locator('.portal-patient-id code')).toHaveText(/^CARE-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/)
  const portalTabs = page.locator('.portal-tabs button')
  await expect(portalTabs).toHaveCount(4)
  await portalTabs.nth(1).click()
  await expect(page.locator('.portal-section')).toBeVisible()
  await portalTabs.nth(2).click()
  await expect(page.locator('.portal-section form')).toBeVisible()
  await expect(page.locator('.message-routing')).toContainText('Mariam Hassan')
  await expect(page.locator('.message-routing')).toContainText(/فريق الرعاية|Care team/)
  await page.getByLabel('Message subject').fill('Appointment question')
  await page.getByLabel('Message body').fill('Can you confirm the appointment time?')
  await page.locator('.portal-compose button[type="submit"], .portal-compose button').click()
  await expect(page.locator('.message-bubble').last()).toContainText('Mariam Hassan')
  await expect(page.locator('.message-bubble').last()).toContainText(/فريق الرعاية|Care team/)
  await portalTabs.nth(3).click()
  await expect(page.locator('.portal-section')).toBeVisible()
  const sidebar = page.getByRole('complementary')
  await sidebar.getByRole('button', { name: /Appointments|المواعيد/ }).click()
  await expect(page).toHaveURL(/#app\/appointments$/)
  await expect(page.locator('.portal-section .panel-heading h2')).toHaveText(/Appointments|المواعيد/)
  await sidebar.getByRole('button', { name: /Messages|الرسائل/ }).click()
  await expect(page).toHaveURL(/#app\/messages$/)
  await expect(page.locator('.portal-section form')).toBeVisible()
})

test('staff users are redirected from the patient-only portal', async ({ page, request }) => {
  await openWorkspace(page, request, 'receptionist')
  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/portal')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page).toHaveURL(/#app\/dashboard$/)
  await expect(page.getByText('Authentication required')).toHaveCount(0)
})

test('clinical assistant clearly reports patient-data search is not enabled in the MVP', async ({ page }) => {
  await page.goto('/#app')
  await page.getByRole('button', { name: 'Switch to English' }).click()
  await page.getByRole('button', { name: 'Sign in to your workspace' }).last().click()
  await page.getByRole('button', { name: 'Login as Doctor', exact: true }).click()
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/assistant')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.locator('.assistant-answer')).toContainText(/not enabled in this MVP|غير متاح في نسخة MVP/i)
})

test('operations dashboard excludes clinical and admin-only controls', async ({ page, request }) => {
  await openWorkspace(page, request, 'receptionist')
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Clinical Assistant' })).toHaveCount(0)
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Settings' })).toHaveCount(0)
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Integrations' })).toHaveCount(0)
  await expect(page.getByText('AI drafts reviewed')).toHaveCount(0)
})

test('profile card opens the account page', async ({ page, request }) => {
  await openWorkspace(page, request, 'doctor')
  await page.locator('.profile-card').click()
  await expect(page.locator('.account-profile-panel h2')).toHaveText('E2E doctor')
  await expect(page.getByRole('heading', { name: 'Account security' })).toBeVisible()
})

test('role protection redirects a doctor from restricted audit routes', async ({ page, request }) => {
  await openWorkspace(page, request, 'doctor')
  await page.evaluate(() => {
    window.history.pushState({}, '', '#app/teamAudit')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page).not.toHaveURL(/#app\/teamAudit$/)
  await expect(page.locator('.breadcrumb strong')).not.toContainText(/Team|Audit|الفريق|التدقيق/)
})

for (const scenario of [
  { role: 'doctor', allowed: 'notes', restricted: 'teamAudit' },
  { role: 'nurse', allowed: 'notes', restricted: 'teamAudit' },
  { role: 'receptionist', allowed: 'appointments', restricted: 'notes' },
  { role: 'hospital_director', allowed: 'reports', restricted: 'notes' },
  { role: 'it_admin', allowed: 'integrations', restricted: 'patients' },
  { role: 'administrative_staff', allowed: 'appointments', restricted: 'notes' },
] as const) {
  test(`route guard enforces ${scenario.role} navigation`, async ({ page, request }) => {
    await openWorkspace(page, request, scenario.role)
    await page.evaluate((route) => { window.history.pushState({}, '', `#app/${route}`); window.dispatchEvent(new PopStateEvent('popstate')) }, scenario.allowed)
    await expect(page).toHaveURL(new RegExp(`#app/${scenario.allowed}$`))
    await page.evaluate((route) => { window.history.pushState({}, '', `#app/${route}`); window.dispatchEvent(new PopStateEvent('popstate')) }, scenario.restricted)
    await expect(page).not.toHaveURL(new RegExp(`#app/${scenario.restricted}$`))
  })
}
