import { parentPort } from 'node:worker_threads';
import type { ManeuverTarget, ShipState } from '@orbital/shared';
import { generateManeuverPlan } from '@orbital/simulation';

if (!parentPort) throw new Error('Planner worker requires a parent port');

parentPort.on('message', (request: { id: number; ship: ShipState; target: ManeuverTarget }) => {
  try {
    parentPort?.postMessage({ id: request.id, result: generateManeuverPlan(request.ship, request.target) });
  } catch (error) {
    parentPort?.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : 'PLANNER_FAILED',
    });
  }
});
