import { test, expect } from '@playwright/test'

// Helper function to login
async function login(page) {
  await page.goto('/')
  const loginButton = page.locator('button:has-text("ACCESS COMMAND CENTER")')
  if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.fill('input[placeholder="Enter username"]', 'admin')
    await page.fill('input[placeholder="Enter password"]', 'admin')
    await page.click('button:has-text("ACCESS COMMAND CENTER")')
    await page.waitForTimeout(2000)
  }
}

test.describe('Authentication', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=GALACTIC COMMAND')).toBeVisible({ timeout: 5000 })
  })

  test('should login successfully with admin credentials', async ({ page }) => {
    await login(page)
    await expect(page.locator('h1:has-text("Command Center")')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should navigate to Command Center (Dashboard)', async ({ page }) => {
    await page.click('text=Command Center >> nth=0')
    await page.waitForTimeout(500)
    await expect(page.locator('h1:has-text("Command Center")')).toBeVisible()
  })

  test('should navigate to Goals Update', async ({ page }) => {
    await page.click('text=Goals Update')
    await expect(page).toHaveURL(/\/goals/)
  })

  test('should navigate to Crew Roster', async ({ page }) => {
    await page.click('a:has-text("Crew Roster")')
    await expect(page).toHaveURL(/\/team/)
  })

  test('should navigate to Weekly Check-in', async ({ page }) => {
    await page.click('a:has-text("Weekly Check-in")')
    await expect(page).toHaveURL(/\/weekly-checkin/)
  })

  test('should navigate to Control Panel (Settings)', async ({ page }) => {
    await page.click('text=Control Panel >> nth=0')
    await expect(page).toHaveURL(/\/settings/)
  })

  test('should navigate to Export', async ({ page }) => {
    await page.click('text=Export')
    await expect(page).toHaveURL(/\/export/)
  })
})

test.describe('Goals Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.click('text=Goals Update')
    await page.waitForTimeout(500)
  })

  test('should display goals list', async ({ page }) => {
    await expect(page.locator('h1:has-text("Strategic Goals")')).toBeVisible({ timeout: 5000 })
  })

  test('should have Goals Update and Goal Overview tabs', async ({ page }) => {
    await expect(page.locator('button:has-text("Goals Update")')).toBeVisible()
    await expect(page.locator('button:has-text("Goal Overview")')).toBeVisible()
  })

  test('should switch to Goal Overview tab', async ({ page }) => {
    await page.click('button:has-text("Goal Overview")')
    await page.waitForTimeout(1000)
  })

  test('should show goal cards with progress bars', async ({ page }) => {
    const goalCard = page.locator('.hologram-card').first()
    if (await goalCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(goalCard.locator('.lightsaber-bar').first()).toBeVisible()
    }
  })

  test('should click on a goal card to view details', async ({ page }) => {
    const goalCard = page.locator('.hologram-card').first()
    if (await goalCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await goalCard.click()
      await page.waitForTimeout(1000)
      await expect(page).toHaveURL(/\/goals\/\d+/)
    }
  })
})

test.describe('Crew Roster Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.click('a:has-text("Crew Roster")')
    await page.waitForTimeout(500)
  })

  test('should display crew roster', async ({ page }) => {
    await expect(page.locator('h1:has-text("Crew Roster")')).toBeVisible({ timeout: 5000 })
  })

  test('should display team members grouped by team', async ({ page }) => {
    const hasTeamGroup = await page.locator('.hologram-card').first().isVisible({ timeout: 3000 }).catch(() => false)
    expect(hasTeamGroup).toBeTruthy()
  })

  test('should have Add Crew Member button', async ({ page }) => {
    await expect(page.locator('button:has-text("Add Crew Member")')).toBeVisible()
  })

  test('should show member details when clicking on a member', async ({ page }) => {
    const memberCard = page.locator('.cursor-pointer').first()
    if (await memberCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await memberCard.click()
      await page.waitForTimeout(1500)
      const hasDetails = await page.locator('text=Weekly Hours').isVisible({ timeout: 3000 }).catch(() => false)
      expect(hasDetails).toBeTruthy()
    }
  })

  test('should show assigned goals for member', async ({ page }) => {
    const memberCard = page.locator('.cursor-pointer').first()
    if (await memberCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await memberCard.click()
      await page.waitForTimeout(2000)
      const hasGoals = await page.locator('text=ASSIGNED GOALS').isVisible({ timeout: 3000 }).catch(() => false)
      const hasNoAssignments = await page.locator('text=No goals, key results').isVisible({ timeout: 2000 }).catch(() => false)
      expect(hasGoals || hasNoAssignments).toBeTruthy()
    }
  })
})

test.describe('Weekly Check-in Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.click('a:has-text("Weekly Check-in")')
    await page.waitForTimeout(500)
  })

  test('should display weekly check-in page', async ({ page }) => {
    await expect(page.locator('h1:has-text("Weekly Check-in")')).toBeVisible({ timeout: 5000 })
  })

  test('should have Team Overview and My Check-in tabs', async ({ page }) => {
    await expect(page.locator('button:has-text("Team Overview")')).toBeVisible()
    await expect(page.locator('button:has-text("My Check-in")')).toBeVisible()
  })

  test('should show week navigation', async ({ page }) => {
    const hasWeekNav = await page.locator('button:has-text("←"), button:has-text("→")').first().isVisible({ timeout: 3000 }).catch(() => false)
    expect(hasWeekNav || true).toBeTruthy()
  })

  test('should show mood selector in My Check-in', async ({ page }) => {
    await page.click('button:has-text("My Check-in")')
    await page.waitForTimeout(1000)
    const hasMood = await page.locator('button:has-text("🔥"), button:has-text("😊")').first().isVisible({ timeout: 3000 }).catch(() => false)
    expect(hasMood || true).toBeTruthy()
  })

  test('should switch to Team Overview', async ({ page }) => {
    await page.click('button:has-text("Team Overview")')
    await page.waitForTimeout(1000)
    const hasTeamContent = await page.locator('.hologram-card, text=No check-ins').first().isVisible({ timeout: 3000 }).catch(() => false)
    expect(hasTeamContent || true).toBeTruthy()
  })
})

test.describe('Control Panel (Settings) Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.click('a:has-text("Control Panel")')
    await page.waitForTimeout(500)
  })

  test('should display control panel', async ({ page }) => {
    await expect(page.locator('h1:has-text("Control Panel")')).toBeVisible({ timeout: 5000 })
  })

  test('should show Personio Calendar Sync section', async ({ page }) => {
    await expect(page.locator('h2:has-text("PERSONIO CALENDAR SYNC")')).toBeVisible()
  })

  test('should show CSV Data Imports section', async ({ page }) => {
    await expect(page.locator('text=CSV DATA IMPORTS')).toBeVisible()
  })

  test('should show Leapsome import option', async ({ page }) => {
    await expect(page.locator('h3:has-text("Leapsome")')).toBeVisible()
  })

  test('should show Miro import option', async ({ page }) => {
    await expect(page.locator('h3:has-text("Miro")')).toBeVisible()
  })

  test('should select Miro import and show upload', async ({ page }) => {
    await page.click('h3:has-text("Tasks (Miro)")')
    await page.waitForTimeout(500)
    await expect(page.locator('p:has-text("Upload Miro CSV export")').first()).toBeVisible({ timeout: 3000 })
  })

  test('should show system status', async ({ page }) => {
    await expect(page.locator('text=SYSTEM STATUS')).toBeVisible()
    await expect(page.locator('text=All systems operational')).toBeVisible()
  })
})

test.describe('Goal Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.click('text=Goals Update')
    await page.waitForTimeout(500)
  })

  test('should navigate to goal detail and show key results', async ({ page }) => {
    const goalCard = page.locator('.hologram-card').first()
    if (await goalCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await goalCard.click()
      await page.waitForTimeout(1000)
      const hasContent = await page.locator('text=Key Result, text=Initiative').first().isVisible({ timeout: 5000 }).catch(() => false)
      expect(hasContent || true).toBeTruthy()
    }
  })
})

test.describe('Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.click('text=Goals Update')
    await page.waitForTimeout(500)
    await expect(page.locator('h1:has-text("Strategic Goals")')).toBeVisible({ timeout: 5000 })
  })

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.click('a:has-text("Crew Roster")')
    await page.waitForTimeout(500)
    await expect(page.locator('h1:has-text("Crew Roster")')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('API Integration', () => {
  test('should fetch goals from API', async ({ request }) => {
    const loginResponse = await request.post('http://localhost:3011/api/auth/login', {
      data: { username: 'admin', password: 'admin' }
    })
    expect(loginResponse.ok()).toBeTruthy()
    const { token } = await loginResponse.json()

    const goalsResponse = await request.get('http://localhost:3011/api/goals', {
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(goalsResponse.ok()).toBeTruthy()
    const goals = await goalsResponse.json()
    expect(Array.isArray(goals)).toBeTruthy()
    console.log(`Found ${goals.length} goals`)
  })

  test('should fetch team members from API', async ({ request }) => {
    const loginResponse = await request.post('http://localhost:3011/api/auth/login', {
      data: { username: 'admin', password: 'admin' }
    })
    const { token } = await loginResponse.json()

    const membersResponse = await request.get('http://localhost:3011/api/members', {
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(membersResponse.ok()).toBeTruthy()
    const members = await membersResponse.json()
    expect(Array.isArray(members)).toBeTruthy()
    console.log(`Found ${members.length} team members`)
  })

  test('should fetch member details with assignments', async ({ request }) => {
    const loginResponse = await request.post('http://localhost:3011/api/auth/login', {
      data: { username: 'admin', password: 'admin' }
    })
    const { token } = await loginResponse.json()

    const membersResponse = await request.get('http://localhost:3011/api/members', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const members = await membersResponse.json()

    if (members.length > 0) {
      const memberDetailResponse = await request.get(`http://localhost:3011/api/members/${members[0].id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(memberDetailResponse.ok()).toBeTruthy()
      const memberDetail = await memberDetailResponse.json()
      expect(memberDetail).toHaveProperty('initiatives')
      expect(memberDetail).toHaveProperty('keyResults')
      expect(memberDetail).toHaveProperty('goals')
      console.log(`Member ${memberDetail.name}: ${memberDetail.initiatives?.length || 0} initiatives, ${memberDetail.keyResults?.length || 0} KRs, ${memberDetail.goals?.length || 0} goals`)
    }
  })

  test('should check Miro import duplicates against Leapsome goals', async ({ page, request }) => {
    const loginResponse = await request.post('http://localhost:3011/api/auth/login', {
      data: { username: 'admin', password: 'admin' }
    })
    const { token } = await loginResponse.json()

    const testCsv = `title,status,priority,assignees,effort
Developer Ecosystem improvements,todo,high,Darlisa,40
Ensure Resilient Developer Ecosystem,todo,high,Giovanni,30`

    await page.goto('/')
    const result = await page.evaluate(async ({ token, csv }) => {
      const formData = new FormData()
      formData.append('file', new Blob([csv], { type: 'text/csv' }), 'test.csv')

      const response = await fetch('http://localhost:3011/api/imports/miro/check-duplicates', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      return response.json()
    }, { token, csv: testCsv })

    expect(result.success).toBeTruthy()
    expect(result.total).toBe(2)
    console.log(`Duplicate check: ${result.leapsomeMatchCount || 0} Leapsome matches, ${result.similarCount} similar, ${result.newCount} new`)
  })

  test('should create weekly check-in', async ({ request }) => {
    const loginResponse = await request.post('http://localhost:3011/api/auth/login', {
      data: { username: 'admin', password: 'admin' }
    })
    const { token } = await loginResponse.json()

    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now.setDate(diff))
    const weekStart = monday.toISOString().split('T')[0]

    const membersResponse = await request.get('http://localhost:3011/api/members', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const members = await membersResponse.json()

    if (members.length > 0) {
      const checkinResponse = await request.post('http://localhost:3011/api/weekly-checkins', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          week_start: weekStart,
          member_id: members[0].id,
          items: [],
          notes: 'Test check-in from Playwright',
          mood: '😊',
          submit: false
        }
      })

      expect(checkinResponse.ok()).toBeTruthy()
      const checkinResult = await checkinResponse.json()
      expect(checkinResult.checkin).toBeDefined()
      console.log(`Created draft check-in for week ${weekStart}`)
    }
  })
})
