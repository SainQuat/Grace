export type AgentStepStatus = 'queued' | 'running' | 'done' | 'error'
export type AgentRunStatus = 'running' | 'done' | 'error'

export interface AgentStep {
  id: string
  title: string
  detail?: string
  status: AgentStepStatus
  startedAt?: string
  completedAt?: string
}

export interface AgentRun {
  id: string
  requestId: string
  title: string
  status: AgentRunStatus
  expanded: boolean
  steps: AgentStep[]
  startedAt: string
  completedAt?: string
}

export interface CreateAgentRunOptions {
  id: string
  requestId: string
  skillName?: string
  hasCodeIntent?: boolean
  memoryCount?: number
  toolCount?: number
  fileCount?: number
  startedAt?: string
  expanded?: boolean
}

export function createAgentRun(options: CreateAgentRunOptions): AgentRun {
  const startedAt = options.startedAt ?? new Date().toISOString()
  const contextParts = [
    options.memoryCount ? `${options.memoryCount} memory` : '',
    options.skillName ? options.skillName : '',
    options.toolCount ? `${options.toolCount} tools` : '',
    options.fileCount ? `${options.fileCount} files` : ''
  ].filter(Boolean)

  const steps: AgentStep[] = [
    {
      id: `${options.id}-context`,
      title: 'Prepare context',
      detail: contextParts.length ? contextParts.join(' · ') : 'Chat history and selected model',
      status: 'done',
      startedAt,
      completedAt: startedAt
    },
    {
      id: `${options.id}-request`,
      title: 'Send request to model',
      detail: options.skillName ? `Skill: ${options.skillName}` : undefined,
      status: 'running',
      startedAt
    },
    {
      id: `${options.id}-stream`,
      title: 'Stream answer',
      detail: 'Tokens arriving from the selected model',
      status: 'queued'
    },
    ...(options.hasCodeIntent
      ? [
          {
            id: `${options.id}-artifact`,
            title: 'Update live artifact',
            detail: 'Code workspace and preview',
            status: 'queued' as AgentStepStatus
          }
        ]
      : []),
    {
      id: `${options.id}-finalize`,
      title: 'Finalize response',
      detail: options.hasCodeIntent ? 'Prepare code diff and chat response' : 'Prepare final chat response',
      status: 'queued'
    }
  ]

  return {
    id: options.id,
    requestId: options.requestId,
    title: options.skillName ? `Agent run · ${options.skillName}` : 'Agent run',
    status: 'running',
    expanded: options.expanded ?? true,
    steps,
    startedAt
  }
}

export function setAgentRunExpanded(run: AgentRun, expanded: boolean): AgentRun {
  return { ...run, expanded }
}

export function advanceAgentRun(run: AgentRun, event: 'delta' | 'artifact' | 'done' | 'error', at = new Date().toISOString()): AgentRun {
  if (event === 'delta') {
    return updateStep(run, 'Stream answer', at)
  }

  if (event === 'artifact') {
    return updateStep(run, 'Update live artifact', at)
  }

  if (event === 'done') {
    return {
      ...run,
      status: 'done',
      completedAt: at,
      steps: run.steps.map((step) => ({ ...step, status: 'done', completedAt: step.completedAt ?? at }))
    }
  }

  const failedStepIndex = run.steps.findIndex((step) => step.status === 'running' || step.status === 'queued')
  return {
    ...run,
    status: 'error',
    completedAt: at,
    steps: run.steps.map((step, index) =>
      index === failedStepIndex
        ? { ...step, status: 'error', startedAt: step.startedAt ?? at, completedAt: at }
        : step.status === 'running'
        ? { ...step, status: 'error', completedAt: at }
        : step
    )
  }
}

function updateStep(run: AgentRun, title: string, at: string): AgentRun {
  const targetIndex = run.steps.findIndex((step) => step.title === title)
  if (targetIndex === -1) return run

  return {
    ...run,
    steps: run.steps.map((step, index) => {
      if (index < targetIndex && step.status !== 'done') {
        return { ...step, status: 'done', completedAt: step.completedAt ?? at }
      }

      if (index === targetIndex) {
        return { ...step, status: 'running', startedAt: step.startedAt ?? at }
      }

      return step
    })
  }
}

export function getAgentRunProgress(run: AgentRun): { done: number; total: number } {
  return {
    done: run.steps.filter((step) => step.status === 'done').length,
    total: run.steps.length
  }
}

export function getAgentRunCurrentStep(run: AgentRun): AgentStep | undefined {
  return run.steps.find((step) => step.status === 'running' || step.status === 'error') ?? run.steps.find((step) => step.status === 'queued')
}
