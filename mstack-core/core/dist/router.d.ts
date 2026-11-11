/**
 * Command router (core §2.3). Commands are namespaced paths registered by
 * plugins; longest path wins; aliases are config, not code. Handlers return an
 * ExitCode and never call process.exit. The router owns the --json envelope
 * (core §8.2): one document on stdout, diagnostics on stderr.
 */
import type { Command, Disposer, EventBus, Io } from "@mola/plugin-sdk";
import { ExitCode } from "@mola/plugin-sdk";
export interface RegisteredCommand extends Command {
    owner: string;
}
export interface RouterOptions {
    bus?: EventBus;
    traceId: string;
}
/** Io implementation; the router calls finish() after the handler returns. */
export declare class IoImpl implements Io {
    readonly json: boolean;
    readonly quiet: boolean;
    readonly traceId: string;
    readonly cwd: string;
    readonly yes: boolean;
    private result;
    /** true once the handler printed its own human line (so finish() stays quiet) */
    private wroteHuman;
    commandPath: string;
    constructor(json: boolean, quiet: boolean, traceId: string, cwd: string, yes: boolean);
    data(value: unknown): void;
    out(line: string): void;
    note(message: string): void;
    error(err: unknown): void;
    finish(): void;
}
export declare class CommandRouter {
    private readonly opts;
    private commands;
    constructor(opts: RouterOptions);
    private key;
    register(command: Command, owner: string): Disposer;
    list(): RegisteredCommand[];
    /** Longest registered path prefix over leading positional tokens. */
    resolve(tokens: string[]): {
        command: RegisteredCommand;
        rest: string[];
    } | undefined;
    private maxDepth;
    help(): string;
    dispatch(argv: string[], io: IoImpl, aliases?: Record<string, string>): Promise<ExitCode>;
}
