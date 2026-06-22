export const PERSISTENT_STATE_APP_VERSION = '0.1.13'
export const PERSISTENT_STATE_SCHEMA_VERSION = 1

export interface PersistentStateEnvelope<T> {
  version: number
  appVersion: string
  value: T
}

export interface PersistentValueOptions<T> {
  version?: number
  migrate?: (value: unknown, fromVersion: number, toVersion: number) => T
  validate?: (value: unknown) => value is T
}

export function createPersistentStateEnvelope<T>(
  value: T,
  version = PERSISTENT_STATE_SCHEMA_VERSION
): PersistentStateEnvelope<T> {
  return {
    version,
    appVersion: PERSISTENT_STATE_APP_VERSION,
    value
  }
}

export function safeParsePersistentValue<T>(
  storedValue: string | null | undefined,
  fallbackValue: T,
  options: PersistentValueOptions<T> = {}
): T {
  if (storedValue == null) return fallbackValue

  try {
    return migratePersistentValue(JSON.parse(storedValue), fallbackValue, options)
  } catch {
    return fallbackValue
  }
}

export function migratePersistentValue<T>(
  parsedValue: unknown,
  fallbackValue: T,
  options: PersistentValueOptions<T> = {}
): T {
  const targetVersion = options.version ?? PERSISTENT_STATE_SCHEMA_VERSION

  try {
    const migratedValue = isPersistentStateEnvelope(parsedValue)
      ? migrateEnvelopeValue(parsedValue, targetVersion, options.migrate, fallbackValue)
      : parsedValue

    if (options.validate && !options.validate(migratedValue)) {
      return fallbackValue
    }

    return migratedValue as T
  } catch {
    return fallbackValue
  }
}

export function ensureArrayNonEmpty<T>(value: unknown, fallbackValue: T[]): T[] {
  return Array.isArray(value) && value.length > 0 ? (value as T[]) : fallbackValue
}

function migrateEnvelopeValue<T>(
  envelope: PersistentStateEnvelope<unknown>,
  targetVersion: number,
  migrate: PersistentValueOptions<T>['migrate'],
  fallbackValue: T
): unknown {
  if (envelope.version === targetVersion) {
    return envelope.value
  }

  return migrate ? migrate(envelope.value, envelope.version, targetVersion) : fallbackValue
}

function isPersistentStateEnvelope(value: unknown): value is PersistentStateEnvelope<unknown> {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<PersistentStateEnvelope<unknown>>
  return typeof candidate.version === 'number' && Object.prototype.hasOwnProperty.call(candidate, 'value')
}
