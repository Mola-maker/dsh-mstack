/**
 * Command router (core §2.3). Commands are namespaced paths registered by
 * plugins; longest path wins; aliases are config, not code. Handlers return an
 * ExitCode and never call process.exit. The router owns the --json envelope
 * (core §8.2): one document on stdout, diagnostics on stderr.
 */
import { MolaError, MolaEvents, ExitCode, banner, detectColor, formatValue, palette, parseArgv, table, toMolaError, } from "@mola/plugin-sdk";
/** Help sections, in display order. Unknown first-tokens fall into "Other". */
const HELP_GROUP_ORDER = ["Overview", "Run a task", "Agents", "Models", "Superagent", "Tools", "Setup"];
const HELP_GROUP_OF = {
    dash: "Overview",
    doctor: "Overview",
    version: "Overview",
    run: "Run a task",
    dispatch: "Run a task",
    think: "Run a task",
    plan: "Run a task",
    goal: "Run a task",
    team: "Run a task",
    review: "Run a task",
    ship: "Run a task",
    agents: "Agents",
    runs: "Agents",
    hooks: "Agents",
    model: "Models",
    superagent: "Superagent",
    rtk: "Tools",
    plugin: "Setup",
    config: "Setup",
    completions: "Setup",
    skills: "Setup",
};
/** Io implementation; the router calls finish() after the handler returns. */
export class IoImpl {
    json;
    quiet;
    traceId;
    cwd;
    yes;
    result = { set: false };
    /** true once the handler printed its own human line (so finish() stays quiet) */
    wroteHuman = false;
    commandPath = "";
    constructor(json, quiet, traceId, cwd, yes) {
        this.json = json;
        this.quiet = quiet;
        this.traceId = traceId;
        this.cwd = cwd;
        this.yes = yes;
    }
    data(value) {
        this.result = { set: true, value };
    }
    out(line) {
        this.wroteHuman = true;
        // --json mode: stdout carries only the envelope; human output goes to stderr
        if (this.json)
            process.stderr.write(line + "\n");
        else
            process.stdout.write(line + "\n");
    }
    note(message) {
        if (this.quiet)
            return;
        process.stderr.write(message + "\n");
    }
    error(err) {
        const e = toMolaError(err);
        if (this.json) {
            // stdout stays clean; one error document on stderr (core §8.2)
            process.stderr.write(JSON.stringify({
                schemaVersion: 1,
                traceId: this.traceId,
                error: { code: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) },
            }) + "\n");
        }
        else {
            process.stderr.write(`mola: ${e.code}: ${e.message}\n`);
        }
    }
    finish() {
        if (!this.result.set)
            return;
        if (this.json) {
            process.stdout.write(JSON.stringify({
                schemaVersion: 1,
                command: this.commandPath,
                traceId: this.traceId,
                data: this.result.value ?? null,
            }) + "\n");
            return;
        }
        // the handler already spoke; don't dump data after it (and never as JSON)
        if (this.wroteHuman)
            return;
        const text = formatValue(this.result.value);
        if (text.length > 0)
            process.stdout.write(text + "\n");
    }
}
export class CommandRouter {
    opts;
    commands = new Map();
    constructor(opts) {
        this.opts = opts;
    }
    key(path) {
        return path.join(" ");
    }
    register(command, owner) {
        const key = this.key(command.path);
        const existing = this.commands.get(key);
        if (existing) {
            // plan-time conflict (core §2.3) — explicit overrides arrive with
            // third-party plugin support in B2; throwing here quarantines the plugin
            throw new MolaError("COMMAND_CONFLICT", `command "${key}" is already registered by ${existing.owner} (${owner} must declare overrides)`, ExitCode.DataErr);
        }
        this.commands.set(key, { ...command, owner });
        return () => {
            this.commands.delete(key);
        };
    }
    list() {
        return [...this.commands.values()].sort((a, b) => this.key(a.path).localeCompare(this.key(b.path)));
    }
    /** Longest registered path prefix over leading positional tokens. */
    resolve(tokens) {
        const leading = [];
        for (const t of tokens) {
            if (t.startsWith("-"))
                break;
            leading.push(t);
        }
        for (let len = Math.min(leading.length, this.maxDepth()); len >= 1; len--) {
            const hit = this.commands.get(leading.slice(0, len).join(" "));
            if (hit)
                return { command: hit, rest: tokens.slice(len) };
        }
        return undefined;
    }
    maxDepth() {
        let max = 0;
        for (const c of this.commands.values())
            max = Math.max(max, c.path.length);
        return max;
    }
    help() {
        // color is decoration: a pipe or NO_COLOR gets the plain banner and table
        const p = palette(detectColor());
        const groups = new Map();
        for (const title of HELP_GROUP_ORDER)
            groups.set(title, []);
        for (const c of this.list()) {
            const title = HELP_GROUP_OF[c.path[0]] ?? "Other";
            if (!groups.has(title))
                groups.set(title, []);
            groups.get(title).push(c);
        }
        const lines = [
            banner(p),
            "",
            "usage: mola [--json] [-v…] [-q] [--config <path>] [--cwd <dir>] [--no-color] [--yes] <command> [args]",
            "",
        ];
        for (const title of [...HELP_GROUP_ORDER, "Other"]) {
            const cmds = groups.get(title);
            if (!cmds || cmds.length === 0)
                continue;
            lines.push(p.bold(title));
            lines.push(...table({
                rows: cmds.map((c) => [this.key(c.path), c.description]),
                indent: "  ",
            }), "");
        }
        lines.push(p.bold("examples"));
        lines.push("  mola doctor");
        lines.push('  mola run "count TODOs in README.md"');
        lines.push("  mola dash");
        return lines.join("\n");
    }
    async dispatch(argv, io, aliases = {}) {
        let tokens = [...argv];
        if (tokens.length === 0 || tokens[0] === "help" || tokens[0] === "--help" || tokens[0] === "-h") {
            process.stdout.write(this.help() + "\n");
            return ExitCode.Ok;
        }
        // aliases are config, not code (core §2.3) — rewrite the leading token once
        const alias = aliases[tokens[0]];
        if (typeof alias === "string" && alias.trim()) {
            tokens = [...alias.trim().split(/\s+/), ...tokens.slice(1)];
        }
        const hit = this.resolve(tokens);
        if (!hit) {
            const err = new MolaError("COMMAND_NOT_FOUND", `unknown command: ${tokens.join(" ")} (run "mola help")`, ExitCode.Usage);
            io.error(err);
            return err.exitCode;
        }
        const { command, rest } = hit;
        const pathStr = this.key(command.path);
        io.commandPath = pathStr;
        const args = parseArgv(rest);
        this.opts.bus?.emit(MolaEvents.CommandStarted, { traceId: this.opts.traceId, path: pathStr, argv: rest });
        const t0 = Date.now();
        try {
            const code = await command.handler(args, io);
            this.opts.bus?.emit(MolaEvents.CommandEnded, {
                traceId: this.opts.traceId,
                path: pathStr,
                exitCode: code,
                durationMs: Date.now() - t0,
            });
            io.finish();
            return code;
        }
        catch (err) {
            const e = toMolaError(err);
            this.opts.bus?.emit(MolaEvents.CommandEnded, {
                traceId: this.opts.traceId,
                path: pathStr,
                exitCode: e.exitCode,
                durationMs: Date.now() - t0,
                error: e.code,
            });
            io.error(err);
            return e.exitCode;
        }
    }
}
