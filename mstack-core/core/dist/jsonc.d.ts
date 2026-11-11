/**
 * JSONC parsing (core §2.4: JSONC everywhere, one parser, no YAML footguns).
 * Supports // line comments, block comments, and trailing commas — nothing else.
 * Parse failures map to CONFIG_INVALID / exit 65.
 */
/** Strip comments and trailing commas, preserving string contents. */
export declare function stripJsonc(text: string): string;
export declare function parseJsonc(text: string, fileName?: string): unknown;
