/**
 * Config deep-merge (core §2.4): later layer wins for scalars, arrays and
 * objects; `null` deletes the key.
 */
export declare function deepMerge(base: unknown, overlay: unknown): unknown;
export declare function deepFreeze<T>(value: T): T;
/** Get a dotted path ("a.b.c") from a plain object. */
export declare function getPath(obj: unknown, key: string): {
    found: boolean;
    value?: unknown;
};
/** Set a dotted path on a plain object; `null`/undefined deletes. */
export declare function setPath(obj: Record<string, unknown>, key: string, value: unknown): void;
