/**
 * Plugin loader (ADR-0002, core §2.2): resolve → validate → plan → activate.
 *
 * - resolve: builtin dirs (bundled with mola) → ~/.mola/plugins → project
 *   plugins from .mola/config.jsonc (`plugins:` paths).
 * - validate: mola-plugin.json against the SDK contract (exit 65 on bad data).
 * - plan: topo sort over provides/requires, conflicts check. A cycle or missing
 *   provider is a load error recorded in the plan — boot continues, the
 *   plugins.plan-ok doctor check and `mola plugin validate` surface it.
 * - activate: PluginContext per plugin; an activate() throw quarantines the
 *   plugin (mola.plugin.quarantined) and boot continues degraded (core §2.1).
 *   B1 loads every tier in-process; worker isolation for `untrusted` arrives
 *   with third-party install support in B2 (ADR-0002 §3).
 *
 * B2 adds the third-party install registry (~/.mola/plugins.json), the
 * permission diff the installer confirms (core §5 step 4) and the SHA-512
 * integrity pin. The installer itself lives in cmd-plugin; the shared
 * record shape and the diff/hash helpers live here so both sides agree.
 */
import type { Logger, PermissionSet, Plugin, PluginContext, PluginManifest, TrustTier } from "@mola/plugin-sdk";
export interface PluginSource {
    dir: string;
    tier: TrustTier;
    /** granted permission snapshot from ~/.mola/plugins.json (install-time gate) */
    granted?: PermissionSet;
}
export interface ResolvedPlugin {
    dir: string;
    tier: TrustTier;
    manifest: PluginManifest;
    granted: PermissionSet;
}
export interface ResolveResult {
    resolved: ResolvedPlugin[];
    errors: string[];
}
export interface LoadPlan {
    ok: boolean;
    errors: string[];
    order: ResolvedPlugin[];
}
/** Read + validate the manifest of one plugin directory. */
export declare function resolvePlugin(source: PluginSource): ResolvedPlugin | string;
export declare function resolvePlugins(sources: PluginSource[]): ResolveResult;
/** Topo sort over provides/requires + conflict check (ADR-0002 §1). */
export declare function planLoad(resolved: ResolvedPlugin[]): LoadPlan;
export interface ActivatedPlugin {
    resolved: ResolvedPlugin;
    plugin: Plugin;
    ctx: PluginContext;
    disposeAll: () => Promise<void>;
}
/** The six permission buckets of the manifest contract (core §6). */
export declare const PERMISSION_KEYS: readonly ["process.exec", "fs.read", "fs.write", "net.connect", "env.read", "mola"];
export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export interface PermissionDiffEntry {
    permission: PermissionKey;
    added: string[];
    removed: string[];
}
export interface PermissionDiff {
    added: PermissionDiffEntry[];
    removed: PermissionDiffEntry[];
    /** true when the new set is a strict superset of the old one */
    escalates: boolean;
}
/**
 * Diff two permission sets (ADR-0002 §3, core §5 install step 4): the diff
 * the installer prints and the user confirms. "added" = the new set asks for
 * something the old one did not; "removed" = the old grant is gone.
 *
 * A grant is only a grant if the *old* set contained it, so a permission that
 * was never granted shows up as `added` even when the new set also lacks it —
 * that is the point: the diff is "what this plugin wants now", not a delta
 * between two arbitrary sets.
 */
export declare function diffPermissions(before: PermissionSet | undefined, after: PermissionSet | undefined): PermissionDiff;
/** Flatten a permission set to "key: value" lines — the human-readable diff. */
export declare function formatPermissionDiff(diff: PermissionDiff): string[];
/**
 * One record of ~/.mola/plugins.json — the install-time registry
 * (ADR-0002 §2, core §5). Keyed by the plugin's *install directory name*
 * under ~/.mola/plugins (not by manifest id: two versions may coexist on
 * disk, one is active — ADR-0002 §1).
 */
export interface PluginRegistryRecord {
    /** manifest id — for the human report and for `plugin enable <id>` lookup */
    id: string;
    version: string;
    kind: string;
    /** builtin | verified | untrusted (ADR-0002 §2 trust tiers) */
    tier: TrustTier;
    /** install directory under ~/.mola/plugins */
    dir: string;
    /** where it came from: a local path, an npm spec, a git url */
    source: string;
    /** SHA-512 of the installed tree — the integrity pin (ADR-0002 §2) */
    sha512?: string;
    /** the permission snapshot granted at install time */
    permissions?: PermissionSet;
    /** `plugin disable` flips this; disabled plugins are not resolved */
    enabled: boolean;
    installedAt: string;
    updatedAt?: string;
}
/** The whole registry file: `{ "<install dir>": record }`. */
export type PluginRegistryFile = Record<string, PluginRegistryRecord>;
export declare function pluginsRegistryFile(homeDir: string): string;
export declare function pluginsInstallDir(homeDir: string): string;
/** Read ~/.mola/plugins.json; a missing or broken file is an empty registry. */
export declare function readPluginRegistry(homeDir: string, log?: Logger): PluginRegistryFile;
/** Write ~/.mola/plugins.json atomically (tmp + rename on the same volume). */
export declare function writePluginRegistry(homeDir: string, registry: PluginRegistryFile): void;
/**
 * SHA-512 over an installed plugin tree — the integrity pin (ADR-0002 §2,
 * core §5 step 4: "Record the granted snapshot + tarball SHA-512").
 *
 * A local directory install has no tarball, so the pin is computed over the
 * tree itself: every regular file, sorted by its POSIX-relative path, hashed
 * into one digest together with its path and size. The digest therefore
 * changes when a file is added, removed, renamed or edited — the property an
 * integrity pin needs. `node_modules` and dot-directories are skipped: they
 * are dependency state, not plugin content.
 */
export declare function hashPluginTree(dir: string): string;
/** SHA-512 of one file (the tarball case: a downloaded .tgz). */
export declare function hashPluginFile(file: string): string;
/** POSIX-relative paths of the plugin's own files, sorted. */
export declare function listPluginFiles(dir: string, prefix?: string): string[];
export interface ActivateHooks {
    makeContext(p: ResolvedPlugin): PluginContext & {
        runDisposers(): Promise<void>;
    };
    onActivated(p: ResolvedPlugin): void;
    onQuarantined(p: ResolvedPlugin, error: unknown): void;
    log: Logger;
}
/** Activate in plan order; failures quarantine, never stop the boot. */
export declare function activateAll(plan: LoadPlan, hooks: ActivateHooks): Promise<ActivatedPlugin[]>;
/**
 * Scan ~/.mola/plugins for installed third-party plugins (resolve only).
 *
 * The registry file (~/.mola/plugins.json) is written by `mola plugin
 * install` — its format lives with the installer, in
 * cli/packages/plugins/cmd-plugin/src/registry.ts; this side only needs three
 * fields of a record: the trust tier, the granted permission snapshot
 * (install-time gate) and the enabled flag.
 */
export declare function scanUserPlugins(homeDir: string, log: Logger): PluginSource[];
