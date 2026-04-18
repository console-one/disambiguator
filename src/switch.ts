
import { Condition } from './types.js';
import { Probability } from './probability.js';
import { DisambiguatorInterface, SwitchInterface } from './interfaces.js';
import { SwitchChilds } from './types.js';
import { Node } from './node.js';

const switchCache = new Map<string, Switch>();

export type SwitchConstructor = new (...args: any[]) => Switch;

export abstract class Switch extends Probability implements SwitchInterface {

  private childIds: Array<string>;
  public childs: SwitchChilds;

  public abstract condition: Condition;

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
  
  public static async constructFromDB(ctor: SwitchConstructor, id: string, belongsTo: DisambiguatorInterface): Promise<Switch> {
    if (switchCache.has(id)) {
      return switchCache.get(id);
    }
    const theSwitch = new ctor(id, belongsTo);
    await theSwitch.init();
    switchCache.set(id, theSwitch);
    return theSwitch;
  }

  public abstract calculateProbability(childs: SwitchChilds): number;

  public async initImpl(): Promise<void> {

    const theSwitch = await this.belongsTo.dataAccessor.getSwitch(this.id);

    // init fields
    this.size = theSwitch.size;
    this.probability = theSwitch.probability;
    this.labels = theSwitch.labels;
    this.childIds = theSwitch.childIds;
    this.childs = [];
  }

  public async executeImpl(): Promise<void> {
    if (this.isPruned) return;   // should not run in this case
    await this.getChildrenFromDB(); // sets the childs property
    if (this.isPruned) return;
    this.belongsTo.addToHeap(...this.childs as any[]);
  }

  public pruneImpl(): void {
    if (this.isPruned) return;
    this.isPruned = true;
    if (this.childs === undefined) return;
    for (const child of this.childs) {
      (child as any).pruneImpl();
    }
  }

  public async getChildrenFromDB(): Promise<void> {
    for (const id of this.childIds) {
      // Try node first, fall back to switch. The original had
      // `getNode(id) !== undefined` which is always truthy (it returns a
      // Promise), meaning every child was misidentified as a Node.
      let resolved = false
      try {
        const nodeProps = await this.belongsTo.dataAccessor.getNode(id)
        if (nodeProps) {
          const child = await Node.constructFromDB(id, this.belongsTo);
          this.childs.push(child);
          resolved = true
        }
      } catch {
        // not a node
      }
      if (!resolved) {
        const switchProps = await this.belongsTo.dataAccessor.getSwitch(id);
        const child = await Switch.constructFromDB(Switch.condition2SwitchChildClass(switchProps.type), id, this.belongsTo);
        this.childs.push(child);
      }
    }

    for (const child of this.childs) {
      (child as any).listeners.push(this);
    }
  }

  /**
   * Look up the concrete Switch subclass for a given Condition.
   * Concrete subclasses (And/Or/Not in switches.ts) register themselves at
   * module load via `registerSwitchImpl`. This avoids importing switches.ts
   * from switch.ts (which is a cycle ESM can't unwind).
   */
  public static condition2SwitchChildClass(condition: Condition): SwitchConstructor {
    const ctor = switchImplRegistry.get(condition);
    if (!ctor) {
      throw new Error(
        `No Switch implementation registered for Condition.${condition}. ` +
        `Import 'switches.js' (which registers And/Or/Not) before building the engine.`
      );
    }
    return ctor;
  }
}

const switchImplRegistry = new Map<Condition, SwitchConstructor>()

/**
 * Register a Switch subclass for a Condition. Called from switches.ts at
 * module load for the built-in combinators. Users who define custom
 * combinators call this from their own module too.
 */
export function registerSwitchImpl(condition: Condition, ctor: SwitchConstructor): void {
  switchImplRegistry.set(condition, ctor)
}
