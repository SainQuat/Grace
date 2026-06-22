import { describe, expect, it } from 'vitest'
import {
  PERSISTENT_STATE_APP_VERSION,
  createPersistentStateEnvelope,
  ensureArrayNonEmpty,
  migratePersistentValue,
  safeParsePersistentValue
} from './persistentState'

interface StoredChat {
  id: string
  title: string
}

describe('persistent state helpers', () => {
  const fallbackChats: StoredChat[] = [{ id: 'fallback-chat', title: 'Fallback' }]

  it('falls back when localStorage JSON is corrupted', () => {
    expect(safeParsePersistentValue('{bad json', fallbackChats)).toBe(fallbackChats)
  })

  it('accepts old raw stored values without an envelope', () => {
    const rawChats: StoredChat[] = [{ id: 'raw-chat', title: 'Raw' }]

    expect(safeParsePersistentValue(JSON.stringify(rawChats), fallbackChats)).toEqual(rawChats)
  })

  it('migrates an old envelope version to the current shape', () => {
    const oldEnvelope = JSON.stringify(createPersistentStateEnvelope({ id: 'chat-1' }, 0))

    const migrated = safeParsePersistentValue(oldEnvelope, fallbackChats[0], {
      migrate: (value, fromVersion, toVersion) => ({
        ...(value as { id: string }),
        title: `Migrated ${fromVersion}->${toVersion}`
      })
    })

    expect(migrated).toEqual({ id: 'chat-1', title: 'Migrated 0->1' })
  })

  it('reads current envelopes and keeps release metadata on writes', () => {
    const envelope = createPersistentStateEnvelope(fallbackChats)

    expect(envelope.appVersion).toBe(PERSISTENT_STATE_APP_VERSION)
    expect(migratePersistentValue(envelope, [])).toBe(fallbackChats)
  })

  it('falls back when stored chats are empty', () => {
    const emptyChats = safeParsePersistentValue(JSON.stringify(createPersistentStateEnvelope([])), fallbackChats)

    expect(ensureArrayNonEmpty(emptyChats, fallbackChats)).toBe(fallbackChats)
  })
})
