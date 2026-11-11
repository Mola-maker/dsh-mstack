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
import { MolaError, ExitCode } from "./errors.js";
/**
 * The requested capability does not exist on this agent — declared in
 * `capabilities`, never discovered at run time. Exit 69: the router treats it
 * as "this upstream cannot take the work".
 */
export class UnsupportedCapability extends MolaError {
    capability;
    agentId;
    constructor(agentId, capability, detail) {
        super("UNSUPPORTED_CAPABILITY", `${agentId} does not support ${capability}${detail ? ` — ${detail}` : ""}`, ExitCode.Unavailable, { agentId, capability });
        this.name = "UnsupportedCapability";
        this.agentId = agentId;
        this.capability = capability;
    }
}
/** Narrow an adapter from the registry to the run surface (phase 2 entry point). */
export function isRunnableAgent(a) {
    return typeof a.run === "function";
}
// ------------------------------------------------- shared adapter helpers
/**
 * Quota-failure normalization (ADR-0003 §4): map upstream error text to a
 * QuotaFailure. DeepSeek's 402 is the fleet-killer; Claude/Codex rate limits
 * carry the same shape. Returns undefined when the text is not quota-shaped.
 */
export function detectQuotaFailure(text, route) {
    const t = text ?? "";
    // a bare "402" anywhere (a session id, a cost, a token count) is not a quota failure:
    // the code must sit in an error context or next to quota wording
    const coded = /\b(?:status|code|http|error|quota)\W{0,3}(402|429)\b/i.exec(t) ??
        /\b(402|429)\b\W{0,3}(?:payment required|insufficient|too many requests|rate limit)/i.exec(t);
    const worded = /(?:too many requests|payment required|rate limit|insufficient[a-z ]*)\W{0,3}(402|429)\b/i.exec(t);
    if (!coded && worded)
        return { provider: "magpie", route, status: Number(worded[1]) };
    if (coded)
        return { provider: "magpie", route, status: Number(coded[1]) };
    if (/rate\s*limit|quota\s*(exceeded|exhausted)|insufficient.*(quota|balance|credit)/i.test(t)) {
        return { provider: "magpie", route, status: 402 };
    }
    return undefined;
}
/**
 * Parse `magpie usage [window] --csv` (magpie-help.txt line 103: "every request
 * as CSV … tokens, cost, time, status, account"). Columns are matched by name
 * so drift in magpie's column order cannot produce wrong numbers; unknown
 * headers ⇒ empty array rather than invented values.
 */
export function parseMagpieUsageCsv(csv) {
    const lines = (csv ?? "").split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2)
        return [];
    const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const idx = (re) => header.findIndex((h) => re.test(h));
    const agent = idx(/^(agent|app)$/);
    const model = idx(/^(model)$/);
    const input = idx(/(input|prompt).*token|token.*(input|prompt)/);
    const output = idx(/(output|completion|answer).*token|token.*(output|completion)/);
    const cost = idx(/cost|usd|spend/);
    if (cost < 0 && input < 0 && output < 0)
        return [];
    const out = [];
    for (const line of lines.slice(1)) {
        const cols = splitCsvLine(line);
        const cell = (i) => (i >= 0 ? cols[i]?.trim() : undefined);
        const row = { source: "magpie" };
        if (agent >= 0 && cell(agent))
            row.agent = cell(agent);
        if (model >= 0 && cell(model))
            row.model = cell(model);
        if (input >= 0 && cell(input) && Number(cell(input)))
            row.inputTokens = Number(cell(input));
        if (output >= 0 && cell(output) && Number(cell(output)))
            row.outputTokens = Number(cell(output));
        if (cost >= 0 && cell(cost) && Number(cell(cost)))
            row.costUsd = Number(cell(cost));
        out.push(row);
    }
    return out;
}
/** One CSV line, honoring double quotes; no multi-line or escaped-quote support needed. */
function splitCsvLine(line) {
    const out = [];
    let cur = "";
    let quoted = false;
    for (const ch of line) {
        if (ch === '"')
            quoted = !quoted;
        else if (ch === "," && !quoted) {
            out.push(cur);
            cur = "";
        }
        else
            cur += ch;
    }
    out.push(cur);
    return out;
}
/** Extract a JSON object per line; non-JSON lines are skipped (stream bridges). */
export function parseNdjson(stdout) {
    const out = [];
    for (const line of (stdout ?? "").split(/\r?\n/)) {
        const t = line.trim();
        if (!t.startsWith("{"))
            continue;
        try {
            const obj = JSON.parse(t);
            if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
                out.push(obj);
            }
        }
        catch {
            /* one bad line never kills a stream */
        }
    }
    return out;
}
/** First string among the candidate keys of an NDJSON event (dsh/codex drift). */
export function firstString(o, keys) {
    for (const k of keys) {
        const v = o[k];
        if (typeof v === "string" && v.trim())
            return v;
    }
    return undefined;
}
