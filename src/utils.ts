/**
 * Structural check for a nested `{ condition, requirements }` node — used by
 * Switch construction to distinguish composite switch definitions from leaf
 * executable requirements.
 */
export function isConditionRequirement(arg: any): boolean {
  if (typeof arg !== 'object' || arg === null) return false

  const objectKeys = Object.keys(arg)
  const requiredKeys = ['condition', 'requirements']

  for (const key of objectKeys) {
    if (!requiredKeys.includes(key)) return false
  }

  for (const key of requiredKeys) {
    if (!objectKeys.includes(key)) return false
  }

  return true
}
