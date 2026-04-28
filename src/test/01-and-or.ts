// ─────────────────────────────────────────────────────────────────────────
// Decision tree with AND/OR combinators executed against a probe object.
// Mirrors the smoke's happy-path cases.
// ─────────────────────────────────────────────────────────────────────────

import {
  Disambiguator,
  InMemoryDisambiguatorDAO,
  NodeType,
  Condition,
  type RunValidation,
} from '../index.js';

async function buildTree() {
  const dao = new InMemoryDisambiguatorDAO();
  dao.seedNode({
    id: 'u1', type: NodeType.assessableJSON, probability: 0.5,
    labels: ['userId'],
    executionInput: { field: 'user.id', expected: 'alice' } as any,
  });
  dao.seedNode({
    id: 'admin', type: NodeType.assessableJSON, probability: 0.5,
    labels: ['role'],
    executionInput: { field: 'user.role', expected: 'admin' } as any,
  });
  dao.seedNode({
    id: 'guest', type: NodeType.assessableJSON, probability: 0.5,
    labels: ['role'],
    executionInput: { field: 'user.role', expected: 'guest' } as any,
  });
  dao.seedSwitch({
    id: 'orAccess', type: Condition.OR, probability: 0.5,
    labels: ['access'], childIds: ['admin', 'guest'], size: 2,
  });
  dao.seedSwitch({
    id: 'rootAnd', type: Condition.AND, probability: 0.5,
    labels: ['root'], childIds: ['u1', 'orAccess'], size: 2,
  });
  return dao;
}

const runValidation: RunValidation = (_type, executionInput, toValidate) => {
  const { field, expected } = executionInput as { field: string; expected: any };
  const parts = field.split('.');
  let cur: any = toValidate;
  for (const p of parts) {
    if (cur == null) return false;
    cur = cur[p];
  }
  return cur === expected;
};

async function runOnce(probe: any): Promise<boolean> {
  const dao = await buildTree();
  const d = new Disambiguator(
    'rootAnd',
    () => probe,
    [],
    { dataAccessor: dao, runValidation, max_parallel: 3 },
  );
  return d.execute();
}

export default async (test: (name: string, body: (validator: any) => any) => any) => {
  await test('alice + admin → true (user matches; admin branch resolves)', async (validator: any) => {
    const result = await runOnce({ user: { id: 'alice', role: 'admin' } });
    return validator.expect(result).toLookLike(true);
  });

  await test('alice + guest → true (OR resolves via the guest leaf)', async (validator: any) => {
    const result = await runOnce({ user: { id: 'alice', role: 'guest' } });
    return validator.expect(result).toLookLike(true);
  });
};
