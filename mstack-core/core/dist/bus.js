/**
 * Event/hook bus (core §3, ADR-0004). Three delivery semantics:
 *
 * - broadcast (`emit`/`on`): facts; a throwing handler is logged and isolated,
 *   never breaks the producer (DESIGN §11 conflict 12).
 * - waterfall (`hook`/`runWaterfall`): policy gates (`mola.tool.before`,
 *   `mola.task.pre-dispatch`); each listener may rewrite the value or reject
 *   with PolicyDenial (router maps rejection to exit 77).
 * - serial (`onSerial`/`runSerial`): ordered observers (boot/shutdown).
 *
 * Death-loop brake (core §3, the mstack guard rule): the same listener throwing
 * / the same waterfall rejecting 3 consecutive times for the same event+plugin
 * quarantines the plugin. No fourth attempt.
 */
import { randomUUID } from "node:crypto";
const BRAKE_LIMIT = 3;
/**
 * The process-wide bus (one per boot). `mola hooks list` needs the listener
 * registry as a read-only inventory; PluginContext deliberately exposes no bus
 * handle, so core publishes the active bus's inventory here (weakly held —
 * nothing is kept alive just to describe it).
 */
let activeBus;
/** Read-only listener inventory of the active bus (empty before boot). */
export function describeActiveBus() {
    return activeBus?.deref()?.describe() ?? [];
}
export class CoreEventBus {
    opts;
    entries = [];
    failures = new Map();
    constructor(opts) {
        this.opts = opts;
        activeBus = new WeakRef(this);
    }
    add(kind, event, fn, owner) {
        const entry = { kind, event, owner, fn };
        this.entries.push(entry);
        return () => {
            const i = this.entries.indexOf(entry);
            if (i >= 0)
                this.entries.splice(i, 1);
        };
    }
    /** Owner-scoped registration — plugin contexts tag every listener. */
    on(event, fn, owner = "core") {
        return this.add("broadcast", event, fn, owner);
    }
    hook(event, fn, owner = "core") {
        return this.add("waterfall", event, fn, owner);
    }
    onSerial(event, fn, owner = "core") {
        return this.add("serial", event, fn, owner);
    }
    emit(event, payload, source) {
        const envelope = {
            id: randomUUID(),
            ts: new Date().toISOString(),
            kind: event,
            source: { runId: this.opts.traceId, ...(source ?? {}) },
            data: payload,
        };
        for (const e of this.entries.filter((x) => x.kind === "broadcast" && x.event === event)) {
            try {
                const r = e.fn(envelope);
                if (r && typeof r.catch === "function") {
                    r.catch((err) => this.noteFailure(e, err));
                }
                this.noteSuccess(e);
            }
            catch (err) {
                this.noteFailure(e, err);
            }
        }
    }
    async runWaterfall(event, value) {
        let current = value;
        for (const e of this.entries.filter((x) => x.kind === "waterfall" && x.event === event)) {
            try {
                current = await e.fn(current);
                this.noteSuccess(e);
            }
            catch (err) {
                this.noteFailure(e, err);
                throw err; // rejection IS the denial path (§11 conflict 12)
            }
        }
        return current;
    }
    async runSerial(event, payload) {
        const envelope = {
            id: randomUUID(),
            ts: new Date().toISOString(),
            kind: event,
            source: { runId: this.opts.traceId },
            data: payload,
        };
        for (const e of this.entries.filter((x) => x.kind === "serial" && x.event === event)) {
            try {
                await e.fn(envelope);
                this.noteSuccess(e);
            }
            catch (err) {
                // serial observers are ordered but still isolated: shutdown must proceed
                this.noteFailure(e, err);
            }
        }
    }
    /** Listener inventory — the data behind `mola hooks list` (B2). */
    describe() {
        return this.entries.map(({ event, kind, owner }) => ({ event, kind, owner }));
    }
    key(e) {
        return `${e.kind}:${e.event}:${e.owner}`;
    }
    noteSuccess(e) {
        this.failures.delete(this.key(e));
    }
    noteFailure(e, err) {
        const key = this.key(e);
        const count = (this.failures.get(key) ?? 0) + 1;
        this.failures.set(key, count);
        this.opts.log.warn("bus listener failed", {
            event: e.event,
            kind: e.kind,
            owner: e.owner,
            consecutive: count,
            error: err instanceof Error ? err.message : String(err),
        });
        if (count >= BRAKE_LIMIT) {
            this.failures.delete(key);
            this.opts.log.error("death-loop brake: quarantining plugin", { owner: e.owner, event: e.event });
            this.opts.onQuarantine?.(e.owner, e.event, err);
        }
    }
}
