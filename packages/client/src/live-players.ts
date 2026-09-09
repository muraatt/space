import type { RemotePlayerState } from '@orbital/shared';
/** The same spatial-presence policy for 3D, map and OPS. */
export const livePlayers = (players: RemotePlayerState[]) => players.filter(player => player.presence === 'ONLINE');
