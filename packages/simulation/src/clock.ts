import { CONFIG } from '@orbital/shared';
export const simulationTimeMs = (tick: number) => CONFIG.epochMs + tick * CONFIG.fixedDt * 1000;
