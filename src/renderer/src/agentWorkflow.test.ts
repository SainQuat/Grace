import { describe, expect, it } from 'vitest'
import { advanceAgentRun, createAgentRun, getAgentRunProgress, setAgentRunExpanded } from './agentWorkflow'

describe('agent workflow', () => {
  it('creates deterministic visible steps', () => {
    const run = createAgentRun({
      id: 'run-1',
      requestId: 'assistant-1',
      skillName: 'Open Dynamic Workflows',
      hasCodeIntent: true,
      memoryCount: 2,
      startedAt: '2026-06-22T00:00:00.000Z'
    })

    expect(run.steps.map((step) => step.title)).toEqual([
      'Prepare context',
      'Send request to model',
      'Stream answer',
      'Update live artifact',
      'Finalize response'
    ])
    expect(run.steps[0].status).toBe('done')
    expect(run.steps[1].status).toBe('running')
  })

  it('advances through stream, artifact, and done states', () => {
    const run = createAgentRun({ id: 'run-1', requestId: 'assistant-1', hasCodeIntent: true })
    const streaming = advanceAgentRun(run, 'delta', '2026-06-22T00:00:01.000Z')
    const artifact = advanceAgentRun(streaming, 'artifact', '2026-06-22T00:00:02.000Z')
    const done = advanceAgentRun(artifact, 'done', '2026-06-22T00:00:03.000Z')

    expect(streaming.steps.find((step) => step.title === 'Stream answer')?.status).toBe('running')
    expect(artifact.steps.find((step) => step.title === 'Update live artifact')?.status).toBe('running')
    expect(done.status).toBe('done')
    expect(getAgentRunProgress(done)).toEqual({ done: 5, total: 5 })
  })

  it('marks active step as error and toggles expansion', () => {
    const run = setAgentRunExpanded(createAgentRun({ id: 'run-1', requestId: 'assistant-1' }), true)
    const failed = advanceAgentRun(run, 'error', '2026-06-22T00:00:01.000Z')

    expect(run.expanded).toBe(true)
    expect(failed.status).toBe('error')
    expect(failed.steps.some((step) => step.status === 'error')).toBe(true)
  })
})
