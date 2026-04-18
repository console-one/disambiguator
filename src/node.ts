import { Probability } from "./probability.js";
import { NodeInterface, DisambiguatorInterface } from "./interfaces.js";
import { NodeType } from "./types.js";

const nodeCache = new Map<string, NodeInterface>();

export class Node extends Probability implements NodeInterface {
  public occurrences: number = 0;   // number of times the Node is found in the tree of a Disambiguator
  public mockOccurrences: number = 0;   // number of times the Node is found in the tree of a Disambiguator
  public executed: boolean = false;
  public executionInput: any;
  public type: NodeType;

  constructor(
    public id: string,
    belongsTo: DisambiguatorInterface,
  ) {
    super();
    this.addHandler(() => {
      this.pruneImpl();
    });
    this.belongsTo = belongsTo;
  }

  public static async constructFromDB(
    id: string,
    belongsTo: DisambiguatorInterface,
  ): Promise<Node> {
    if (nodeCache.has(id)) {
      return nodeCache.get(id);
    }
    const node = new Node(id, belongsTo);
    await node.init();
    nodeCache.set(id, node);
    return node;
  }

  public async initImpl(): Promise<void> {
    const node = await this.belongsTo.dataAccessor.getNode(this.id);

    // init fields
    this.size = 1;
    this.probability = node.probability;
    this.executionInput = node.executionInput;
    this.labels = node.labels;
  }

  // blud subscribes to nothing so we can leave this empty, should find some way to
  // inherit better so we don't need to do this
  public calculateSubscribedUpdate = (_oldProb: number, _newProb: number): number => { return 0.5 }

  public async executeImpl(..._args: any[]): Promise<void> {
    const toValidate = this.belongsTo.getObjectToValidate(this.type, this.labels);
    const runValidation = this.belongsTo.runValidation;
    if (!runValidation) {
      throw new Error(
        `Disambiguator was constructed without a runValidation callback. ` +
        `Pass one in the options to evaluate Node leaves.`
      );
    }
    const result = await runValidation(this.type, this.executionInput, toValidate);
    const newProbability = result ? 1 : 0;
    this.setProbability(newProbability);
    this.listeners = [];
  }

  public pruneImpl(): void { this.isPruned = true; }

  public resetMockOccurrences(): void { this.mockOccurrences = this.occurrences; }
}
