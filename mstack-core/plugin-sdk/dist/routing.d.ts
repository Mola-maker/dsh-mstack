/**
 * The shared loader of `config/model-routing.json` (FRAMEWORK §12.3).
 *
 * One file is shared by the skills and the CLI; `mola run` (cmd-run) and
 * `mola models rank` (cmd-model) both read it through this module so the two
 * cannot drift. Pure file handling: locate, parse, validate. A missing or
 * unusable file is never thrown — `loadRoutingFile` returns a one-line
 * `warning` the caller prints.
 */
export interface RoutingTask {
    desc?: string;
    picks: string[];
    evidence?: string;
    note?: string;
    unverified?: boolean;
}
export interface RoutingFamily {
    match: string[];
    style: string;
    rules?: string[];
    unverified?: boolean;
}
export interface RoutingTable {
    version?: number;
    updated?: string;
    tasks: Record<string, RoutingTask>;
    families: Record<string, RoutingFamily>;
    /** the file it was read from */
    file: string;
}
export interface RoutingLoadOptions {
    env?: NodeJS.ProcessEnv;
    startDir?: string;
}
export interface RoutingLoadResult {
    table: RoutingTable | null;
    /** one line, set whenever `table` is null */
    warning?: string;
}
/**
 * Where the routing file lives: `$MOLA_ROUTING_FILE`, else
 * `<checkout>/config/model-routing.json`, found by walking up from this
 * package (not from the cwd: the file belongs to the mstack install).
 */
export declare function routingFilePath(opts?: RoutingLoadOptions): string | null;
/** Validate the parsed JSON into a RoutingTable; rows that are not usable are dropped. */
export declare function normalizeRouting(raw: unknown, file: string): RoutingTable | null;
/** Load the routing table; on failure `table` is null and `warning` says why in one line. */
export declare function loadRoutingFile(opts?: RoutingLoadOptions): RoutingLoadResult;
