import { describe, expect, it } from 'vitest'
import { dictionary, translate, type Locale } from './i18n'

const auditGlossaryKeys = [
  'apply',
  'badResponse',
  'checking',
  'copyRedacted',
  'copySecret',
  'emptyCheckpointsCta',
  'emptyFilesCta',
  'emptyMemoryCta',
  'emptyModelsCta',
  'emptySkillsCta',
  'emptyTasksCta',
  'general',
  'memoryKindDecision',
  'memoryKindFact',
  'memoryKindInstruction',
  'memoryKindStyle',
  'models',
  'more',
  'providers',
  'privacy',
  'redactSecrets',
  'reject',
  'routeChip',
  'routeChipDemo',
  'routeChipLocal',
  'routeChipRemote',
  'routerLabelCode',
  'routerLabelFast',
  'routerLabelLocal',
  'routerLabelManual',
  'routerLabelSmart',
  'secretCopy',
  'settingsTabAppearance',
  'settingsTabGeneral',
  'settingsTabMcp',
  'settingsTabModels',
  'settingsTabNotifications',
  'settingsTabPrivacy',
  'settingsTabProviders',
  'settingsTabUsage',
  'setupRemoteConsent',
  'setupRemoteConsentHelp',
  'source',
  'updated',
  'workspacePanel'
] as const satisfies ReadonlyArray<keyof typeof dictionary.en>

describe('audit glossary localization', () => {
  it('has non-empty English and Russian values for hardcoded UI audit terms', () => {
    const locales: Locale[] = ['en', 'ru']

    for (const locale of locales) {
      for (const key of auditGlossaryKeys) {
        expect(dictionary[locale][key].trim(), `${locale}.${key}`).not.toBe('')
        expect(translate(locale, key), `${locale}.${key}`).toBe(dictionary[locale][key])
      }
    }
  })
})
