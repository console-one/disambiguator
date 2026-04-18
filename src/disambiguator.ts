
import { Probability } from './probability.js';
import { Switch } from './switch.js';
import { Node } from './node.js';
import { NodeType, SwitchChild } from './types.js';
import { DisambiguatorDAO, RunValidation } from './interfaces.js';
import { Heap, reSortHeap, removeFromHeap } from './heap.js'
import { Comparator } from 'heap-js';
import { DisambiguatorInterface } from './interfaces.js';


const MAX_PARALLEL_DEFAULT = 5;
const SWITCH_FILTER_DEFAULT: SwitchFilter = () => true;

export type SwitchFilter = (s: Switch) => boolean;

export type DisambiguatorOptions = {
  max_parallel?: number,
  switchFilter?: SwitchFilter,
  dataAccessor: DisambiguatorDAO,
  runValidation?: RunValidation,
}

export class Disambiguator implements DisambiguatorInterface {

  private heap: Heap<Probability>;
  public lookupTable: { [id: string]: Probability } = {};
  private comparator: Comparator<Probability> = (a, b) => (b.weight - a.weight);   // backwards because it is a min heap
  private rootSwtich: Switch;
  private MAX_PARALLEL: number = MAX_PARALLEL_DEFAULT;    // arbitrary number denoting the max number of parallel executions
  private executions: Array<Promise<any>> = [];
  private nodeResults: { [nodeId: string]: boolean } = {};
  private switchFilter: SwitchFilter = SWITCH_FILTER_DEFAULT;
  public dataAccessor: DisambiguatorDAO;
  public runValidation?: RunValidation;

  constructor(
    public id: string,
    public getObjectToValidate: (type: NodeType, labels: Array<string>) => (Object | Promise<Object>),
    public handlers: Array<{ labels: Array<string>, result: boolean, cb: (result: boolean, id: string, labels: Array<string>) => any }>,
    options: DisambiguatorOptions
  ) {
    this.heap = new Heap<Probability>(this.comparator);
    this.dataAccessor = options.dataAccessor;
    this.runValidation = options.runValidation;
    if (options.max_parallel !== undefined) this.MAX_PARALLEL = options.max_parallel;
    if (options.switchFilter !== undefined) this.switchFilter = options.switchFilter;
  }

  public async setRootSwitch(): Promise<void> {
    const rootSwitchProps = await this.dataAccessor.getSwitch(this.id);
    this.rootSwtich = await Switch.constructFromDB(Switch.condition2SwitchChildClass(rootSwitchProps.type), this.id, this);
    this.addToHeap(this.rootSwtich);
  }

  public addToHeap(...heapNodes: Array<Probability>): void {
    const toPush: Array<Probability> = [];
    for (const node of heapNodes) {
      const id = node.id;
      if (this.lookupTable[id] === undefined) {
        this.lookupTable[id] = node;
        toPush.push(node);
      }
    }
    this.heap.push(...toPush);
  }

  public removeFromHeap(...heapNodes: Array<Probability>): void {
    const toRemove: Array<Probability> = [];
    for (const node of heapNodes) {
      const id = node.id;
      if (this.lookupTable[id] !== undefined) {
        toRemove.push(node);
      }
    }
    
    for (const node of toRemove) {
      const id = node.id;
      removeFromHeap(this.heap, n => n.id === id);
    }
  }

  private async executeHeaviestNode(...args: any[]): Promise<boolean> {
    const heaviestNode = this.heap.pop();
    if (heaviestNode.weight === 0) return false;
    if (heaviestNode instanceof Node || this.switchFilter(heaviestNode as Switch)) {
      await heaviestNode.execute(...args);
    }
    if (heaviestNode instanceof Node) {
      const result = heaviestNode.probability === 1 ? true : false;
      this.nodeResults[heaviestNode.id] = result;
    }
    reSortHeap(this.heap);
    return true;
  }

  public async execute(...args: any[]): Promise<boolean> {
    await this.setRootSwitch();

    while(!this.heap.isEmpty() && !this.rootSwtich.isShorted) {
      if (this.executions.length >= this.MAX_PARALLEL) {   // if there are a bunch of executions we must wait until one finishes
        const indexedExecutions = this.executions.map((p, index) =>
          p.then((value) => ({ index, value }))
        );
        const { index, value } = await Promise.race(indexedExecutions);
        const hasExecuted = value;
        if (!hasExecuted) break;  // the rest of the weights in the heap are somehow 0 and shouldn't be executed
        this.executions.splice(index, 1);
      }

      // once we reach here we know that there is room for another execution
      const execution = this.executeHeaviestNode(...args);
      this.executions.push(execution);
      if (this.heap.isEmpty() && this.executions.length > 0) await Promise.all(this.executions);
    }

    await Promise.all(this.executions);   // there still could be some cooking at this point so we have to wait for them all

    Object.entries(this.nodeResults).map(([nodeId, result]) => {
      this.dataAccessor.updateProbability(nodeId, result);
    });

    return this.rootSwtich.probability === 1;
  }

  public printTree(node: SwitchChild = this.rootSwtich, prefix: string = '', isLast: boolean = true, printMock: boolean = false): void {
    const conditionString = node instanceof Switch ? ` (c: ${node.condition})` : '';
    const probabilityString = ` (p: ${printMock ? (node as any).mockProbability : (node as any).probability}) (w: ${(node as any).weight})`;
    console.log(prefix + (isLast ? '└─ ' : '├─ ') + (node as any).id + conditionString + probabilityString);
    const children = (node instanceof Switch && node.childs !== undefined) ? node.childs : [];
    const newPrefix = prefix + (isLast ? '   ' : '│  ');
    for (let i = 0; i < children.length; i++) {
      this.printTree(children[i], newPrefix, i === children.length - 1, printMock);
    }
  }
}
