/**
 * Shared run-progress contract for mstack 1.0 (FRAMEWORK.md §13): `mola go`
 * writes it, `mola statusline`, `mola dash` and `mola web` read it, and the
 * Claude Code `/go` command writes the same file. One file per run:
 * <cwd>/.mstack/runs/<id>/progress.json, plus approvals/<approvalId>.json.
 */
import * as fs from "node:fs";
import * as path from "node:path";
export const STAGES = ["think", "plan", "implement", "verify", "review", "ship"];
export const runsRoot = (cwd) => path.join(cwd, ".mstack", "runs");
export const runDir = (cwd, id) => path.join(runsRoot(cwd), id);
export const progressPath = (cwd, id) => path.join(runDir(cwd, id), "progress.json");
export const approvalPath = (cwd, runId, approvalId) => path.join(runDir(cwd, runId), "approvals", `${approvalId}.json`);
/** Write JSON atomically (temp file + rename) so readers never see half a file. */
export function writeJsonAtomic(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, file);
}
function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    catch {
        return undefined;
    }
}
export function readProgress(cwd, id) {
    const p = readJson(progressPath(cwd, id));
    return p && p.schemaVersion === 1 ? p : undefined;
}
export function writeProgress(p) {
    p.updatedAt = new Date().toISOString();
    p.costUsd = round(p.stages.reduce((s, x) => s + (x.costUsd ?? 0), 0));
    writeJsonAtomic(progressPath(p.cwd, p.id), p);
}
/** All runs under <cwd>/.mstack/runs that have a progress.json, newest first. */
export function listProgress(cwd) {
    let ids;
    try {
        ids = fs.readdirSync(runsRoot(cwd));
    }
    catch {
        return [];
    }
    const out = [];
    for (const id of ids) {
        const p = readProgress(cwd, id);
        if (p)
            out.push(p);
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
/** The run a live view should show: newest running/blocked run, else undefined. */
export function activeProgress(cwd) {
    return listProgress(cwd).find((p) => p.status === "running" || p.status === "blocked");
}
export function readApproval(cwd, runId, approvalId) {
    return readJson(approvalPath(cwd, runId, approvalId));
}
export function writeApproval(cwd, a) {
    writeJsonAtomic(approvalPath(cwd, a.runId, a.id), a);
}
/** Record a decision on a pending approval. Returns false if it is missing or already decided. */
export function decideApproval(cwd, runId, approvalId, approved, by) {
    const a = readApproval(cwd, runId, approvalId);
    if (!a || a.status !== "pending")
        return false;
    a.status = approved ? "approved" : "denied";
    a.decidedAt = new Date().toISOString();
    a.decidedBy = by;
    writeApproval(cwd, a);
    return true;
}
/** `go ▸ verify (4/6) · 3 agents · $0.42 · 6m`, or `go ⏸ blocked: <reason>`. */
export function formatProgressLine(p, now = Date.now()) {
    const active = p.stages.filter((s) => s.status !== "skipped");
    const idx = Math.max(0, active.findIndex((s) => s.name === p.stage)) + 1;
    const working = p.workers.filter((w) => w.status === "working").length;
    const mins = Math.max(0, Math.round((now - Date.parse(p.startedAt)) / 60000));
    const parts = [
        p.status === "blocked" ? `go ⏸ ${p.stage}: ${p.blocked?.reason ?? "waiting"}` : `go ▸ ${p.stage} (${idx}/${active.length})`,
        `${working} agent${working === 1 ? "" : "s"}`,
        `$${p.costUsd.toFixed(2)}`,
        `${mins}m`,
    ];
    return parts.join(" · ");
}
function round(n) {
    return Math.round(n * 10000) / 10000;
}
