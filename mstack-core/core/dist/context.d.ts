/**
 * PluginContext construction (core §2.2, §6). Every ctx.* handle checks the
 * granted permission set on each call — the audit/accident boundary; the real
 * security gate is install-time (ADR-0002 §3). Every registration is pushed
 * onto a Cordis-style dispose stack; deactivation unwinds it.
 */
import type { AgentAdapter, AgentRegistry, ConfigView, ConfigWriter, Disposer, DoctorCheck, DoctorRegistry, Logger, PluginContext, PluginInfo, PlanReport, PluginRegistry, StateNamespace, ToolAdapter, ToolRegistry } from "@mola/plugin-sdk";
import type { CoreEventBus } from "./bus.js";
import type { CommandRouter } from "./router.js";
import type { ResolvedPlugin, LoadPlan } from "./loader.js";
export declare class PluginRegistryImpl implements PluginRegistry {
    private infos;
    private planRep;
    addResolved(p: ResolvedPlugin): void;
    markQuarantined(id: string, error: unknown): void;
    setPlan(plan: LoadPlan, resolveErrors: string[]): void;
    plan(): PlanReport;
    list(): PluginInfo[];
}
/** Doctor check registry — cmd-doctor owns the command, any plugin may add checks. */
export declare class DoctorRegistryImpl implements DoctorRegistry {
    private checks;
    registerCheck(check: DoctorCheck): Disposer;
    list(): DoctorCheck[];
}
export declare class AgentRegistryImpl implements AgentRegistry {
    private adapters;
    register(adapter: AgentAdapter): Disposer;
    list(): AgentAdapter[];
    get(id: string): AgentAdapter | undefined;
}
export declare class ToolRegistryImpl implements ToolRegistry {
    private adapters;
    register(adapter: ToolAdapter): Disposer;
    list(): ToolAdapter[];
    get(id: string): ToolAdapter | undefined;
}
export interface ContextServices {
    bus: CoreEventBus;
    router: CommandRouter;
    config: ConfigView;
    configWriter: ConfigWriter;
    stateNamespace(pluginId: string): StateNamespace;
    rootLog: Logger;
    plugins: PluginRegistryImpl;
    doctor: DoctorRegistryImpl;
    agents: AgentRegistryImpl;
    tools: ToolRegistryImpl;
}
export declare function makePluginContext(p: ResolvedPlugin, services: ContextServices): PluginContext & {
    runDisposers(): Promise<void>;
};
