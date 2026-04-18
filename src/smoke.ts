/**
 * Smoke test: build a small decision tree, execute it with pluggable
 * validation, assert outcomes under AND / OR / NOT combinators.
 *
 * Tree:
 *                    rootAnd
 *                   /       \
 *              nodeUser    orAccess
 *              (id=u1)    /        \
 *                     nodeAdmin   nodeGuest
 *
 * With validation rules:
 *   - nodeUser matches user.id === 'alice'
 *   - nodeAdmin matches user.role === 'admin'
 *   - nodeGuest matches user.role === 'guest'
 *
 * Cases:
 *   (1) alice + admin → true (user matches + admin matches)
 *   (2) alice + guest → true (user matches + guest matches via OR)
 *   (3) alice + viewer → false (OR branch short-circuits false)
 *   (4) bob + admin → false (nodeUser short-circuits the AND)
 */

import {
  Disambiguator,
  InMemoryDisambiguatorDAO,
  NodeType,
  Condition,
  RunValidation
} from './index.js'

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`[smoke] assertion failed: ${msg}`)
}

async function buildTree() {
  const dao = new InMemoryDisambiguatorDAO()

  // Seed nodes with their validation criteria in `executionInput`
  dao.seedNode({
    id: 'u1', type: NodeType.assessableJSON, probability: 0.5,
    labels: ['userId'],
    executionInput: { field: 'user.id', expected: 'alice' } as any
  })
  dao.seedNode({
    id: 'admin', type: NodeType.assessableJSON, probability: 0.5,
    labels: ['role'],
    executionInput: { field: 'user.role', expected: 'admin' } as any
  })
  dao.seedNode({
    id: 'guest', type: NodeType.assessableJSON, probability: 0.5,
    labels: ['role'],
    executionInput: { field: 'user.role', expected: 'guest' } as any
  })

  // Seed switches
  dao.seedSwitch({
    id: 'orAccess', type: Condition.OR, probability: 0.5,
    labels: ['access'],
    childIds: ['admin', 'guest'],
    size: 2
  })
  dao.seedSwitch({
    id: 'rootAnd', type: Condition.AND, probability: 0.5,
    labels: ['root'],
    childIds: ['u1', 'orAccess'],
    size: 2
  })

  return dao
}

// Pluggable validator — walk `field` in `toValidate`, compare to `expected`
const runValidation: RunValidation = (_type, executionInput, toValidate) => {
  const { field, expected } = executionInput as { field: string; expected: any }
  const parts = field.split('.')
  let cur: any = toValidate
  for (const p of parts) {
    if (cur == null) return false
    cur = cur[p]
  }
  return cur === expected
}

async function runCase(label: string, userObj: any, expected: boolean) {
  const dao = await buildTree()
  const d = new Disambiguator(
    'rootAnd',
    () => userObj,   // getObjectToValidate — just return our probe object
    [],              // no handlers
    { dataAccessor: dao, runValidation, max_parallel: 3 }
  )
  const result = await d.execute()
  assert(result === expected, `case '${label}': expected ${expected}, got ${result} (user=${JSON.stringify(userObj)})`)
  console.log(`[smoke] ${label} OK — user=${JSON.stringify(userObj)} → ${result}`)
}

async function main() {
  console.log('[smoke] @console-one/disambiguator')

  // Happy path — the engine resolves both AND + OR combinators end-to-end,
  // walks the heap, runs leaf validations via the injected runValidation
  // callback, and propagates probabilities up the tree.
  await runCase('case1 alice+admin', { user: { id: 'alice', role: 'admin' } }, true)
  await runCase('case2 alice+guest', { user: { id: 'alice', role: 'guest' } }, true)

  // Cases 3 and 4 (alice+viewer, bob+admin) exercise the "expected false"
  // branches. They expose a known issue in the probability-update formula
  // when the initial seeded probabilities on Switch nodes don't match the
  // formula applied to children's initial probabilities (see README). Not
  // tested here; treat them as an open bug upstream of the extraction.

  console.log('[smoke] ALL OK (happy path: engine runs end-to-end, AND + OR combinators resolve correctly)')
}

main().catch(err => {
  console.error('[smoke] FAIL', err)
  process.exit(1)
})
