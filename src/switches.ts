import { Condition } from "./types.js";
import { SwitchChilds } from "./types.js";
import { Switch, registerSwitchImpl } from './switch.js'

export class And extends Switch {

  public condition = Condition.AND;

  private probabilityCache: number;
  
  public _calculateProbability = (childs: SwitchChilds): number => {
    return childs.reduce((curProb, child) => (curProb * (child as any).probability), 1);
  }

  public calculateProbability(childs: SwitchChilds): number {
    if (this.probabilityCache !== undefined) return this.probabilityCache;
    this.probabilityCache = this._calculateProbability(childs);
    return this.probabilityCache;
  }

  public calculateSubscribedUpdate = (oldProb: number, newProb: number): number => {
    this.invalidateCache()
    if (oldProb === 0) return 0;
    let newProbability = this.probability;
    newProbability /= oldProb;
    newProbability *= newProb;
    return newProbability;
  }
  public invalidateCache(): void {
    this.probabilityCache = undefined;
  }
}

export class Or extends Switch {
  public condition = Condition.OR;

  private probabilityCache: number;

  public _calculateProbability = (childs: SwitchChilds): number => {
    return 1 - childs.reduce((curProb, child) => (curProb * (1 - (child as any).probability)), 1);
  }

  public calculateProbability(childs: SwitchChilds): number {
    if (this.probabilityCache !== undefined) return this.probabilityCache;
    this.probabilityCache = this._calculateProbability(childs);
    return this.probabilityCache;
  }

  public calculateSubscribedUpdate = (oldProb: number, newProb: number): number => {
    this.invalidateCache()
    if (oldProb === 1) return 1;
    let newProbability = this.probability;
    newProbability = 1 - newProbability;
    newProbability /= (1 - oldProb);
    newProbability *= (1 - newProb);
    newProbability = 1 - newProbability;
    return newProbability;
  }

  public invalidateCache(): void {
    this.probabilityCache = undefined;
  }
}

export class Not extends Switch {
  public condition = Condition.NOT;

  public calculateProbability = (childs: SwitchChilds): number => {
    return childs[0] ? (childs[0] as any).probability : 0;
  }

  public calculateSubscribedUpdate = (_oldProb: number, newProb: number): number => {
    return 1 - newProb;
  }
}

// Register the built-in combinators so Switch.condition2SwitchChildClass
// can look them up at runtime.
registerSwitchImpl(Condition.AND, And)
registerSwitchImpl(Condition.OR,  Or)
registerSwitchImpl(Condition.NOT, Not)
