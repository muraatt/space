import type { WorldState } from '@orbital/shared';
import type { WorldRepository } from './repository';
export class MemoryRepository implements WorldRepository {
  private state?: WorldState;
  read() {
    return this.state ? structuredClone(this.state) : undefined;
  }
  write(state: WorldState) {
    this.state = structuredClone(state);
  }
}
