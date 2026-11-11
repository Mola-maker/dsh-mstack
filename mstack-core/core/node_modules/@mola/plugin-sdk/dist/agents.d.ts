/**
 * The B2 headless-agent run surface (adapters-routing §1.1, ADR-0003/0004).
 *
 * B1 fixed `AgentAdapter` (types.ts) as the detection surface every plugin can
 * implement cheaply (tool-magpie registers a probe-only adapter). The full
 * run surface lives here as `HeadlessAgentAdapter`: detection PLUS
 * capabilities + run/resume/listSessions/usage/setModel/bridgeHooks. Phase 2
 * (`mola run`, the routing engine) narrows with `isRunnableAgent` and calls
 * `run()` — see AGENTS.md in this package for the consumer contract.
 *
 * Flag mappings per agent are grounded ONLY in cli/design/inputs/*-help.txt
 * (no invented flags); the per-agent honesty gaps are listed in AGENTS.md.
 */
import type { EventEnvelope } from "./events.js";
import { MolaError } from "./errors.js";
import type { AgentAdapter } from "./types.js";
/** ADR-0004 §2 envelope — what `onEvent` receives and what the bus carries. */
export type HookEvent = EventEnvelope;
export type PermissionProfile = "read-only" | "workspace-write" | "full-auto" | "plan";
export interface AgentCapabilities {
    /** can run one prompt non-interactively and exit */
    headless: boolean;
    /** headless mode emits machine-readable NDJSON (stream bridge possible) */
    headlessJsonStream: boolean;
    /** can resume a prior session by id */
    resume: boolean;
    /** can continue "the most recent session for this cwd" */
    continueLatest: boolean;
    forkSession: boolean;
    /** native session listing (not via magpie) */
    listSessions: boolean;
    /** speaks Agent Client Protocol over stdio */
    acp: boolean;
    /** has a config-injectable hook/notify surface (ADR-0004 bridge A) */
    nativeHooks: boolean;
    /** can detach sessions we can re-attach to */
    backgroundSessions: boolean;
    /** has a native git-worktree flag */
    worktree: boolean;
    /** native budget cap flag (claude `--max-budget-usd`); false ⇒ router enforces */
    budgetCap: boolean;
    costReadout: "native" | "magpie" | "none";
}
export interface RunRequest {
    prompt: string;
    /** working directory the agent runs in (mapped per machine by the adapter) */
    cwd: string;
    /** magpie route id (`group/*` | `auto/*`, ADR-0003) — recorded and applied per agent */
    modelRoute?: string;
    permissionProfile?: PermissionProfile;
    addDirs?: string[];
    /** native cap where it exists (claude), router-enforced elsewhere */
    budgetUsd?: number;
    timeoutMs?: number;
    /** resume target (set ⇒ resume instead of a fresh session) */
    sessionId?: string;
    /** resume with a new session id where the agent supports it */
    fork?: boolean;
    env?: Record<string, string>;
    /** run id for the `.mstack/runs/<runId>/` record; adapter mints one when absent */
    runId?: string;
    /** stream-bridge tap — the same envelopes the adapter emits on the bus */
    onEvent?: (event: HookEvent) => void;
}
export type RunResumeRequest = Omit<RunRequest, "sessionId">;
export interface Usage {
    /** magpie usage rows name the agent/model they billed (magpie-help.txt line 103) */
    agent?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    source: "agent" | "magpie";
}
export interface UsageScope {
    sessionId?: string;
    window?: "today" | "7d" | "30d";
}
/** Normalized 402/rate-limit signal (ADR-0003 §4) — recovery is the router's job. */
export interface QuotaFailure {
    provider: string;
    route?: string;
    status: number;
    retryAfterSec?: number;
}
export interface SessionRef {
    id: string;
    title?: string;
    cwd?: string;
    /** ISO-8601 when the agent reports it; absent rather than faked */
    updatedAt?: string;
}
/**
 * Per-run native-hook injection payload (ADR-0004 §3 bridge A). `argv` is
 * appended to the agent invocation; the events come back through the stream
 * (`--include-hook-events`) — the localhost ingest endpoint arrives with
 * `mola hook-ingest` and only changes `transport`.
 */
export interface HookBridgeHandle {
    argv: string[];
    settings: Record<string, unknown>;
    transport: "stream-json" | "file" | "http";
}
export interface RunResult {
    sessionId?: string;
    exitCode: number;
    /** final assistant message (or last NDJSON result) */
    finalText: string;
    usage?: Usage;
    quotaFailure?: QuotaFailure;
    /** events the adapter emitted for this run (bus + onEvent tap) */
    events?: HookEvent[];
}
/**
 * The requested capability does not exist on this agent — declared in
 * `capabilities`, never discovered at run time. Exit 69: the router treats it
 * as "this upstream cannot take the work".
 */
export declare class UnsupportedCapability extends MolaError {
    readonly capability: string;
    readonly agentId: string;
    constructor(agentId: string, capability: string, detail?: string);
}
/**
 * The B2 run surface. Adapters are constructed with their PluginContext (bus,
 * exec, state) by their own plugin; the interface stays context-free so the
 * router can call it without knowing how a given agent is reached.
 */
export interface HeadlessAgentAdapter extends AgentAdapter {
    readonly capabilities: AgentCapabilities;
    /** one-shot headless run; `req.sessionId` set ⇒ resume that session */
    run(req: RunRequest): Promise<RunResult>;
    /** resume/continue a session; `"latest"` = the agent's continue-latest flag */
    resume(sessionId: string | "latest", req: RunResumeRequest): Promise<RunResult>;
    /** native session list; absent ⇒ use magpie sessions (tool-magpie) */
    listSessions?(filter?: {
        cwd?: string;
        since?: string;
    }): Promise<SessionRef[]>;
    /** cost/usage; grok native, everything else via magpie */
    usage?(scope?: UsageScope): Promise<Usage[]>;
    /** ALWAYS `magpie <agent> <route>` — magpie owns agent model configs */
    setModel?(route: string): Promise<void>;
    /** per-run native-hook injection payload (ADR-0004 §3 bridge A) */
    bridgeHooks?(req: RunRequest): HookBridgeHandle;
}
/** Narrow an adapter from the registry to the run surface (phase 2 entry point). */
export declare function isRunnableAgent(a: AgentAdapter): a is HeadlessAgentAdapter;
/**
 * Quota-failure normalization (ADR-0003 §4): map upstream error text to a
 * QuotaFailure. DeepSeek's 402 is the fleet-killer; Claude/Codex rate limits
 * carry the same shape. Returns undefined when the text is not quota-shaped.
 */
export declare function detectQuotaFailure(text: string, route?: string): QuotaFailure | undefined;
/**
 * Parse `magpie usage [window] --csv` (magpie-help.txt line 103: "every request
 * as CSV … tokens, cost, time, status, account"). Columns are matched by name
 * so drift in magpie's column order cannot produce wrong numbers; unknown
 * headers ⇒ empty array rather than invented values.
 */
export declare function parseMagpieUsageCsv(csv: string): Usage[];
/** Extract a JSON object per line; non-JSON lines are skipped (stream bridges). */
export declare function parseNdjson(stdout: string): Array<Record<string, unknown>>;
/** First string among the candidate keys of an NDJSON event (dsh/codex drift). */
export declare function firstString(o: Record<string, unknown>, keys: string[]): string | undefined;
