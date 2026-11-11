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
import type { Disposer, EventBus, EventEnvelope, Listener, Logger, WaterfallFn } from "@mola/plugin-sdk";
export interface BusOptions {
    log: Logger;
    traceId: string;
    /** death-loop brake hook: quarantine the owning plugin */
    onQuarantine?: (owner: string, event: string, error: unknown) => void;
}
type Kind = "broadcast" | "waterfall" | "serial";
/** Delivery semantics of one registered listener (public, for `mola hooks list`). */
export type ListenerKind = Kind;
/** One entry of the bus listener registry (read-only view, core §3). */
export interface ListenerInfo {
    event: string;
    kind: ListenerKind;
    /** plugin id that registered the listener ("core" for core-internal) */
    owner: string;
}
/** Read-only listener inventory of the active bus (empty before boot). */
export declare function describeActiveBus(): ListenerInfo[];
export declare class CoreEventBus implements EventBus {
    private readonly opts;
    private entries;
    private failures;
    constructor(opts: BusOptions);
    private add;
    /** Owner-scoped registration — plugin contexts tag every listener. */
    on(event: string, fn: Listener, owner?: string): Disposer;
    hook(event: string, fn: WaterfallFn, owner?: string): Disposer;
    onSerial(event: string, fn: Listener, owner?: string): Disposer;
    emit(event: string, payload: unknown, source?: EventEnvelope["source"]): void;
    runWaterfall<T>(event: string, value: T): Promise<T>;
    runSerial(event: string, payload: unknown): Promise<void>;
    /** Listener inventory — the data behind `mola hooks list` (B2). */
    describe(): ListenerInfo[];
    private key;
    private noteSuccess;
    private noteFailure;
}
export {};
