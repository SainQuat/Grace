import { describe, expect, it } from 'vitest'
import { createDraftTitle, formatBytes } from './utils'

describe('formatBytes', () => {
  it('formats bytes and kilobytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })
})

describe('createDraftTitle', () => {
  it('normalizes and truncates chat titles', () => {
    expect(createDraftTitle('   hello    world   ')).toBe('hello world')
    expect(createDraftTitle('a'.repeat(80))).toBe(`${'a'.repeat(39)}...`)
    expect(createDraftTitle('   ')).toBe('Новый чат')
  })
})
