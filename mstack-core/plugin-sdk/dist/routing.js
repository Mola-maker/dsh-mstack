/**
 * The shared loader of `config/model-routing.json` (FRAMEWORK §12.3).
 *
 * One file is shared by the skills and the CLI; `mola run` (cmd-run) and
 * `mola models rank` (cmd-model) both read it through this module so the two
 * cannot drift. Pure file handling: locate, parse, validate. A missing or
 * unusable file is never thrown — `loadRoutingFile` returns a one-line
 * `warning` the caller prints.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
/** True when the directory holds `.claude-plugin/plugin.json` (the mstack checkout root). */
function isCheckoutRoot(dir) {
    return fs.existsSync(path.join(dir, ".claude-plugin", "plugin.json"));
}
/**
 * Where the routing file lives: `$MOLA_ROUTING_FILE`, else
 * `<checkout>/config/model-routing.json`, found by walking up from this
 * package (not from the cwd: the file belongs to the mstack install).
 */
export function routingFilePath(opts = {}) {
    const env = opts.env ?? process.env;
    if (env.MOLA_ROUTING_FILE)
        return path.resolve(env.MOLA_ROUTING_FILE);
    let dir = path.resolve(opts.startDir ?? path.dirname(fileURLToPath(import.meta.url)));
    for (let i = 0; i < 16; i++) {
        if (isCheckoutRoot(dir))
            return path.join(dir, "config", "model-routing.json");
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return null;
}
/** Validate the parsed JSON into a RoutingTable; rows that are not usable are dropped. */
export function normalizeRouting(raw, file) {
    if (!raw || typeof raw !== "object")
        return null;
    const obj = raw;
    const tasks = {};
    const rawTasks = (obj.tasks ?? {});
    for (const [kind, row] of Object.entries(rawTasks)) {
        if (!row || typeof row !== "object")
            continue;
        const r = row;
        if (!Array.isArray(r.picks))
            continue;
        const picks = r.picks.filter((p) => typeof p === "string" && p.length > 0);
        if (picks.length === 0)
            continue;
        tasks[kind] = {
            picks,
            ...(typeof r.desc === "string" ? { desc: r.desc } : {}),
            ...(typeof r.evidence === "string" ? { evidence: r.evidence } : {}),
            ...(typeof r.note === "string" ? { note: r.note } : {}),
            ...(r.unverified === true ? { unverified: true } : {}),
        };
    }
    const families = {};
    const rawFamilies = (obj.families ?? {});
    for (const [name, row] of Object.entries(rawFamilies)) {
        if (!row || typeof row !== "object")
            continue;
        const r = row;
        if (!Array.isArray(r.match) || typeof r.style !== "string")
            continue;
        families[name] = {
            match: r.match.filter((m) => typeof m === "string"),
            style: r.style,
            ...(Array.isArray(r.rules) ? { rules: r.rules.filter((x) => typeof x === "string") } : {}),
            ...(r.unverified === true ? { unverified: true } : {}),
        };
    }
    if (Object.keys(tasks).length === 0)
        return null;
    return {
        ...(typeof obj.version === "number" ? { version: obj.version } : {}),
        ...(typeof obj.updated === "string" ? { updated: obj.updated } : {}),
        tasks,
        families,
        file,
    };
}
/** Load the routing table; on failure `table` is null and `warning` says why in one line. */
export function loadRoutingFile(opts = {}) {
    const file = routingFilePath(opts);
    if (!file) {
        return {
            table: null,
            warning: "cannot locate the mstack checkout (no .claude-plugin/plugin.json above this package); set MOLA_ROUTING_FILE",
        };
    }
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(file, "utf8"));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { table: null, warning: `cannot read ${file}: ${msg.split("\n")[0]}` };
    }
    const table = normalizeRouting(raw, file);
    if (!table)
        return { table: null, warning: `${file} has no usable "tasks" rows` };
    return { table };
}
