import { Condition, Validation } from "./types.js";
import { GetSwitchesRequest, Handler, HandlerCB, NodeCreationRequest, NodeDBProps, NodeType, NodeUpdateRequest, Requirement, SwitchChild, SwitchChilds, SwitchCreationRequest, SwitchDBProps, SwitchType, SwitchUpdateRequest } from "./types.js";
import { isConditionRequirement } from "./utils.js";


export interface DisambiguatorDAO {
  //___Create___//
  createNode(nodeProps: NodeCreationRequest): Promise<void>;

  createSwtich(switchProps: SwitchCreationRequest): Promise<void>;


  //___Read___//
  getNode(id: string): Promise<NodeDBProps>;

  getSwitch(id: string): Promise<SwitchDBProps>;

  getSwitches(query: GetSwitchesRequest): AsyncGenerator<SwitchDBProps, void, void>;

  getParentSwitches(id: string): Promise<Array<SwitchDBProps>>;


  //___Update___//
  addSwitchChild(
    switchId: string,
    childId: string
  ): Promise<void>;

  removeSwitchChild(
    switchId: string,
    childId: string
  ): Promise<boolean>;

  updateProbability(
    id: string,
    executionResult: boolean
  ): Promise<number>;
  
  updateNode(nodeProps: NodeUpdateRequest): Promise<void>;

  updateSwitch(switchProps: SwitchUpdateRequest): Promise<void>;


  //___Delete___//
  deleteNode(id: string): Promise<boolean>;

  deleteSwitch(id: string): Promise<boolean>;
}

/**
 * User-supplied leaf validator. Called for each Node leaf at execution time;
 * returns true if the node's executionInput validates against the object to
 * validate, false otherwise. Type is the NodeType — use it to dispatch between
 * different validation strategies (e.g. schema-based for 'assessableJSON',
 * aggregator-based for 'aggregation').
 */
export type RunValidation = (
  type: NodeType,
  executionInput: any,
  toValidate: any
) => boolean | Promise<boolean>

export interface DisambiguatorInterface {
  lookupTable: { [id: string]: ProbabilityInterface };
  id: string;
  dataAccessor: DisambiguatorDAO;
  runValidation?: RunValidation;
  getObjectToValidate: (type: NodeType, labels: Array<string>) => (Object | Promise<Object>);
  handlers: Array<{ labels: Array<string>, result: boolean, cb: (result: boolean, id: string, labels: Array<string>) => any }>;
  setRootSwitch(): Promise<void>;
  addToHeap(...heapNodes: Array<ProbabilityInterface>): void;
  removeFromHeap(...heapNodes: Array<ProbabilityInterface>): void;
  execute(...args: any[]): Promise<boolean>;
  printTree(node: SwitchChild, prefix: string, isLast: boolean, printMock: boolean): void;
}

export interface ProbabilityInterface {
  id: string;
  listeners: Array<ProbabilityInterface>;
  parent: SwitchInterface;  // the parent in the current structure
  parents: Array<SwitchInterface>;   // the parents of the object in the DB
  executed: boolean;
  isPruned: boolean;
  belongsTo: DisambiguatorInterface;
  labels: Array<string>;
  handlers: Array<Handler>;
  size: number;
  probability: number;
  mockProbability: number;

  get prunedOn1(): number;

  get prunedOn0(): number;

  get mockPruned(): number;

  get weight(): number;

  handleSubscribedUpdate(subscribedOldProbability: number, subscribedNewProbability: number): void;

  handleMockSubscribedUpdate(subscribedOldProbability: number, subscribedNewProbability: number): void;

  resetMockProbability(): void;

  setProbability(newProbability: number): void;

  setMockProbability(newMockProbability: number): void;

  subtractSize(toSubtract?: number): void;

  initImpl(): Promise<void>;

  init(): Promise<void>;

  prune(): void;

  pruneImpl(): void;

  executeImpl(...args: any[]): Promise<void>;

  execute(...args: any[]): Promise<void>;

  get isShorted(): boolean;

  get isMockShorted(): boolean;

  addHandler(cb: HandlerCB, onResult?: boolean): void;

  getParentsFromDB(): Promise<void>;

  calculateSubscribedUpdate: (oldProb: number, newProb: number) => number;

  triggerHandlers(): void;
}

export interface NodeInterface extends ProbabilityInterface {
  occurrences: number;   // number of times the Node is found in the tree of a Disambiguator
  mockOccurrences: number;   // number of times the Node is found in the tree of a Disambiguator
  executed: boolean;

  id: string,

  type: NodeType;

  executionInput: any;

  resetMockOccurrences(): void;
}

export interface SwitchInterface extends ProbabilityInterface {
  childs: SwitchChilds;

  condition: Condition;

  id: string,

  calculateProbability(childs: SwitchChilds): number;

  getChildrenFromDB(): Promise<void>;
}

export interface ExecutableRequirementInterface<T> {
  id: string; 

  type: string;

  execute(arg: T): boolean | Promise<boolean>;
}