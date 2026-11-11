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
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
const MAX_RUNS = 500;
/** Tolerant read of a state.json (missing/corrupt → empty snapshot). */
function readStateFile(file) {
    if (!fs.existsSync(file))
        return { runs: [], kv: {} };
    try {
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        return {
            runs: Array.isArray(parsed.runs) ? parsed.runs : [],
            kv: parsed.kv && typeof parsed.kv === "object" ? parsed.kv : {},
        };
    }
    catch {
        // corrupt state is not fatal: keep in-memory defaults, rewrite on flush
        return { runs: [], kv: {} };
    }
}
export function openJsonStateStore(file) {
    const data = { schemaVersion: 1, ...readStateFile(file) };
    const store = {
        recordRun(run) {
            data.runs.push(run);
            if (data.runs.length > MAX_RUNS)
                data.runs.splice(0, data.runs.length - MAX_RUNS);
        },
        runs(limit = 50) {
            return data.runs.slice(-limit);
        },
        namespace(pluginId) {
            if (!data.kv[pluginId])
                data.kv[pluginId] = {};
            const bucket = data.kv[pluginId];
            return {
                get(key) {
                    return bucket[key];
                },
                set(key, value) {
                    bucket[key] = value;
                },
                delete(key) {
                    delete bucket[key];
                },
                keys() {
                    return Object.keys(bucket);
                },
            };
        },
        flush() {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            // atomic write: tmp + rename (same volume)
            const tmp = `${file}.tmp-${process.pid}`;
            fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
            fs.renameSync(tmp, file);
        },
    };
    return store;
}
/**
 * SQLite-backed StateStore (core §2.5 B2). Synchronous autocommit — flush() is
 * a no-op kept for interface parity. Throws when node:sqlite is unavailable
 * (older Node 22 minors) or the file cannot be opened; openStateStore() maps
 * that to the JSON fallback.
 */
export function openSqliteStateStore(dbFile, seed) {
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    const db = new DatabaseSync(dbFile);
    db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT NOT NULL,
      argv TEXT NOT NULL,
      command TEXT NOT NULL,
      exit_code INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS runs_trace ON runs(trace_id);
    CREATE TABLE IF NOT EXISTS kv (
      plugin_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (plugin_id, key)
    );
  `);
    const insertRun = db.prepare("INSERT INTO runs (trace_id, argv, command, exit_code, started_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?)");
    const getKv = db.prepare("SELECT value FROM kv WHERE plugin_id = ? AND key = ?");
    const setKv = db.prepare("INSERT OR REPLACE INTO kv (plugin_id, key, value) VALUES (?, ?, ?)");
    const delKv = db.prepare("DELETE FROM kv WHERE plugin_id = ? AND key = ?");
    const keysKv = db.prepare("SELECT key FROM kv WHERE plugin_id = ? ORDER BY key");
    function rowToRun(row) {
        let argv = [];
        try {
            const parsed = JSON.parse(String(row.argv));
            if (Array.isArray(parsed))
                argv = parsed.map(String);
        }
        catch {
            /* keep [] */
        }
        return {
            traceId: String(row.trace_id),
            argv,
            command: String(row.command),
            exitCode: Number(row.exit_code),
            startedAt: String(row.started_at),
            durationMs: Number(row.duration_ms),
        };
    }
    if (seed) {
        // one transaction: a failed seed leaves the DB untouched (retried next open)
        db.exec("BEGIN");
        try {
            for (const r of seed.runs) {
                insertRun.run(r.traceId, JSON.stringify(r.argv ?? []), r.command ?? "", r.exitCode ?? 0, r.startedAt ?? "", r.durationMs ?? 0);
            }
            for (const [pid, bucket] of Object.entries(seed.kv ?? {})) {
                for (const [k, v] of Object.entries(bucket ?? {}))
                    setKv.run(pid, k, JSON.stringify(v ?? null));
            }
            db.exec("COMMIT");
        }
        catch (err) {
            db.exec("ROLLBACK");
            throw err;
        }
    }
    const store = {
        recordRun(run) {
            insertRun.run(run.traceId, JSON.stringify(run.argv ?? []), run.command ?? "", run.exitCode ?? 0, run.startedAt ?? "", run.durationMs ?? 0);
            db.exec(`DELETE FROM runs WHERE seq NOT IN (SELECT seq FROM runs ORDER BY seq DESC LIMIT ${MAX_RUNS})`);
        },
        runs(limit = 50) {
            const rows = db
                .prepare(`SELECT seq, trace_id, argv, command, exit_code, started_at, duration_ms FROM runs ORDER BY seq DESC LIMIT ${Math.max(0, Math.floor(limit))}`)
                .all();
            return rows.map(rowToRun).reverse();
        },
        namespace(pluginId) {
            return {
                get(key) {
                    const row = getKv.get(pluginId, key);
                    if (!row)
                        return undefined;
                    try {
                        return JSON.parse(String(row.value));
                    }
                    catch {
                        return undefined;
                    }
                },
                set(key, value) {
                    setKv.run(pluginId, key, JSON.stringify(value ?? null));
                },
                delete(key) {
                    delKv.run(pluginId, key);
                },
                keys() {
                    return keysKv.all(pluginId).map((r) => r.key);
                },
            };
        },
        flush() {
            // autocommit per statement; nothing to flush (interface parity with JSON)
        },
    };
    return store;
}
/**
 * Engine selector (core-plugins §10 / §2.5): SQLite is the B2 default; the
 * JSON store is the fallback when node:sqlite is unavailable or ~/.mola is not
 * SQLite-friendly. A leftover B1 state.json is migrated into the DB on first
 * open and renamed to state.json.migrated (kept as a backup, never deleted).
 */
export function openStateStore(homeDir, log) {
    const dbFile = path.join(homeDir, "state.db");
    const jsonFile = path.join(homeDir, "state.json");
    const legacy = fs.existsSync(jsonFile) ? readStateFile(jsonFile) : undefined;
    function openSqlite() {
        try {
            return openSqliteStateStore(dbFile, legacy);
        }
        catch (err) {
            if (!legacy)
                throw err;
            // a failed migration seed must not lose the DB: reopen unseeded
            log?.warn?.("state.json migration failed — continuing with existing state.db", {
                error: err instanceof Error ? err.message : String(err),
            });
            return openSqliteStateStore(dbFile);
        }
    }
    try {
        const store = openSqlite();
        if (legacy) {
            try {
                fs.renameSync(jsonFile, `${jsonFile}.migrated`);
                log?.warn?.("migrated ~/.mola/state.json into ~/.mola/state.db", {
                    backup: `${jsonFile}.migrated`,
                    runs: legacy.runs.length,
                    namespaces: Object.keys(legacy.kv).length,
                });
            }
            catch (err) {
                // rename failure only means the JSON file is retried next boot
                log?.warn?.("could not retire ~/.mola/state.json after migration", {
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
        return store;
    }
    catch (err) {
        log?.warn?.("node:sqlite unavailable — using ~/.mola/state.json fallback", {
            error: err instanceof Error ? err.message : String(err),
        });
        return openJsonStateStore(jsonFile);
    }
}
