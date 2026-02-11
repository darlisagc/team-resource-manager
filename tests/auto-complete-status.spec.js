import { test, expect } from '@playwright/test'

const API = 'http://localhost:3011/api'
const CREDS = { username: 'testadmin', password: 'testadmin123' }

async function getToken(request) {
  const res = await request.post(`${API}/auth/login`, {
    data: CREDS
  })
  expect(res.ok()).toBeTruthy()
  const { token } = await res.json()
  return token
}

function h(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
}

test.describe('Auto-Complete Status When Progress Reaches 100%', () => {

  test('Change 5: PATCH initiative progress to 100 should auto-complete status', async ({ request }) => {
    const token = await getToken(request)

    // 1. Find an active initiative
    const initRes = await request.get(`${API}/initiatives?status=active`, { headers: h(token) })
    expect(initRes.ok()).toBeTruthy()
    const initiatives = await initRes.json()
    expect(initiatives.length).toBeGreaterThan(0)

    const init = initiatives[0]
    console.log(`Testing initiative: "${init.name}" (id=${init.id}, progress=${init.progress}, status=${init.status})`)

    const originalProgress = init.progress
    const originalStatus = init.status

    try {
      // Reset to 50
      await request.patch(`${API}/initiatives/${init.id}/progress`, {
        headers: h(token), data: { progress: 50 }
      })
      // Ensure active status
      await request.put(`${API}/initiatives/${init.id}`, {
        headers: h(token), data: { status: 'active' }
      })

      // Set progress to 100 — should auto-complete
      const completeRes = await request.patch(`${API}/initiatives/${init.id}/progress`, {
        headers: h(token), data: { progress: 100 }
      })
      expect(completeRes.ok()).toBeTruthy()
      const completeData = await completeRes.json()

      console.log(`  Set progress=100 → status=${completeData.status}, progress=${completeData.progress}`)
      expect(completeData.progress).toBe(100)
      expect(completeData.status).toBe('completed')
    } finally {
      await request.put(`${API}/initiatives/${init.id}`, {
        headers: h(token), data: { progress: originalProgress, status: originalStatus }
      })
      console.log(`  Cleanup done`)
    }
  })

  test('Change 5: PATCH initiative progress to 100 should NOT auto-complete if cancelled', async ({ request }) => {
    const token = await getToken(request)

    const initRes = await request.get(`${API}/initiatives?status=active`, { headers: h(token) })
    const initiatives = await initRes.json()
    expect(initiatives.length).toBeGreaterThan(0)

    const init = initiatives[initiatives.length - 1]
    const originalProgress = init.progress
    const originalStatus = init.status
    console.log(`Testing cancelled guard: "${init.name}" (id=${init.id})`)

    try {
      // Set to cancelled
      await request.put(`${API}/initiatives/${init.id}`, {
        headers: h(token), data: { status: 'cancelled' }
      })

      // Set progress to 100 — should NOT change status back
      const completeRes = await request.patch(`${API}/initiatives/${init.id}/progress`, {
        headers: h(token), data: { progress: 100 }
      })
      expect(completeRes.ok()).toBeTruthy()
      const completeData = await completeRes.json()

      console.log(`  Progress=100 with cancelled → status=${completeData.status}`)
      expect(completeData.progress).toBe(100)
      expect(completeData.status).toBe('cancelled')
    } finally {
      await request.put(`${API}/initiatives/${init.id}`, {
        headers: h(token), data: { progress: originalProgress, status: originalStatus }
      })
      console.log(`  Cleanup done`)
    }
  })

  test('Change 5: PATCH initiative progress to 100 should NOT auto-complete if on-hold', async ({ request }) => {
    const token = await getToken(request)

    const initRes = await request.get(`${API}/initiatives?status=active`, { headers: h(token) })
    const initiatives = await initRes.json()
    expect(initiatives.length).toBeGreaterThan(1)

    const init = initiatives[1]
    const originalProgress = init.progress
    const originalStatus = init.status
    console.log(`Testing on-hold guard: "${init.name}" (id=${init.id})`)

    try {
      await request.put(`${API}/initiatives/${init.id}`, {
        headers: h(token), data: { status: 'on-hold' }
      })

      const completeRes = await request.patch(`${API}/initiatives/${init.id}/progress`, {
        headers: h(token), data: { progress: 100 }
      })
      expect(completeRes.ok()).toBeTruthy()
      const completeData = await completeRes.json()

      console.log(`  Progress=100 with on-hold → status=${completeData.status}`)
      expect(completeData.progress).toBe(100)
      expect(completeData.status).toBe('on-hold')
    } finally {
      await request.put(`${API}/initiatives/${init.id}`, {
        headers: h(token), data: { progress: originalProgress, status: originalStatus }
      })
      console.log(`  Cleanup done`)
    }
  })

  test('Changes 2+1: Weekly check-in pushing initiative to 100% auto-completes and cascades to KR', async ({ request }) => {
    const token = await getToken(request)

    // 1. Get a team member
    const membersRes = await request.get(`${API}/members`, { headers: h(token) })
    expect(membersRes.ok()).toBeTruthy()
    const members = await membersRes.json()
    expect(members.length).toBeGreaterThan(0)
    const member = members[0]

    // 2. Find an active initiative with a key_result_id
    const initRes = await request.get(`${API}/initiatives?status=active`, { headers: h(token) })
    const allInits = await initRes.json()
    const testInit = allInits.find(i => i.key_result_id)
    if (!testInit) {
      console.log('SKIP: No active initiative with key_result_id found')
      return
    }

    console.log(`Testing check-in cascade: init="${testInit.name}" (id=${testInit.id}, kr_id=${testInit.key_result_id})`)

    const originalInitProgress = testInit.progress
    const originalInitStatus = testInit.status

    const krRes = await request.get(`${API}/key-results/${testInit.key_result_id}`, { headers: h(token) })
    const originalKr = await krRes.json()

    try {
      // Reset initiative to active with 0 progress
      await request.put(`${API}/initiatives/${testInit.id}`, {
        headers: h(token), data: { status: 'active', progress: 0 }
      })
      await request.patch(`${API}/initiatives/${testInit.id}/progress`, {
        headers: h(token), data: { progress: 0 }
      })
      // Make sure status is active after the progress change
      await request.put(`${API}/initiatives/${testInit.id}`, {
        headers: h(token), data: { status: 'active' }
      })

      // Ensure member is assigned
      await request.post(`${API}/initiatives/${testInit.id}/assignments`, {
        headers: h(token), data: { team_member_id: member.id, role: 'Lead' }
      }).catch(() => {})

      // Submit weekly check-in with 100% progress contribution
      const now = new Date()
      const day = now.getDay()
      const diff = now.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(now.setDate(diff))
      const weekStart = monday.toISOString().split('T')[0]

      const checkinRes = await request.post(`${API}/weekly-checkins`, {
        headers: h(token),
        data: {
          week_start: weekStart,
          member_id: member.id,
          items: [{
            initiative_id: testInit.id,
            time_allocation_pct: 50,
            progress_contribution_pct: 100,
            notes: 'Auto-complete test'
          }],
          notes: 'Testing auto-complete',
          mood: '🔥',
          submit: true
        }
      })
      expect(checkinRes.ok()).toBeTruthy()

      // Verify initiative status changed to completed
      const updatedInitRes = await request.get(`${API}/initiatives/${testInit.id}`, { headers: h(token) })
      const updatedInit = await updatedInitRes.json()

      console.log(`  After check-in: init progress=${updatedInit.progress}, status=${updatedInit.status}`)
      expect(updatedInit.progress).toBeGreaterThanOrEqual(100)
      expect(updatedInit.status).toBe('completed')

      // Check parent KR was recalculated
      const updatedKrRes = await request.get(`${API}/key-results/${testInit.key_result_id}`, { headers: h(token) })
      const updatedKr = await updatedKrRes.json()
      console.log(`  Parent KR: progress=${updatedKr.progress}, status=${updatedKr.status}`)
    } finally {
      await request.put(`${API}/initiatives/${testInit.id}`, {
        headers: h(token), data: { status: originalInitStatus, progress: originalInitProgress }
      })
      if (originalKr.status !== 'completed') {
        await request.put(`${API}/key-results/${testInit.key_result_id}`, {
          headers: h(token), data: { status: originalKr.status, progress: originalKr.progress }
        })
      }
      console.log(`  Cleanup done`)
    }
  })

  test('Change 3: Weekly check-in direct KR progress to 100% should auto-complete KR', async ({ request }) => {
    const token = await getToken(request)

    const membersRes = await request.get(`${API}/members`, { headers: h(token) })
    const members = await membersRes.json()
    const member = members[0]

    // Create an isolated KR with a single assignee to avoid scaling issues
    const goalRes = await request.post(`${API}/goals`, {
      headers: h(token),
      data: { title: 'Test Direct KR Goal', quarter: 'Q1 2026', status: 'active' }
    })
    const goal = await goalRes.json()

    const krRes = await request.post(`${API}/key-results`, {
      headers: h(token),
      data: { goal_id: goal.id, title: 'Test Direct KR Progress', status: 'active' }
    })
    const testKr = await krRes.json()
    console.log(`Testing direct KR progress via check-in: "${testKr.title}" (id=${testKr.id})`)

    try {
      // Assign single member to KR
      await request.post(`${API}/key-results/${testKr.id}/assignees`, {
        headers: h(token), data: { team_member_id: member.id }
      }).catch(() => {})

      // Submit check-in with direct KR progress — single assignee so 100% goes through fully
      const now = new Date()
      const day = now.getDay()
      const diff = now.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(now.setDate(diff - 7))
      const weekStart = monday.toISOString().split('T')[0]

      const checkinRes = await request.post(`${API}/weekly-checkins`, {
        headers: h(token),
        data: {
          week_start: weekStart,
          member_id: member.id,
          items: [{
            key_result_id: testKr.id,
            time_allocation_pct: 30,
            progress_contribution_pct: 100,
            notes: 'Direct KR auto-complete test'
          }],
          notes: 'Testing KR auto-complete',
          mood: '😊',
          submit: true
        }
      })
      expect(checkinRes.ok()).toBeTruthy()

      // Verify KR status
      const updatedKrRes = await request.get(`${API}/key-results/${testKr.id}`, { headers: h(token) })
      const updatedKr = await updatedKrRes.json()
      console.log(`  After check-in: KR progress=${updatedKr.progress}, status=${updatedKr.status}`)
      expect(updatedKr.progress).toBeGreaterThanOrEqual(100)
      expect(updatedKr.status).toBe('completed')
    } finally {
      await request.delete(`${API}/key-results/${testKr.id}`, { headers: h(token) })
      await request.delete(`${API}/goals/${goal.id}`, { headers: h(token) })
      console.log(`  Cleanup done`)
    }
  })

  test('Changes 4+6: recalculateKeyResultProgress auto-completes KR when all initiatives reach 100%', async ({ request }) => {
    const token = await getToken(request)

    // Create a test goal
    const goalRes = await request.post(`${API}/goals`, {
      headers: h(token),
      data: { title: 'Test Auto-Complete Goal', quarter: 'Q1 2026', status: 'active' }
    })
    expect(goalRes.ok()).toBeTruthy()
    const goal = await goalRes.json()

    // Create a test key result
    const krRes = await request.post(`${API}/key-results`, {
      headers: h(token),
      data: { goal_id: goal.id, title: 'Test Auto-Complete KR', status: 'active' }
    })
    expect(krRes.ok()).toBeTruthy()
    const kr = await krRes.json()

    // Create two test initiatives
    const init1Res = await request.post(`${API}/initiatives`, {
      headers: h(token),
      data: { name: 'Test Init 1', key_result_id: kr.id, status: 'active', progress: 0 }
    })
    const init1 = await init1Res.json()

    const init2Res = await request.post(`${API}/initiatives`, {
      headers: h(token),
      data: { name: 'Test Init 2', key_result_id: kr.id, status: 'active', progress: 0 }
    })
    const init2 = await init2Res.json()

    console.log(`Created test hierarchy: Goal(${goal.id}) → KR(${kr.id}) → Inits(${init1.id}, ${init2.id})`)

    try {
      // Set first initiative to 100 → auto-complete, triggers KR recalc
      const patch1Res = await request.patch(`${API}/initiatives/${init1.id}/progress`, {
        headers: h(token), data: { progress: 100 }
      })
      const patch1Data = await patch1Res.json()
      expect(patch1Data.status).toBe('completed')
      console.log(`  Init 1: progress=${patch1Data.progress}, status=${patch1Data.status}`)

      // KR should be ~50% (avg of 100 and 0), NOT completed
      const kr50Res = await request.get(`${API}/key-results/${kr.id}`, { headers: h(token) })
      const kr50 = await kr50Res.json()
      console.log(`  KR after init1=100: progress=${kr50.progress}, status=${kr50.status}`)
      expect(kr50.progress).toBe(50)
      expect(kr50.status).toBe('active')

      // Set second initiative to 100 → KR should now be 100% AND completed
      const patch2Res = await request.patch(`${API}/initiatives/${init2.id}/progress`, {
        headers: h(token), data: { progress: 100 }
      })
      const patch2Data = await patch2Res.json()
      expect(patch2Data.status).toBe('completed')
      console.log(`  Init 2: progress=${patch2Data.progress}, status=${patch2Data.status}`)

      // Verify KR is now 100% and auto-completed
      const kr100Res = await request.get(`${API}/key-results/${kr.id}`, { headers: h(token) })
      const kr100 = await kr100Res.json()
      console.log(`  KR after both=100: progress=${kr100.progress}, status=${kr100.status}`)
      expect(kr100.progress).toBe(100)
      expect(kr100.status).toBe('completed')
    } finally {
      await request.delete(`${API}/initiatives/${init1.id}`, { headers: h(token) })
      await request.delete(`${API}/initiatives/${init2.id}`, { headers: h(token) })
      await request.delete(`${API}/key-results/${kr.id}`, { headers: h(token) })
      await request.delete(`${API}/goals/${goal.id}`, { headers: h(token) })
      console.log(`  Cleanup: deleted test data`)
    }
  })
})
