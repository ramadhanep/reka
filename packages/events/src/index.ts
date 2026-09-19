export interface RekaEvent {
  type: string
  occurredAt: Date
  payload: Record<string, unknown>
}
