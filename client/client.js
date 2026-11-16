// @mola/dsh-mstack browser half: mstack's state inside the DeepSeek Harness web client.
//
//  - beside every session's title, a compact status line (verify verdict, environment gaps, runs that wait for you)
//  - a "mstack" tab beside Chat, holding the mola console (approve, deny, stop, start a run, check again)
//
// Both are the `mola web` console embedded from http://127.0.0.1:7333 (another port: localStorage key
// "mstack.console"). DSH and the console then always show the same thing, and the TUI reads the same files.
// When the console is not running they say how to start it.
//
// Hand-written in DSH's client bundle format (window.__ModuleLoader__.load with a factory that receives the
// module-table require), so it needs no DSH checkout to build. React comes from DSH's module table.
window.__ModuleLoader__.load({ id: "@mola/dsh-mstack", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
const React = require("react");
const h = React.createElement;

const DEFAULT_CONSOLE = "http://127.0.0.1:7333";

/** The console's origin: localStorage "mstack.console" when it is a loopback http URL, else the default. */
function consoleBase(storage) {
  try {
    const v = storage && storage.getItem("mstack.console");
    if (v && /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(v.replace(/\/+$/, ""))) return v.replace(/\/+$/, "");
  } catch (e) {
    // storage blocked: the default
  }
  return DEFAULT_CONSOLE;
}

/**
 * Is the console up? A no-cors request resolves for any answer and rejects when nothing listens. Checked on mount
 * and every 15 s, so starting `mola web` later is picked up without a reload.
 */
function useConsoleUp(base) {
  const [up, setUp] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    const probe = () => fetch(base + "/embed", { mode: "no-cors", cache: "no-store" }).then(() => { if (live) setUp(true); }, () => { if (live) setUp(false); });
    probe();
    const timer = setInterval(probe, 15000);
    return () => { live = false; clearInterval(timer); };
  }, [base]);
  return up;
}

const quiet = { fontSize: "12px", opacity: 0.7, whiteSpace: "nowrap" };

function StatusChip() {
  const base = consoleBase(typeof localStorage === "undefined" ? undefined : localStorage);
  const up = useConsoleUp(base);
  if (up === null) return null;
  if (!up) return h("span", { style: quiet, title: "mola 控制台没有运行。在终端运行 mola web 后，这里会显示验收和缺口。" }, "mstack 未连接");
  return h("iframe", {
    src: base + "/embed",
    title: "mstack 状态",
    style: { border: 0, height: "26px", width: "360px", maxWidth: "40vw", background: "transparent", colorScheme: "normal" },
  });
}

function ConsoleView() {
  const base = consoleBase(typeof localStorage === "undefined" ? undefined : localStorage);
  const up = useConsoleUp(base);
  if (up === false) {
    return h("div", { style: { padding: "28px", lineHeight: 1.7 } },
      h("p", { style: { margin: "0 0 8px", fontWeight: 700 } }, "mola 控制台没有运行"),
      h("p", { style: { margin: 0 } }, "在终端运行 ", h("code", null, "mola web"), "，这一页会自动显示它。地址不是 7333 时，在浏览器控制台执行 ",
        h("code", null, "localStorage.setItem(\"mstack.console\", \"http://127.0.0.1:<端口>\")"), "。"));
  }
  return h("iframe", { src: base + "/", title: "mola 控制台", style: { border: 0, width: "100%", height: "100%", minHeight: "480px" } });
}

exports.inject = ["slots"];

exports.apply = function apply(ctx) {
  // beside the session title, after the agent preset (-10) and other plugins' context (-5)
  ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
    name: "conversation.session.header.actions",
    id: "mstack-status",
    order: -4,
    inject: (sessionId) => ({ sessionId }),
  }, StatusChip));
  // a tab beside Chat and Trajectory
  ctx.slots.inject("conversation.view", () => ctx.slots.register({
    name: "conversation.view",
    id: "mstack",
    order: 30,
    label: () => "mstack",
    inject: (sessionId) => ({ sessionId }),
  }, ConsoleView));
};

exports.consoleBase = consoleBase;
exports.StatusChip = StatusChip;
exports.ConsoleView = ConsoleView;
return module.exports; } });
