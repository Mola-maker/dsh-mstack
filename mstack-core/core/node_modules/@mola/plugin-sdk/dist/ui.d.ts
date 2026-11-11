/**
 * The mola UI kit (B2e) — the small human-facing layer shared by core and the
 * command plugins. Rules it exists to enforce (core §8.2 / B1 lesson):
 *
 *   - `--json` stdout carries exactly one envelope, stderr one error line.
 *     Everything here is for human mode only; callers guard with `!io.json`.
 *   - Color is a decoration, never information: with NO_COLOR, MOLA_NO_COLOR,
 *     `--no-color` or a non-TTY stream every paint is the identity function,
 *     so tests and pipes see plain strings.
 *   - The spinner writes to stderr only and is disabled when the stream is not
 *     a TTY or when the command runs in --json / --quiet mode.
 *   - Tables align by display width, so CJK text (2 cells) keeps its columns.
 */
/** Anything paintable: identity when color is off. */
export type Paint = (s: string) => string;
export interface Palette {
    /** false ⇒ every paint is the identity function (no ANSI escapes) */
    readonly color: boolean;
    readonly bold: Paint;
    readonly dim: Paint;
    readonly red: Paint;
    readonly green: Paint;
    readonly yellow: Paint;
    readonly cyan: Paint;
}
/** A palette; `palette(false)` is the plain-text one used by tests and pipes. */
export declare function palette(color: boolean): Palette;
/**
 * True when the environment asked for no color: the no-color.org convention
 * (NO_COLOR), mola's own MOLA_NO_COLOR, or the `--no-color` flag. The bin
 * strips `--no-color` before handlers run, but it currently does not export
 * the decision, so the kit also scans process.argv — remove that scan when
 * boot() propagates the flag (see ux-notes.md).
 */
export declare function noColorRequested(argv?: string[]): boolean;
/** Color is decoration: only on an interactive TTY that did not opt out. */
export declare function detectColor(stream?: {
    isTTY?: boolean;
}): boolean;
export type Status = "ok" | "warn" | "fail";
export declare const GLYPHS: Record<Status, string>;
/** The status glyph, colored when the palette allows it. */
export declare function statusGlyph(status: Status, p?: Palette): string;
export declare function stripAnsi(s: string): string;
/** Terminal cells a string occupies: ANSI-free, CJK counts as 2. */
export declare function displayWidth(s: string): number;
export interface TableOptions {
    /** optional header row (rendered by the caller — table() stays palette-free) */
    header?: string[];
    rows: string[][];
    /** column separator, default two spaces */
    gap?: string;
    /** prefix on every line, default "" (callers indent to taste) */
    indent?: string;
}
/**
 * Aligned left-only table lines. The last column is never padded, so lines
 * carry no trailing whitespace. Cells may contain ANSI — width uses
 * displayWidth().
 */
export declare function table(opts: TableOptions): string[];
/** Anything the spinner can write to (process.stderr in practice). */
export interface SpinnerStream {
    write(s: string): unknown;
    isTTY?: boolean;
}
/** The spinner is interactive decoration: a TTY on stderr that opted into color. */
export declare function spinnerEnabled(stream?: SpinnerStream): boolean;
export interface SpinnerOptions {
    text: string;
    stream?: SpinnerStream;
    /** default spinnerEnabled(stream) — pass false for --json / --quiet */
    enabled?: boolean;
    palette?: Palette;
}
/**
 * A one-line stderr spinner for long operations. When disabled it does
 * nothing at all (no writes, no timer), so --json stdout/stderr stay clean
 * and non-interactive runs stay quiet. Always stop() it — a stopped spinner
 * clears its own line and tears the timer down.
 */
export declare class Spinner {
    private readonly opts;
    private timer;
    private frame;
    constructor(opts: SpinnerOptions);
    private get stream();
    private get pal();
    get running(): boolean;
    start(): this;
    /** Swap the text mid-flight (e.g. after a gate approved the route). */
    update(text: string): this;
    private render;
    /** Erase the spinner line and (optionally) print a final line instead. */
    stop(final?: string): void;
    succeed(message?: string): void;
    fail(message?: string): void;
}
/**
 * The one policy for command plugins: spinners only in human mode, only on a
 * TTY, never in --json or --quiet. `const spin = ioSpinner(io, "text")`.
 */
export declare function ioSpinner(io: {
    json: boolean;
    quiet: boolean;
}, text: string, stream?: SpinnerStream): Spinner;
/**
 * The short `mola` (no arguments) banner — two lines, honest, no box drawing.
 */
/** `-v` / `--verbose` (the bin strips it before handlers see their own argv). */
export declare function verboseRequested(argv?: string[]): boolean;
/** Compact duration for the one-line run summary. Missing values stay "-". */
export declare function formatDuration(ms: number | undefined): string;
/**
 * Human rendering of a handler's `io.data()` when the handler wrote nothing.
 * A table or a key/value list — never raw JSON (B2e).
 */
export declare function formatValue(value: unknown): string;
export declare function banner(p?: Palette): string;
