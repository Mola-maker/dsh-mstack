/**
 * PluginContext construction (core §2.2, §6). Every ctx.* handle checks the
 * granted permission set on each call — the audit/accident boundary; the real
 * security gate is install-time (ADR-0002 §3). Every registration is pushed
 * onto a Cordis-style dispose stack; deactivation unwinds it.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { MolaError, PermissionError, ExitCode } from "@mola/plugin-sdk";
import { matchesAnyGlob } from "./glob.js";
import { deepFreeze } from "./merge.js";
function granted(set, cap) {
    return (set.mola ?? []).includes(cap);
}
function requireCap(set, cap, pluginId) {
    if (!granted(set, cap)) {
        throw new PermissionError(`${pluginId}: missing mola permission "${cap}"`);
    }
}
// ------------------------------------------------------------- registries
export class PluginRegistryImpl {
    infos = new Map();
    planRep = { ok: true, errors: [], order: [], quarantined: [] };
    addResolved(p) {
        this.infos.set(p.manifest.id, {
            id: p.manifest.id,
            version: p.manifest.version,
            kind: p.manifest.kind,
            tier: p.tier,
            enabled: true,
            state: "active",
            provides: p.manifest.provides ?? [],
            permissions: p.granted,
        });
    }
    markQuarantined(id, error) {
        const info = this.infos.get(id);
        if (info) {
            info.state = "quarantined";
            info.error = error instanceof Error ? error.message : String(error);
        }
        if (!this.planRep.quarantined.includes(id))
            this.planRep.quarantined.push(id);
    }
    setPlan(plan, resolveErrors) {
        this.planRep = {
            ok: plan.ok && resolveErrors.length === 0,
            errors: [...resolveErrors, ...plan.errors],
            order: plan.order.map((p) => p.manifest.id),
            quarantined: [],
        };
    }
    plan() {
        return this.planRep;
    }
    list() {
        return [...this.infos.values()].sort((a, b) => a.id.localeCompare(b.id));
    }
}
/** Doctor check registry — cmd-doctor owns the command, any plugin may add checks. */
export class DoctorRegistryImpl {
    checks = [];
    registerCheck(check) {
        this.checks.push(check);
        return () => {
            const i = this.checks.indexOf(check);
            if (i >= 0)
                this.checks.splice(i, 1);
        };
    }
    list() {
        return [...this.checks];
    }
}
export class AgentRegistryImpl {
    adapters = new Map();
    register(adapter) {
        this.adapters.set(adapter.id, adapter);
        return () => this.adapters.delete(adapter.id);
    }
    list() {
        return [...this.adapters.values()];
    }
    get(id) {
        return this.adapters.get(id);
    }
}
export class ToolRegistryImpl {
    adapters = new Map();
    register(adapter) {
        this.adapters.set(adapter.id, adapter);
        return () => this.adapters.delete(adapter.id);
    }
    list() {
        return [...this.adapters.values()];
    }
    get(id) {
        return this.adapters.get(id);
    }
}
// --------------------------------------------------------- gated services
function normalizeArgv0(argv0) {
    return path.basename(argv0).replace(/\.exe$/i, "").toLowerCase();
}
function makeExecService(set, pluginId, log) {
    return {
        exec(argv, opts = {}) {
            if (argv.length === 0) {
                return Promise.reject(new MolaError("USAGE_ERROR", "exec: empty argv", ExitCode.Usage));
            }
            const allow = set["process.exec"] ?? [];
            const name = normalizeArgv0(argv[0]);
            const ok = allow.includes("*") || allow.some((a) => normalizeArgv0(a) === name);
            log.debug("process.exec check", { plugin: pluginId, argv0: argv[0], granted: ok });
            if (!ok) {
                return Promise.reject(new PermissionError(`${pluginId}: process.exec does not allow "${argv[0]}"`));
            }
            return new Promise((resolvePromise, rejectPromise) => {
                const child = spawn(argv[0], argv.slice(1), {
                    cwd: opts.cwd,
                    env: opts.env ? { ...process.env, ...opts.env } : process.env,
                    stdio: ["pipe", "pipe", "pipe"],
                });
                let stdout = "";
                let stderr = "";
                child.stdout.on("data", (d) => (stdout += String(d)));
                child.stderr.on("data", (d) => (stderr += String(d)));
                child.on("error", rejectPromise);
                let timer;
                if (opts.timeoutMs) {
                    timer = setTimeout(() => {
                        child.kill();
                        rejectPromise(new MolaError("UPSTREAM_UNAVAILABLE", `exec timed out after ${opts.timeoutMs}ms: ${argv[0]}`, ExitCode.Unavailable));
                    }, opts.timeoutMs);
                }
                child.on("close", (code) => {
                    if (timer)
                        clearTimeout(timer);
                    resolvePromise({ code: code ?? 1, stdout, stderr });
                });
                if (opts.input !== undefined) {
                    child.stdin.write(opts.input);
                }
                child.stdin.end();
            });
        },
    };
}
function expandHome(p) {
    if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
        return path.join(os.homedir(), p.slice(1));
    }
    return p;
}
function makeFsService(set, pluginId, log) {
    return {
        readFile(p) {
            const abs = path.resolve(expandHome(p));
            const allow = set["fs.read"];
            const ok = matchesAnyGlob(abs, allow?.map(expandHome));
            log.debug("fs.read check", { plugin: pluginId, path: abs, granted: ok });
            if (!ok)
                throw new PermissionError(`${pluginId}: fs.read does not allow "${abs}"`);
            return fs.readFileSync(abs, "utf8");
        },
        writeFile(p, data) {
            const abs = path.resolve(expandHome(p));
            const allow = set["fs.write"];
            const ok = matchesAnyGlob(abs, allow?.map(expandHome));
            log.debug("fs.write check", { plugin: pluginId, path: abs, granted: ok });
            if (!ok)
                throw new PermissionError(`${pluginId}: fs.write does not allow "${abs}"`);
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, data, "utf8");
        },
    };
}
function makeSidecarStub() {
    const fail = () => {
        throw new MolaError("UPSTREAM_UNAVAILABLE", "no sidecars in B1 — @mola/rpc ships the client half only; sidecars start in B3", ExitCode.Unavailable);
    };
    return {
        ensure: () => Promise.resolve(fail()),
        call: () => Promise.resolve(fail()),
        notify: () => fail(),
    };
}
export function makePluginContext(p, services) {
    const id = p.manifest.id;
    const perms = p.granted;
    const log = services.rootLog.child({ plugin: id });
    const disposers = [];
    const track = (d) => {
        disposers.push(d);
        return d;
    };
    // config view: read requires config.read
    const configView = {
        get: (key, fallback) => {
            requireCap(perms, "config.read", id);
            return services.config.get(key, fallback);
        },
        has: (key) => {
            requireCap(perms, "config.read", id);
            return services.config.has(key);
        },
        all: () => {
            requireCap(perms, "config.read", id);
            return services.config.all();
        },
        onChange: (fn) => track(services.config.onChange(fn)),
    };
    // event bus view: every registration is owner-tagged for the death-loop brake
    const eventsView = {
        emit: (event, payload, source) => {
            requireCap(perms, "events", id);
            services.bus.emit(event, payload, { ...source, plugin: id });
        },
        on: (event, fn) => {
            requireCap(perms, "events", id);
            return track(services.bus.on(event, fn, id));
        },
        hook: (event, fn) => {
            requireCap(perms, "events", id);
            return track(services.bus.hook(event, fn, id));
        },
        runWaterfall: (event, value) => {
            requireCap(perms, "events", id);
            return services.bus.runWaterfall(event, value);
        },
        onSerial: (event, fn) => {
            requireCap(perms, "events", id);
            return track(services.bus.onSerial(event, fn, id));
        },
        runSerial: (event, payload) => {
            requireCap(perms, "events", id);
            return services.bus.runSerial(event, payload);
        },
    };
    const commandsView = {
        register: (command) => {
            requireCap(perms, "commands", id);
            return track(services.router.register(command, id));
        },
    };
    const doctorView = {
        registerCheck: (check) => {
            requireCap(perms, "doctor", id);
            return track(services.doctor.registerCheck(check));
        },
        list: () => services.doctor.list(),
    };
    const agentsView = {
        register: (adapter) => {
            requireCap(perms, "agents.register", id);
            return track(services.agents.register(adapter));
        },
        list: () => services.agents.list(),
        get: (aid) => services.agents.get(aid),
    };
    const toolsView = {
        register: (adapter) => {
            requireCap(perms, "tools.register", id);
            return track(services.tools.register(adapter));
        },
        list: () => services.tools.list(),
        get: (tid) => services.tools.get(tid),
    };
    const stateView = new Proxy({}, {
        get(_t, prop) {
            requireCap(perms, "state.kv", id);
            const ns = services.stateNamespace(id);
            return ns[prop];
        },
    });
    const ctx = {
        id,
        manifest: deepFreeze(p.manifest),
        log,
        events: eventsView,
        commands: commandsView,
        config: configView,
        configWriter: granted(perms, "config.write") ? services.configWriter : undefined,
        state: stateView,
        permissions: perms,
        process: makeExecService(perms, id, log),
        fs: makeFsService(perms, id, log),
        sidecars: makeSidecarStub(),
        plugins: services.plugins,
        doctor: doctorView,
        agents: agentsView,
        tools: toolsView,
        dispose(fn) {
            disposers.push(fn);
        },
        async runDisposers() {
            // unwind in reverse registration order (Cordis-style)
            for (const fn of [...disposers].reverse()) {
                try {
                    await fn();
                }
                catch (err) {
                    log.warn("disposer failed", { error: String(err) });
                }
            }
            disposers.length = 0;
        },
    };
    return ctx;
}
