// ─────────────────────────────────────────────────────────────────────────
// Not combinator inversion + AND short-circuit.
// ─────────────────────────────────────────────────────────────────────────

import {
  Disambiguator,
  InMemoryDisambiguatorDAO,
  NodeType,
  Condition,
  type RunValidation,
} from '../index.js';

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

export default async (test: (name: string, body: (validator: any) => any) => any) => {
  await test('NOT combinator inverts a true child to false', async (validator: any) => {
    const dao = new InMemoryDisambiguatorDAO();
    dao.seedNode({
      id: 'leaf', type: NodeType.assessableJSON, probability: 0.5,
      labels: [],
      executionInput: { field: 'x', expected: 1 } as any,
    });
    dao.seedSwitch({
      id: 'rootNot', type: Condition.NOT, probability: 0.5,
      labels: [], childIds: ['leaf'], size: 1,
    });
    const d = new Disambiguator(
      'rootNot',
      () => ({ x: 1 }),
      [],
      { dataAccessor: dao, runValidation, max_parallel: 1 },
    );
    return validator.expect(await d.execute()).toLookLike(false);
  });
};
