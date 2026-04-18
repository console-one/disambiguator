import { ExecutableRequirementInterface, ProbabilityInterface, SwitchInterface } from "./interfaces.js";
import type { Node } from "./node.js";

/** 4-tuple assessment clause, e.g. `['@user.id', 'IS', 'alice']`. Opaque to this
 * package — supply your own validator via `Disambiguator.options.runValidation`. */
export type Validation = [any, any, any, any?];

/** Logical combinator at a Switch node.
 * - AND: all children must resolve true.
 * - OR: any child resolving true is sufficient.
 * - NOT: inverts the single child's result. */
export enum Condition {
  AND = "AND",
  OR = "OR",
  NOT = "NOT"
}

export type NodeFn = (...args: any[]) => boolean | Promise<boolean>;
export type NodeConstructor = new (...args: any[]) => Node;
export enum NodeType {
  assessableJSON = 'assessableJSON',
  aggregation = 'aggregation'
}

export type SwitchChild = SwitchInterface | Node | ProbabilityInterface;
export type SwitchChilds = Array<SwitchChild>;

export type HandlerCB = (result: boolean) => any
export type Handler = {
  onResult: boolean,
  cb: HandlerCB
}

export type SwitchType = Condition;
export type SwitchDBProps = {
  id: string,
  type: SwitchType,
  probability: number,
  labels: Array<string>,
  childIds: Array<string>,
  size: number
}

export type NodeDBProps = {
  id: string,
  type: NodeType,
  probability: number,
  executionInput: any,
  labels: Array<string>
}

export type ConditionRequirement<T> = {
  id: string,
  condition: SwitchType,
  requirements: Requirement<T>[]
}

export type Requirement<T> = ConditionRequirement<T> | ExecutableRequirementInterface<T>;



export type NodeCreationRequest = {
  id: string,
  type: NodeType,
  labels: Array<string>
}

export type SwitchCreationRequest = {
  id: string,
  type: SwitchType,
  labels: Array<string>,
  childIds: Array<string>
}

export type NodeUpdateRequest = {
  id: string,
  type?: NodeType,
  labels?: Array<string>
}

export type SwitchUpdateRequest = {
  id: string,
  type?: SwitchType,
  labels?: Array<string>,
  childIds?: Array<string>
}

export type GetSwitchesRequest = {
  id?: string,
  type?: SwitchType,
  labels?: Array<string>,
  childIds?: Array<string>
}