/**
 * Logging / tracing (core §2.6). JSON lines to ~/.mola/logs/mola.log, rotated
 * by size (5 × 10 MB). pino is the design's reference implementation but the
 * B1 dependency policy allows Node built-ins only, so this is the same contract
 * hand-rolled. The console is never the log file.
 *
 * Every invocation mints a traceId (bin), carried on every line and exported
 * as MOLA_TRACE_ID so workers/sidecars/bridges can correlate.
 */
import type { Logger, LogLevel } from "@mola/plugin-sdk";
export declare function createFileLogger(dir: string, level: LogLevel, traceId: string): Logger;
/** Silent logger for tests and for boot-failure paths before logging exists. */
export declare function createNullLogger(level?: LogLevel): Logger;
