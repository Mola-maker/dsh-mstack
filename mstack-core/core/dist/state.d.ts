/**
 * State store (core §2.5, DESIGN §11 conflict 14): B2 default is SQLite at
 * ~/.mola/state.db via node:sqlite (DatabaseSync — zero native deps), with the
 * B1 JSON store at ~/.mola/state.json kept as the automatic fallback behind the
 * same StateStore interface. openStateStore() picks the engine and migrates a
 * leftover state.json into the DB on first open (rename to state.json.migrated).
 *
 * Contents: run history (traceId, argv, exit, duration) and per-plugin KV
 * namespaces. Rebuildable cache belongs in ~/.mola/cache/*.json, never here.
 */
import type { StateNamespace } from "@mola/plugin-sdk";
export interface RunRecord {
    traceId: string;
    argv: string[];
    command: string;
    exitCode: number;
    startedAt: string;
    durationMs: number;
}
export interface StateStore {
    recordRun(run: RunRecord): void;
    runs(limit?: number): RunRecord[];
    namespace(pluginId: string): StateNamespace;
    flush(): void;
}
/** Shape of the B1 JSON state file — also the migration seed for SQLite. */
export interface StateSnapshot {
    runs: RunRecord[];
    kv: Record<string, Record<string, unknown>>;
}
/** Warn-shaped logger so openStateStore stays usable before the logger exists. */
export interface StateLog {
    warn(msg: string, fields?: Record<string, unknown>): void;
}
export declare function openJsonStateStore(file: string): StateStore;
/**
 * SQLite-backed StateStore (core §2.5 B2). Synchronous autocommit — flush() is
 * a no-op kept for interface parity. Throws when node:sqlite is unavailable
 * (older Node 22 minors) or the file cannot be opened; openStateStore() maps
 * that to the JSON fallback.
 */
export declare function openSqliteStateStore(dbFile: string, seed?: StateSnapshot): StateStore;
/**
 * Engine selector (core-plugins §10 / §2.5): SQLite is the B2 default; the
 * JSON store is the fallback when node:sqlite is unavailable or ~/.mola is not
 * SQLite-friendly. A leftover B1 state.json is migrated into the DB on first
 * open and renamed to state.json.migrated (kept as a backup, never deleted).
 */
export declare function openStateStore(homeDir: string, log?: StateLog): StateStore;
