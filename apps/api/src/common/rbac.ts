export function missingPermissions(required: string[], granted: string[]): string[] {
  return required.filter((key) => !granted.includes(key))
}
