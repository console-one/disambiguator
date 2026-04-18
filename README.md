# @console-one/disambiguator

A heap-based, probabilistic decision-tree executor. Build a tree of `AND`/`OR`/`NOT` switches over weighted leaf nodes; supply a validator function for the leaves; `.execute()` walks the tree in parallel-greedy-weighted order, resolves leaves via your validator, propagates probabilities up the tree, and short-circuits dead branches.

Not quite a rule engine, not quite a Bayesian network — it's an evaluator for decision trees where **each node has a probability**, execution order is prioritized by probability × node weight, and resolved outcomes flow back up through logical combinators.

Use cases (from the original design doc):

- Authorization trees where permissions cascade through nested AND/OR clauses
- Medical-diagnosis-style decision trees where leaf probabilities change as evidence accumulates
- ML classification pipelines where early nodes prune expensive later branches
- Fraud / risk scoring where combining signals follows a declared logic tree

## Install

```bash
npm install @console-one/disambiguator
```

## Quick start

```ts
import {
  Disambiguator,
  InMemoryDisambiguatorDAO,
  NodeType,
  Condition,
  type RunValidation
} from '@console-one/disambiguator'

// 1. Build a DAO, seed the tree:
//    rootAnd
//      ├── userNode (matches user.id === 'alice')
//      └── orAccess
//            ├── adminNode (matches user.role === 'admin')
//            └── guestNode (matches user.role === 'guest')
const dao = new InMemoryDisambiguatorDAO()
  .seedNode({
    id: 'user', type: NodeType.assessableJSON, probability: 0.5,
    labels: ['userId'],
    executionInput: { field: 'user.id', expected: 'alice' } as any
  })
  .seedNode({
    id: 'admin', type: NodeType.assessableJSON, probability: 0.5,
    labels: ['role'],
    executionInput: { field: 'user.role', expected: 'admin' } as any
  })
  .seedNode({
    id: 'guest', type: NodeType.assessableJSON, probability: 0.5,
    labels: ['role'],
    executionInput: { field: 'user.role', expected: 'guest' } as any
  })
  .seedSwitch({
    id: 'orAccess', type: Condition.OR, probability: 0.5,
    labels: ['access'], childIds: ['admin', 'guest'], size: 2
  })
  .seedSwitch({
    id: 'rootAnd', type: Condition.AND, probability: 0.5,
    labels: ['root'], childIds: ['user', 'orAccess'], size: 2
  })

// 2. Supply a leaf validator. The engine calls this for each Node as it
//    resolves; return true/false (or a Promise of the same).
const runValidation: RunValidation = (_type, input, toValidate) => {
  const { field, expected } = input as { field: string; expected: any }
  return field.split('.').reduce((v, k) => v?.[k], toValidate) === expected
}

// 3. Execute.
const d = new Disambiguator(
  'rootAnd',
  () => ({ user: { id: 'alice', role: 'admin' } }),
  [],
  { dataAccessor: dao, runValidation, max_parallel: 3 }
)
const result = await d.execute()
// true — user matched + admin matched → AND → true
```

## How it works

1. `execute()` loads the root Switch via the DAO.
2. Root and its children are added to a min-heap ordered by `(-weight)` — the "most promising unresolved node" is always at the top.
3. The engine pops up to `max_parallel` nodes at a time and executes them in parallel.
4. When a Node resolves, its probability becomes 0 or 1 and its parent Switch recalculates its own probability via `calculateProbability(children)`.
5. Updated probabilities propagate through subscriber chains to all ancestors.
6. Pruned / resolved branches are removed from the heap; the loop continues until the heap is empty or the root has "shorted" (hit a terminal state for its combinator).

## Public surface

- `Disambiguator` — the executor. Constructor: `(id, getObjectToValidate, handlers, options)`.
  - `options.dataAccessor` — required. Anything implementing `DisambiguatorDAO`.
  - `options.runValidation` — required for leaves. `(type, executionInput, toValidate) => boolean | Promise<boolean>`.
  - `options.max_parallel` — default 5.
  - `options.switchFilter` — optionally gate which Switches get executed.
- `InMemoryDisambiguatorDAO` — reference storage impl. Stores nodes and switches in Maps; includes a `.seedNode()` / `.seedSwitch()` fluent builder for tests.
- `Node`, `Switch`, `And`, `Or`, `Not`, `Probability` — tree building blocks. Subclass for custom combinators; register via `registerSwitchImpl(condition, ctor)`.
- `Condition` enum (`AND | OR | NOT`), `NodeType` enum (`assessableJSON | aggregation`).
- `DisambiguatorDAO` interface — implement against Redis, Postgres, Neo4j, etc.
- `RunValidation` type — caller-supplied leaf validator.
- Types: `Validation`, `NodeDBProps`, `SwitchDBProps`, `ConditionRequirement`, `Requirement`, `Handler`, and the CRUD request shapes.

## Storage adapters

The engine operates against `DisambiguatorDAO` — never against a specific vendor. The `InMemoryDisambiguatorDAO` (shipped) is the reference adapter; for production, implement the same interface against Redis / Postgres / Neo4j / Dynamo. The interface has 13 methods (5 CRUD × 2 entity types + 3 helpers), roughly 150 lines to implement.

The original source in the monorepo included a Neo4j-backed implementation (`impl/neo4j.ts`, ~300 lines) that used Cypher queries to express the tree. That implementation isn't shipped here — it pulled in `neo4j-driver` + `dotenv` as hard dependencies and was tied to environment-variable configuration. Reimplementing against Neo4j with the interface above is straightforward if you need it.

## Layout

```
src/
├── index.ts                # Public surface
├── smoke.ts                # End-to-end smoke test
├── disambiguator.ts        # The executor
├── node.ts                 # Leaf Node class
├── switch.ts               # Abstract Switch base + registry
├── switches.ts             # And / Or / Not concrete combinators
├── probability.ts          # Probability propagation machinery
├── heap.ts                 # Heap helpers (init/resort/remove)
├── interfaces.ts           # DisambiguatorDAO, RunValidation, …
├── types.ts                # Enums + DB prop types
├── utils.ts                # isConditionRequirement predicate
└── impl/
    └── memory.ts           # InMemoryDisambiguatorDAO reference impl
```

## Smoke test

```bash
npm install
npm run build
npm run smoke
```

Asserts the engine runs end-to-end against the in-memory DAO, with AND + OR combinators resolving to `true` under matching inputs.

## Known limitations

- **Probability-propagation math in `And` / `Or` assumes the seeded initial probabilities on Switch nodes match the formula applied to children's initial probabilities.** If your seeded Switch probability differs from `reduce(childs, product)`, the incremental update formula (`newProb = this.probability / oldProb * newProb`) can drift and short-circuit prematurely. The safest seeding pattern for a fresh tree is: set all leaf probabilities to the same value `p`, set AND switches to `p^n`, and set OR switches to `1 - (1 - p)^n` — i.e., pre-compute the derived probabilities rather than blanket-seeding everything to 0.5. A proper fix would initialize Switch probabilities lazily from children at tree-load time; that's a behavior change beyond extraction scope.
- **The `aggregation` NodeType** in the original code dispatched to an `runAggregator` helper that depended on the unshipped event-based transpiler and had a `// TODO: implement this function` marker on its core. Dropped. Supply your own runValidation for `NodeType.aggregation` if you want to keep that branch.
- **Node / Switch caches are module-globals.** Two Disambiguator instances operating on the same node id will share the same cached instance. Fine for most uses; be aware if you reset state between tests.

## Credit

The design, algorithm, and original implementation are by **Jayden Nikifork** in `src/core/authorization/disambiguator/` on the `transpilationNation` branch of the Console One monorepo (commit `edc46fa34`, 2024-08-23). This package ports that work to a standalone module with the Neo4j-specific DAO dropped in favor of a pluggable storage adapter.

The original README in that directory (281 lines) covers prior-art comparison, use cases across medical diagnosis / fraud detection / ML / financial risk, and patent-opportunity notes. It's preserved in `ORIGINAL_README.md` alongside this one.

## License

MIT
