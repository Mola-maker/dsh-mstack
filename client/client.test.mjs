// Loads client.js the way DSH's module system does (window.__ModuleLoader__.load with a module-table require)
// against a small stand-in React, and checks what it registers and renders. Run: node --test client/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("./client.js", import.meta.url), "utf8");

/** A React stand-in: createElement builds plain objects; hooks keep one state slot and record effects. */
function fakeReact() {
  const state = { value: undefined, set: false, effects: [] };
  return {
    state,
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
    useState: (init) => [state.set ? state.value : init, (v) => { state.value = v; state.set = true; }],
    useEffect: (fn) => { state.effects.push(fn); },
  };
}

/** Evaluate client.js as the DSH loader would; returns its exports and the stand-ins. */
function load({ storage, fetchImpl } = {}) {
  const React = fakeReact();
  let registration;
  const timers = [];
  const sandbox = {
    window: { __ModuleLoader__: { load: (r) => { registration = r; } } },
    localStorage: storage,
    fetch: fetchImpl ?? (() => Promise.resolve({})),
    setInterval: (fn, ms) => { timers.push(ms); return timers.length; },
    clearInterval: () => {},
  };
  vm.runInNewContext(SOURCE, sandbox, { filename: "client.js" });
  assert.equal(registration.id, "@molamaker/dsh-mstack");
  const required = [];
  const exports = registration.factory((spec) => { required.push(spec); if (spec === "react") return React; throw new Error("unexpected require " + spec); });
  return { exports, React, required, timers };
}

const store = (v) => ({ getItem: (k) => (k === "mstack.console" ? v : null) });

test("registers through the loader, asks only for react, and injects slots", () => {
  const { exports, required } = load();
  assert.deepEqual(required, ["react"]);
  assert.equal(JSON.stringify(exports.inject), '["slots"]');
});

test("apply puts a status line beside the session title and a tab beside Chat", () => {
  const { exports } = load();
  const regs = [];
  const ctx = { slots: { inject: (name, fn) => { regs.push({ name, reg: fn() }); }, register: (desc, component) => ({ desc, component }) } };
  exports.apply(ctx);
  assert.deepEqual(regs.map((r) => [r.name, r.reg.desc.id, r.reg.desc.order]), [
    ["conversation.session.header.actions", "mstack-status", -4],
    ["conversation.view", "mstack", 30],
  ]);
  assert.equal(regs[1].reg.desc.label(), "mstack");
  assert.equal(JSON.stringify(regs[0].reg.desc.inject("s1")), '{"sessionId":"s1"}');
  assert.equal(regs[0].reg.component, exports.StatusChip);
  assert.equal(regs[1].reg.component, exports.ConsoleView);
});

test("the console address: default, a loopback override, and anything else ignored", () => {
  const { exports } = load();
  const base = (v) => JSON.stringify(exports.consoleBase(v));
  const def = JSON.stringify({ origin: "http://127.0.0.1:7333", query: "" });
  assert.equal(base(undefined), def);
  assert.equal(base(store("http://127.0.0.1:7400/")), JSON.stringify({ origin: "http://127.0.0.1:7400", query: "" }));
  assert.equal(base(store("http://localhost:7401")), JSON.stringify({ origin: "http://localhost:7401", query: "" }));
  assert.equal(base(store("http://127.0.0.1:7333/?token=abc_DEF-1")), JSON.stringify({ origin: "http://127.0.0.1:7333", query: "?token=abc_DEF-1" }));
  for (const bad of ["https://evil.example", "http://192.168.1.5:7333", "javascript:alert(1)", "http://127.0.0.1:7333/x", "http://127.0.0.1:7333/?token=a\"b", "http://127.0.0.1:7333/?token=a&x=1"]) assert.equal(base(store(bad)), def, bad);
  assert.equal(base({ getItem: () => { throw new Error("blocked"); } }), def);
});

test("before the probe answers nothing shows; up shows the console; down says how to start it", async () => {
  let answer;
  const { exports, React, timers } = load({ fetchImpl: () => new Promise((res, rej) => { answer = { res, rej }; }) });
  assert.equal(exports.StatusChip(), null);
  // the effect probes /embed without cors and every 15 s
  React.state.effects[0]();
  assert.deepEqual(timers, [15000]);
  answer.res({});
  await new Promise((r) => setTimeout(r, 0));
  const chip = exports.StatusChip();
  assert.equal(chip.type, "iframe");
  assert.equal(chip.props.src, "http://127.0.0.1:7333/embed");
  assert.equal(exports.ConsoleView().props.src, "http://127.0.0.1:7333/");

  const down = load({ fetchImpl: () => Promise.reject(new Error("refused")) });
  down.React.state.effects.length = 0;
  down.exports.StatusChip();
  down.React.state.effects[0]();
  await new Promise((r) => setTimeout(r, 0));
  const off = down.exports.StatusChip();
  assert.equal(off.type, "span");
  assert.match(off.props.title, /mola web/);
  const view = down.exports.ConsoleView();
  // before the first answer the tab shows nothing (no flash of the browser's error page)
  const fresh = load({ fetchImpl: () => new Promise(() => undefined) });
  assert.equal(fresh.exports.ConsoleView(), null);
  assert.equal(view.type, "div");
  assert.ok(JSON.stringify(view).includes("mola web"));
});

test("a token in the address reaches both pages", async () => {
  const { exports, React } = load({ storage: store("http://127.0.0.1:7333/?token=t0k") });
  exports.StatusChip();
  React.state.effects[0]();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(exports.StatusChip().props.src, "http://127.0.0.1:7333/embed?token=t0k");
  assert.equal(exports.ConsoleView().props.src, "http://127.0.0.1:7333/?token=t0k");
});
