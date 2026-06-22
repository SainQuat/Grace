import { describe, expect, it } from 'vitest'
import { filterMcpMarketplacePresets, mcpMarketplacePresets } from './mcpMarketplace'

describe('mcp marketplace', () => {
  it('ships core presets with install data', () => {
    expect(mcpMarketplacePresets.map((preset) => preset.id)).toEqual(
      expect.arrayContaining(['notion', 'github', 'linear', 'filesystem'])
    )
    expect(mcpMarketplacePresets.every((preset) => preset.command || preset.url)).toBe(true)
  })

  it('filters presets by name and env fields', () => {
    expect(filterMcpMarketplacePresets('notion').map((preset) => preset.id)).toEqual(['notion'])
    expect(filterMcpMarketplacePresets('GITHUB_TOKEN').map((preset) => preset.id)).toEqual(['github'])
  })
})
