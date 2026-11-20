import type pg from 'pg';
import type { Config } from './config.js';
import type { Keyring } from './lib/crypto.js';
import type { MediaMtxClient } from './lib/mediamtx.js';

export interface AppContext {
  config: Config;
  db: pg.Pool;
  keys: Keyring;
  mtx: MediaMtxClient;
}
