/**
 * Boot sequence (core §2.1):
 *
 *   a. load config layers          → ConfigView        } fatal on failure
 *   b. open state store            → StateStore        } (steps a–c → exit 70,
 *   c. init logging with traceId   → Logger            }  bad config → 65)
 *   d. resolve+validate+plan plugins → LoadPlan
 *   e. activate in topo order; failures quarantine, boot continues degraded
 *   3. router.dispatch(argv)
 *   4. shutdown: mola.core.shutdown (serial), deactivate in reverse, flush
 */
export interface GlobalFlags {
    json: boolean;
    verbose: number;
    quiet: boolean;
    yes: boolean;
    noColor: boolean;
    configFile?: string;
    cwd: string;
}
export interface BootOptions {
    /** command argv with global flags already stripped by the bin */
    argv: string[];
    flags: GlobalFlags;
    traceId: string;
    /** directories containing mola-plugin.json for each bundled plugin */
    builtinPluginDirs: string[];
}
export declare function boot(opts: BootOptions): Promise<number>;
