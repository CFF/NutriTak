import { db } from './db'

function today() {
  return new Date().toISOString().slice(0, 10)
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export async function getLog(date = today()) {
  return await db.logs.get(date)
}

export async function saveLog(date = today(), meals) {
  await db.logs.put({ date, meals })
}

export async function getAllLogs() {
  return await db.logs.orderBy('date').reverse().toArray()
}

export async function deleteLog(date) {
  await db.logs.delete(date)
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile() {
  const p = await db.profile.get(1)
  return { maintenance: p?.maintenance ?? 1300, goal: p?.goal ?? 1920 }
}

export async function saveProfileToDB(profile) {
  await db.profile.put({ id: 1, ...profile })
}

// ─── Food history ─────────────────────────────────────────────────────────────

export async function getHistory() {
  const items = await db.history.toArray()
  return Object.fromEntries(
    items.map(i => [i.key, { name: i.name, kcal: i.kcal, count: i.count }])
  )
}

export async function upsertHistory(entry) {
  await db.history.put(entry)
}
