/**
 * Multiplayer architecture (phase 3 — NOT implemented / not exposed in the UI).
 *
 * The simulation is already split so a network layer can be added without
 * touching rendering:
 *  - `race` (src/game/race/raceRuntime.ts) holds all per-frame racer state.
 *  - Local racers are driven by `stepVehicle` from a `DriveInput`.
 *  - A remote racer would instead be a kinematic body whose transform is
 *    interpolated from server snapshots.
 *
 * Planned server: Colyseus room per race. Clients send inputs at 30 Hz, the
 * server runs the authoritative Rapier simulation (same vehiclePhysics.ts code)
 * and broadcasts snapshots. Lap / finish events come from the server.
 */
import type { DriveInput } from '../game/input/input';
import type { TrackId, TruckDesign, TruckId } from '../types';

export interface PlayerInfo {
  id: string;
  name: string;
  truckId: TruckId;
  design: TruckDesign;
}

export interface RacerSnapshot {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  nitroActive: boolean;
  total: number;
  lapsDone: number;
  finished: boolean;
}

export type ServerMessage =
  | { type: 'room'; roomId: string; trackId: TrackId; laps: number; players: PlayerInfo[] }
  | { type: 'countdown'; startsAt: number }
  | { type: 'snapshot'; t: number; racers: RacerSnapshot[] }
  | { type: 'finish'; results: { id: string; time: number; position: number }[] };

export type ClientMessage =
  | { type: 'join'; player: PlayerInfo }
  | { type: 'ready' }
  | { type: 'input'; seq: number; input: DriveInput };

/** Transport abstraction so the game can swap between local AI and an online room. */
export interface RaceTransport {
  connect(player: PlayerInfo): Promise<void>;
  send(msg: ClientMessage): void;
  onMessage(cb: (msg: ServerMessage) => void): () => void;
  disconnect(): void;
}
