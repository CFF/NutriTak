import Dexie from 'dexie'

export const db = new Dexie('nutritrack')

db.version(1).stores({
  logs: 'date'
})

db.version(2).stores({
  logs: 'date',
  profile: 'id',
  history: 'key'
})
