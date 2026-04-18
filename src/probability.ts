
import { DisambiguatorInterface, SwitchInterface } from "./interfaces.js";
import { Handler, HandlerCB } from "./types.js";
import { ProbabilityInterface } from "./interfaces.js";
import { Switch } from "./switch.js";

export abstract class Probability implements ProbabilityInterface {

  public abstract id: string;
  public listeners: Array<Probability> = [];
  public abstract calculateSubscribedUpdate: (oldProb: number, newProb: number) => number;
  public handlers: Array<Handler> = [];
  public parent: SwitchInterface;  // the parent in the current structure
  public parents: Array<SwitchInterface> = [];   // the parents of the object in the DB
  public executed: boolean = false;
  public isPruned: boolean = false;
  public belongsTo: DisambiguatorInterface;
  public labels: Array<string>;

  public size: number;
  public probability: number;
  public mockProbability: number;

  public get prunedOn1(): number {
    this.setMockProbability(1);
    const numPruned = this.parent ? Math.max(this.size, this.parent.mockPruned) : this.size;
    return numPruned;
  }

  public get prunedOn0(): number {
    this.setMockProbability(0);
    const numPruned = this.parent ? Math.max(this.size, this.parent.mockPruned) : this.size;
    return numPruned;
  }

  public get mockPruned(): number {
    if (this.isMockShorted) {
      const numPruned = this.parent ? Math.max(this.size, this.parent.mockPruned) : this.size;
      return numPruned;
    } else {
      return 0;
    }
  }

  public get weight(): number {   // used to order within the circuit heap
    if (this.executed) return 0;

    let weight = this.prunedOn1 * this.probability;
    weight += this.prunedOn0 * (1 - this.probability);
    return weight;
  }
  
  public handleSubscribedUpdate(subscribedOldProbability: number, subscribedNewProbability: number): void {
    if (this.isShorted) return;
    const newProbability = this.calculateSubscribedUpdate(subscribedOldProbability, subscribedNewProbability);
    this.setProbability(newProbability);
  }
  
  public handleMockSubscribedUpdate(subscribedOldProbability: number, subscribedNewProbability: number): void {
    const oldMockProbability = this.mockProbability;
    const newProbability = this.calculateSubscribedUpdate(subscribedOldProbability, subscribedNewProbability);
    this.mockProbability = newProbability;
    this.listeners.forEach(listener => listener.handleMockSubscribedUpdate(oldMockProbability, newProbability));
  }

  public resetMockProbability(): void {
    this.mockProbability = this.probability;
    if (this.parent) this.parent.resetMockProbability();
  }

  public setProbability(newProbability: number): void {
    if (this.isShorted) return;
    const oldProbability = this.probability;
    this.probability = newProbability;
    this.triggerHandlers();
    this.listeners.forEach(listener => listener.handleSubscribedUpdate(oldProbability, this.probability));
  }

  public setMockProbability(newMockProbability: number): void {
    this.resetMockProbability();  // I think we always want to reset this first
    const oldMockProbability = this.mockProbability;
    this.mockProbability = newMockProbability;
    this.listeners.forEach(listener => listener.handleMockSubscribedUpdate(oldMockProbability, newMockProbability));
  }

  public subtractSize(toSubtract?: number): void {
    if (this.isShorted) toSubtract = this.size;

    if (toSubtract !== undefined) {
      this.size -= toSubtract;
      if (this.parent) this.parent.subtractSize(toSubtract);
    }
  }
  
  public abstract initImpl(): Promise<void>;

  public async init(): Promise<void> {
    await this.getParentsFromDB();
    await this.initImpl();

    for (const handler of this.belongsTo.handlers) {
      let hasLabels = true;
      for (const label of handler.labels) {
        if (!this.labels.includes(label)) {
          hasLabels = false;
          break;
        }
      }
      if (hasLabels) this.addHandler((result) => handler.cb(result, this.id, this.labels), handler.result);
    }
  }

  public prune(): void {
    this.pruneImpl();
    this.belongsTo.removeFromHeap(this);
  }

  public abstract pruneImpl(): void;

  public async getParentsFromDB(): Promise<void> {
    if (this.parents !== undefined) return;

    const parentProps = await this.belongsTo.dataAccessor.getParentSwitches(this.id);
    this.parents = await Promise.all(parentProps.map(props => Switch.constructFromDB(Switch.condition2SwitchChildClass(props.type), props.id, this.belongsTo)));
  }

  public abstract executeImpl(...args: any[]): Promise<void>;

  public async execute(...args: any[]): Promise<void> {
    if (this.executed) throw new Error(`Node ${this.id} was already executed`);
    this.executed = true;

    const existingProb = this.belongsTo.lookupTable[this.id];
    if (existingProb !== this) {
      if (existingProb.isShorted) this.probability = existingProb.probability;
      else {
        const result = await new Promise((resolve) => {
          existingProb.addHandler((result) => resolve(result));
        });
        this.probability = result ? 1 : 0;
      }

      return;
    }

    await this.executeImpl(...args);
    this.subtractSize();
    await this.getParentsFromDB();
    this.belongsTo.addToHeap(...this.parents);
  }

  public get isShorted(): boolean {
    return this.probability === 1 || this.probability === 0;
  }

  public get isMockShorted(): boolean {
    return this.mockProbability === 1 || this.mockProbability === 0;
  }

  public addHandler(cb: HandlerCB, onResult?: boolean): void {
    if (onResult === undefined) {
      this.handlers.push({ onResult: true, cb });
      this.handlers.push({ onResult: false, cb });
    } else {
      this.handlers.push({ onResult, cb });
    }
  }

  public triggerHandlers(): void {
    if (!this.isShorted) return;

    for (let i = 0; i < this.handlers.length; ++i) {
      const handler = this.handlers[i];
      const onProbability = handler.onResult ? 1 : 0;
      if (onProbability === this.probability) {
        const result = this.probability === 1 ? true : false;   // this.probability must be 1 or 0 at this point
        handler.cb(result);
        this.handlers.splice(i, 1);
        --i;
      }
    }
  }
}