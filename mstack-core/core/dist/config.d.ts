/**
 * Config layering (core §2.4, DESIGN §11 conflict 5: JSONC everywhere).
 *
 * Five layers, deep-merged, later wins:
 *   builtin defaults < ~/.mola/config.jsonc < .mola/config.jsonc (project)
 *     < MOLA_* env < flags (--config extra file)
 *
 * ConfigView is read-only + onChange (fs watch, debounced, emits
 * mola.config.changed via boot wiring). Writes go through `mola config set`
 * (cmd-config), which persists to the global file via writeGlobalConfig.
 * Secrets are never config — cmd-config refuses secret-shaped keys.
 */
import type { ConfigView, ConfigWriter, Disposer } from "@mola/plugin-sdk";
export interface LoadConfigOptions {
    /** resolved ~/.mola directory */
    homeDir: string;
    /** project dir for the .mola/config.jsonc layer */
    projectDir: string;
    env: Record<string, string | undefined>;
    /** --config <path>: whole extra file merged at the flags layer */
    extraFile?: string;
}
export declare const BUILTIN_DEFAULTS: Record<string, unknown>;
export declare class CoreConfig implements ConfigView {
    private readonly merged;
    private readonly watchers;
    private readonly listeners;
    private watcherHandles;
    constructor(layers: Record<string, unknown>[], watchFiles: Array<{
        layer: string;
        file: string;
    }>);
    get<T = unknown>(key: string, fallback?: T): T;
    has(key: string): boolean;
    all(): Record<string, unknown>;
    onChange(fn: (layer: string, keys: string[]) => void): Disposer;
    private ensureWatching;
    close(): void;
}
export declare function loadConfig(opts: LoadConfigOptions): CoreConfig;
/**
 * Persist one dotted key to the global layer. Comments are not preserved on
 * rewrite (JSONC is accepted on read; writes emit plain JSON).
 */
export declare function writeGlobalConfig(homeDir: string, key: string, value: unknown): void;
/** ConfigWriter granted to plugins whose permissions.mola includes config.write. */
export declare function makeConfigWriter(homeDir: string): ConfigWriter;
