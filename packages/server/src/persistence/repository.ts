import type { WorldState } from '@orbital/shared';
/** Persistence port: Session 1 in-memory implementation; durable adapter Session 5. */
export interface WorldRepository {
  read(): WorldState | undefined;
  write(state: WorldState): void;
}
