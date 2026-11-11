/**
 * Shared run-progress contract for mstack 1.0 (FRAMEWORK.md §13): `mola go`
 * writes it, `mola statusline`, `mola dash` and `mola web` read it, and the
 * Claude Code `/go` command writes the same file. One file per run:
 * <cwd>/.mstack/runs/<id>/progress.json, plus approvals/<approvalId>.json.
 */
export type StageName = "think" | "plan" | "implement" | "verify" | "review" | "ship";
export declare const STAGES: readonly StageName[];
export type StageStatus = "pending" | "running" | "done" | "failed" | "skipped" | "blocked";
export type WorkerStatus = "working" | "blocked" | "idle" | "done" | "failed";
export type RunStatus = "running" | "blocked" | "done" | "failed" | "stopped";
export interface StageProgress {
    name: StageName;
    status: StageStatus;
    model?: string;
    agent?: string;
    startedAt?: string;
    endedAt?: string;
    costUsd?: number;
    /** one line: what this stage produced or why it failed */
    summary?: string;
    /** artifact path relative to the run dir, e.g. "plan.md" */
    artifact?: string;
}
export interface WorkerProgress {
    id: string;
    stage: StageName;
    status: WorkerStatus;
    model?: string;
    agent?: string;
    pid?: number;
    startedAt?: string;
    updatedAt?: string;
    costUsd?: number;
    /** last line of output, for live views */
    lastLine?: string;
}
export interface Approval {
    id: string;
    runId: string;
    stage: StageName;
    /** what will happen if approved, e.g. "git push origin feat/x and open a PR" */
    action: string;
    status: "pending" | "approved" | "denied";
    createdAt: string;
    decidedAt?: string;
    decidedBy?: string;
}
export interface RunProgress {
    schemaVersion: 1;
    id: string;
    intent: string;
    cwd: string;
    status: RunStatus;
    startedAt: string;
    updatedAt: string;
    /** stage currently running (or the last one reached) */
    stage: StageName;
    stages: StageProgress[];
    workers: WorkerProgress[];
    costUsd: number;
    /** set while status === "blocked" */
    blocked?: {
        reason: string;
        approvalId?: string;
    };
    /** one line: what happens next, or what the user should do */
    next?: string;
    /** where this run came from: "cli" (mola go), "claude-code" (/go), "trigger" */
    origin?: string;
}
export declare const runsRoot: (cwd: string) => string;
export declare const runDir: (cwd: string, id: string) => string;
export declare const progressPath: (cwd: string, id: string) => string;
export declare const approvalPath: (cwd: string, runId: string, approvalId: string) => string;
/** Write JSON atomically (temp file + rename) so readers never see half a file. */
export declare function writeJsonAtomic(file: string, value: unknown): void;
export declare function readProgress(cwd: string, id: string): RunProgress | undefined;
export declare function writeProgress(p: RunProgress): void;
/** All runs under <cwd>/.mstack/runs that have a progress.json, newest first. */
export declare function listProgress(cwd: string): RunProgress[];
/** The run a live view should show: newest running/blocked run, else undefined. */
export declare function activeProgress(cwd: string): RunProgress | undefined;
export declare function readApproval(cwd: string, runId: string, approvalId: string): Approval | undefined;
export declare function writeApproval(cwd: string, a: Approval): void;
/** Record a decision on a pending approval. Returns false if it is missing or already decided. */
export declare function decideApproval(cwd: string, runId: string, approvalId: string, approved: boolean, by: string): boolean;
/** `go ▸ verify (4/6) · 3 agents · $0.42 · 6m`, or `go ⏸ blocked: <reason>`. */
export declare function formatProgressLine(p: RunProgress, now?: number): string;
