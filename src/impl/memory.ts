import { Condition, NodeDBProps, SwitchDBProps, NodeCreationRequest, NodeUpdateRequest, SwitchCreationRequest, SwitchUpdateRequest, GetSwitchesRequest, NodeType } from '../types.js'
import { DisambiguatorDAO } from '../interfaces.js'

/**
 * In-memory reference implementation of DisambiguatorDAO.
 *
 * Stores nodes and switches in plain Maps. Initial probabilities default to
 * 0.5 (maximally uncertain); updateProbability nudges them toward 0 or 1
 * based on execution outcome — a simple Bayesian-style update that callers
 * can override by subclassing.
 *
 * Good for tests, agent sandboxes, and cases where the decision tree is
 * small enough to hold in memory. For durable/distributed trees, implement
 * DisambiguatorDAO against Redis, Postgres, or Neo4j.
 */
export class InMemoryDisambiguatorDAO implements DisambiguatorDAO {
  private switches = new Map<string, SwitchDBProps>()
  private nodes = new Map<string, NodeDBProps>()
  private parentOf = new Map<string, Set<string>>() // childId -> parent switch ids

  // ── Seed helpers ─────────────────────────────────────────────────────────

  seedNode(props: NodeDBProps): this {
    this.nodes.set(props.id, { ...props })
    return this
  }

  seedSwitch(props: SwitchDBProps): this {
    this.switches.set(props.id, { ...props, childIds: [...props.childIds] })
    for (const c of props.childIds) {
      const ps = this.parentOf.get(c) ?? new Set<string>()
      ps.add(props.id)
      this.parentOf.set(c, ps)
    }
    return this
  }

  // ── Create ───────────────────────────────────────────────────────────────

  async createNode(req: NodeCreationRequest): Promise<void> {
    this.nodes.set(req.id, {
      id: req.id,
      type: req.type,
      probability: 0.5,
      executionInput: undefined,
      labels: [...req.labels]
    })
  }

  async createSwtich(req: SwitchCreationRequest): Promise<void> {
    this.switches.set(req.id, {
      id: req.id,
      type: req.type,
      probability: 0.5,
      labels: [...req.labels],
      childIds: [...req.childIds],
      size: req.childIds.length
    })
    for (const c of req.childIds) {
      const ps = this.parentOf.get(c) ?? new Set<string>()
      ps.add(req.id)
      this.parentOf.set(c, ps)
    }
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  async getNode(id: string): Promise<NodeDBProps> {
    const n = this.nodes.get(id)
    if (!n) throw new Error(`Node not found: ${id}`)
    return { ...n, labels: [...n.labels] }
  }

  async getSwitch(id: string): Promise<SwitchDBProps> {
    const s = this.switches.get(id)
    if (!s) throw new Error(`Switch not found: ${id}`)
    return { ...s, labels: [...s.labels], childIds: [...s.childIds] }
  }

  async *getSwitches(query: GetSwitchesRequest): AsyncGenerator<SwitchDBProps, void, void> {
    for (const s of this.switches.values()) {
      if (query.id !== undefined && s.id !== query.id) continue
      if (query.type !== undefined && s.type !== query.type) continue
      if (query.labels && !query.labels.every(l => s.labels.includes(l))) continue
      if (query.childIds && !query.childIds.every(c => s.childIds.includes(c))) continue
      yield { ...s, labels: [...s.labels], childIds: [...s.childIds] }
    }
  }

  async getParentSwitches(id: string): Promise<Array<SwitchDBProps>> {
    const parents = this.parentOf.get(id) ?? new Set<string>()
    const out: SwitchDBProps[] = []
    for (const pid of parents) {
      const s = this.switches.get(pid)
      if (s) out.push({ ...s, labels: [...s.labels], childIds: [...s.childIds] })
    }
    return out
  }

  // ── Update ───────────────────────────────────────────────────────────────

  async addSwitchChild(switchId: string, childId: string): Promise<void> {
    const s = this.switches.get(switchId)
    if (!s) throw new Error(`Switch not found: ${switchId}`)
    if (!s.childIds.includes(childId)) {
      s.childIds.push(childId)
      s.size = s.childIds.length
    }
    const ps = this.parentOf.get(childId) ?? new Set<string>()
    ps.add(switchId)
    this.parentOf.set(childId, ps)
  }

  async removeSwitchChild(switchId: string, childId: string): Promise<boolean> {
    const s = this.switches.get(switchId)
    if (!s) return false
    const idx = s.childIds.indexOf(childId)
    if (idx < 0) return false
    s.childIds.splice(idx, 1)
    s.size = s.childIds.length
    this.parentOf.get(childId)?.delete(switchId)
    return true
  }

  /**
   * Simple Bayesian-style update: nudge probability toward 0 or 1 based on
   * execution result. Override in a subclass for a smarter learner.
   */
  async updateProbability(id: string, executionResult: boolean): Promise<number> {
    const target = executionResult ? 1 : 0
    const alpha = 0.5
    const node = this.nodes.get(id)
    if (node) {
      node.probability = (1 - alpha) * node.probability + alpha * target
      return node.probability
    }
    const sw = this.switches.get(id)
    if (sw) {
      sw.probability = (1 - alpha) * sw.probability + alpha * target
      return sw.probability
    }
    throw new Error(`No node or switch found for id: ${id}`)
  }

  async updateNode(req: NodeUpdateRequest): Promise<void> {
    const n = this.nodes.get(req.id)
    if (!n) throw new Error(`Node not found: ${req.id}`)
    if (req.type !== undefined) n.type = req.type
    if (req.labels !== undefined) n.labels = [...req.labels]
  }

  async updateSwitch(req: SwitchUpdateRequest): Promise<void> {
    const s = this.switches.get(req.id)
    if (!s) throw new Error(`Switch not found: ${req.id}`)
    if (req.type !== undefined) s.type = req.type
    if (req.labels !== undefined) s.labels = [...req.labels]
    if (req.childIds !== undefined) {
      s.childIds = [...req.childIds]
      s.size = s.childIds.length
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async deleteNode(id: string): Promise<boolean> {
    this.parentOf.delete(id)
    return this.nodes.delete(id)
  }

  async deleteSwitch(id: string): Promise<boolean> {
    const s = this.switches.get(id)
    if (s) {
      for (const c of s.childIds) this.parentOf.get(c)?.delete(id)
    }
    this.parentOf.delete(id)
    return this.switches.delete(id)
  }
}
