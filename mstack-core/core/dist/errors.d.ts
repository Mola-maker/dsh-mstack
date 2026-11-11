/**
 * Error/exit-code registry (core §8.2/§8.3). The classes live in
 * @mola/plugin-sdk so plugins can throw them without importing the host;
 * this module re-exports them and owns the code → sysexits mapping.
 */
import { ExitCode, type MolaErrorCode } from "@mola/plugin-sdk";
export { ExitCode, MolaError, PolicyDenial, PermissionError, toMolaError } from "@mola/plugin-sdk";
export type { MolaErrorCode } from "@mola/plugin-sdk";
/** Machine-readable code → sysexits mapping, for consumers and tests. */
export declare const ERROR_EXIT: Readonly<Record<MolaErrorCode, ExitCode>>;
