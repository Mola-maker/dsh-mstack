/**
 * Minimal glob matching for permission allow-lists (core §6): `**` crosses
 * separators, `*` and `?` stay within one segment. Paths are normalized to `/`
 * before matching so the same grants behave on Linux and Windows.
 */
export declare function globToRegExp(glob: string): RegExp;
export declare function matchesAnyGlob(path: string, globs: string[] | undefined): boolean;
