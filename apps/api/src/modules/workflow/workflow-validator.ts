import { BadRequestException } from '@nestjs/common'

export interface StateDraftInput {
  key: string
  name: string
  isInitial?: boolean
  isTerminal?: boolean
  metadata?: Record<string, unknown>
}

export interface TransitionDraftInput {
  key: string
  name: string
  fromStateKey: string
  toStateKey: string
  requiredPermission?: string | null
  metadata?: Record<string, unknown>
}

export interface DefinitionDraftInput {
  key: string
  name: string
  description?: string | null
  states: StateDraftInput[]
  transitions: TransitionDraftInput[]
}

export function validateWorkflowDefinitionGraph(input: {
  states: StateDraftInput[]
  transitions: TransitionDraftInput[]
}): void {
  const { states, transitions } = input

  if (!states || states.length === 0) {
    throw new BadRequestException('Workflow definition must contain at least one state')
  }

  const stateKeys = new Set<string>()
  let initialCount = 0
  let terminalCount = 0

  for (const state of states) {
    const trimmedKey = state.key?.trim().toLowerCase()
    if (!trimmedKey) {
      throw new BadRequestException('State key cannot be empty')
    }
    if (stateKeys.has(trimmedKey)) {
      throw new BadRequestException(`Duplicate state key '${state.key}' in workflow definition`)
    }
    stateKeys.add(trimmedKey)

    if (state.isInitial) {
      initialCount++
    }
    if (state.isTerminal) {
      terminalCount++
    }

    if (state.isInitial && state.isTerminal) {
      throw new BadRequestException(
        `State '${state.key}' cannot be both initial and terminal in a workflow definition`,
      )
    }
  }

  if (initialCount !== 1) {
    throw new BadRequestException(
      `Workflow definition must have exactly one initial state, found ${initialCount}`,
    )
  }

  if (terminalCount === 0) {
    throw new BadRequestException('Workflow definition must have at least one terminal state')
  }

  // Validate transitions
  const transitionPairs = new Set<string>()

  for (const transition of transitions) {
    const trimmedKey = transition.key?.trim().toLowerCase()
    if (!trimmedKey) {
      throw new BadRequestException('Transition key cannot be empty')
    }

    const fromKey = transition.fromStateKey?.trim().toLowerCase()
    const toKey = transition.toStateKey?.trim().toLowerCase()

    if (!stateKeys.has(fromKey)) {
      throw new BadRequestException(
        `Transition '${transition.key}' references unknown fromState '${transition.fromStateKey}'`,
      )
    }
    if (!stateKeys.has(toKey)) {
      throw new BadRequestException(
        `Transition '${transition.key}' references unknown toState '${transition.toStateKey}'`,
      )
    }

    const pairKey = `${trimmedKey}:${fromKey}`
    if (transitionPairs.has(pairKey)) {
      throw new BadRequestException(
        `Duplicate transition '${transition.key}' from state '${transition.fromStateKey}'`,
      )
    }
    transitionPairs.add(pairKey)

    // A terminal state cannot have outgoing transitions
    const fromState = states.find((s) => s.key.trim().toLowerCase() === fromKey)
    if (fromState?.isTerminal) {
      throw new BadRequestException(
        `Terminal state '${transition.fromStateKey}' cannot have outgoing transitions (transition '${transition.key}')`,
      )
    }
  }
}
