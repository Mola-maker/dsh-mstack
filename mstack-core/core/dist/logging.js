/**
 * Logging / tracing (core §2.6). JSON lines to ~/.mola/logs/mola.log, rotated
 * by size (5 × 10 MB). pino is the design's reference implementation but the
 * B1 dependency policy allows Node built-ins only, so this is the same contract
 * hand-rolled. The console is never the log file.
 *
 * Every invocation mints a traceId (bin), carried on every line and exported
 * as MOLA_TRACE_ID so workers/sidecars/bridges can correlate.
 */
import * as fs from "node:fs";
import * as path from "node:path";
const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 };
const MAX_BYTES = 10 * 1024 * 1024;
const KEEP = 5;
function rotateIfNeeded(file) {
    try {
        if (!fs.existsSync(file))
            return;
        if (fs.statSync(file).size < MAX_BYTES)
            return;
        for (let i = KEEP - 1; i >= 1; i--) {
            const from = `${file}.${i}`;
            const to = `${file}.${i + 1}`;
            if (fs.existsSync(from))
                fs.renameSync(from, to);
        }
        fs.renameSync(file, `${file}.1`);
    }
    catch {
        /* rotation is best-effort; never block boot on it */
    }
}
class FileLogger {
    file;
    level;
    fields;
    constructor(file, level, fields) {
        this.file = file;
        this.level = level;
        this.fields = fields;
    }
    child(fields) {
        return new FileLogger(this.file, this.level, { ...this.fields, ...fields });
    }
    write(level, msg, extra) {
        if (LEVELS[level] < LEVELS[this.level])
            return;
        const line = JSON.stringify({
            ts: new Date().toISOString(),
            level,
            ...this.fields,
            msg,
            ...(extra ?? {}),
        });
        try {
            fs.appendFileSync(this.file, line + "\n", "utf8");
        }
        catch {
            /* logging must never crash the CLI */
        }
    }
    trace(msg, fields) {
        this.write("trace", msg, fields);
    }
    debug(msg, fields) {
        this.write("debug", msg, fields);
    }
    info(msg, fields) {
        this.write("info", msg, fields);
    }
    warn(msg, fields) {
        this.write("warn", msg, fields);
    }
    error(msg, fields) {
        this.write("error", msg, fields);
    }
}
export function createFileLogger(dir, level, traceId) {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "mola.log");
    rotateIfNeeded(file);
    return new FileLogger(file, level, { traceId });
}
/** Silent logger for tests and for boot-failure paths before logging exists. */
export function createNullLogger(level = "error") {
    const noop = () => { };
    const self = {
        level,
        child: () => self,
        trace: noop,
        debug: noop,
        info: noop,
        warn: noop,
        error: noop,
    };
    return self;
}
