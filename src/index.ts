// Core engine
export { Disambiguator } from './disambiguator.js'
export type { DisambiguatorOptions, SwitchFilter } from './disambiguator.js'

// Tree building blocks
export { Node } from './node.js'
export { Switch, registerSwitchImpl } from './switch.js'
// Importing switches.js registers the built-in combinators via its top-level side effect.
export { And, Or, Not } from './switches.js'
export { Probability } from './probability.js'

// Storage adapter contract + in-memory reference impl
export { InMemoryDisambiguatorDAO } from './impl/memory.js'
export type {
  DisambiguatorDAO,
  DisambiguatorInterface,
  NodeInterface,
  SwitchInterface,
  ProbabilityInterface,
  ExecutableRequirementInterface,
  RunValidation
} from './interfaces.js'

// Types + enums
export {
  Condition,
  NodeType
} from './types.js'

export type {
  Validation,
  NodeFn,
  NodeConstructor,
  SwitchChild,
  SwitchChilds,
  SwitchType,
  Handler,
  HandlerCB,
  ConditionRequirement,
  Requirement,
  NodeDBProps,
  SwitchDBProps,
  NodeCreationRequest,
  NodeUpdateRequest,
  SwitchCreationRequest,
  SwitchUpdateRequest,
  GetSwitchesRequest
} from './types.js'

// Utilities
export { isConditionRequirement } from './utils.js'
