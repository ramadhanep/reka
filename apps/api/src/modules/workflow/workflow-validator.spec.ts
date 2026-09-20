import { describe, expect, it } from 'vitest'
import {
  validateWorkflowDefinitionGraph,
  type StateDraftInput,
  type TransitionDraftInput,
} from './workflow-validator.js'

describe('WorkflowValidator', () => {
  const validStates: StateDraftInput[] = [
    { key: 'draft', name: 'Draft', isInitial: true },
    { key: 'submitted', name: 'Submitted' },
    { key: 'approved', name: 'Approved', isTerminal: true },
    { key: 'rejected', name: 'Rejected', isTerminal: true },
  ]

  const validTransitions: TransitionDraftInput[] = [
    { key: 'submit', name: 'Submit', fromStateKey: 'draft', toStateKey: 'submitted' },
    { key: 'approve', name: 'Approve', fromStateKey: 'submitted', toStateKey: 'approved' },
    { key: 'reject', name: 'Reject', fromStateKey: 'submitted', toStateKey: 'rejected' },
  ]

  it('passes a well-formed workflow definition graph', () => {
    expect(() =>
      validateWorkflowDefinitionGraph({
        states: validStates,
        transitions: validTransitions,
      }),
    ).not.toThrow()
  })

  it('rejects an empty states array', () => {
    expect(() =>
      validateWorkflowDefinitionGraph({
        states: [],
        transitions: [],
      }),
    ).toThrow(/Workflow definition must contain at least one state/)
  })

  it('rejects an empty state key', () => {
    expect(() =>
      validateWorkflowDefinitionGraph({
        states: [{ key: '  ', name: 'Blank' }],
        transitions: [],
      }),
    ).toThrow(/State key cannot be empty/)
  })

  it('rejects duplicate state keys', () => {
    expect(() =>
      validateWorkflowDefinitionGraph({
        states: [
          { key: 'draft', name: 'Draft', isInitial: true },
          { key: 'DRAFT', name: 'Draft Duplicate', isTerminal: true },
        ],
        transitions: [],
      }),
    ).toThrow(/Duplicate state key 'DRAFT'/)
  })

  it('rejects a state that is marked as both initial and terminal', () => {
    expect(() =>
      validateWorkflowDefinitionGraph({
        states: [{ key: 'only', name: 'Only', isInitial: true, isTerminal: true }],
        transitions: [],
      }),
    ).toThrow(/cannot be both initial and terminal/)
  })

  it('rejects a workflow definition with no initial state', () => {
    expect(() =>
      validateWorkflowDefinitionGraph({
        states: [
          { key: 'review', name: 'Review' },
          { key: 'approved', name: 'Approved', isTerminal: true },
        ],
        transitions: [],
      }),
    ).toThrow(/must have exactly one initial state, found 0/)
  })

  it('rejects a workflow definition with multiple initial states', () => {
    expect(() =>
      validateWorkflowDefinitionGraph({
        states: [
          { key: 'draft', name: 'Draft', isInitial: true },
          { key: 'init2', name: 'Init 2', isInitial: true },
          { key: 'approved', name: 'Approved', isTerminal: true },
        ],
        transitions: [],
      }),
    ).toThrow(/must have exactly one initial state, found 2/)
  })

  it('rejects a workflow definition with no terminal states', () => {
    expect(() =>
      validateWorkflowDefinitionGraph({
        states: [
          { key: 'draft', name: 'Draft', isInitial: true },
          { key: 'review', name: 'Review' },
        ],
        transitions: [],
      }),
    ).toThrow(/must have at least one terminal state/)
  })

  it('rejects transitions with empty key', () => {
    expect(() =>
      validateWorkflowDefinitionGraph({
        states: validStates,
        transitions: [{ key: '', name: 'Empty', fromStateKey: 'draft', toStateKey: 'submitted' }],
      }),
    ).toThrow(/Transition key cannot be empty/)
  })

  it('rejects transitions referencing nonexistent fromState', () => {
    expect(() =>
      validateWorkflowDefinitionGraph({
        states: validStates,
        transitions: [
          { key: 'submit', name: 'Submit', fromStateKey: 'nonexistent', toStateKey: 'submitted' },
        ],
      }),
    ).toThrow(/references unknown fromState 'nonexistent'/)
  })

  it('rejects transitions referencing nonexistent toState', () => {
    expect(() =>
      validateWorkflowDefinitionGraph({
        states: validStates,
        transitions: [
          { key: 'submit', name: 'Submit', fromStateKey: 'draft', toStateKey: 'nonexistent' },
        ],
      }),
    ).toThrow(/references unknown toState 'nonexistent'/)
  })

  it('rejects duplicate transitions with same key and fromState', () => {
    expect(() =>
      validateWorkflowDefinitionGraph({
        states: validStates,
        transitions: [
          { key: 'approve', name: 'Approve', fromStateKey: 'submitted', toStateKey: 'approved' },
          {
            key: 'approve',
            name: 'Approve Dup',
            fromStateKey: 'submitted',
            toStateKey: 'approved',
          },
        ],
      }),
    ).toThrow(/Duplicate transition 'approve' from state 'submitted'/)
  })

  it('rejects outgoing transitions from terminal states', () => {
    expect(() =>
      validateWorkflowDefinitionGraph({
        states: validStates,
        transitions: [
          { key: 'submit', name: 'Submit', fromStateKey: 'draft', toStateKey: 'submitted' },
          { key: 'reopen', name: 'Reopen', fromStateKey: 'approved', toStateKey: 'draft' },
        ],
      }),
    ).toThrow(/Terminal state 'approved' cannot have outgoing transitions/)
  })
})
