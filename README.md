# dsh-mstack

[![DeepSeek Harness](https://img.shields.io/badge/DSH-Plugin-blue)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**dsh-mstack** is an official DeepSeek Harness plugin integrating Mola-maker's `mstack` workflow skills and tools directly into the DSH runtime and session skill catalog.

## Bundled Skills

This plugin registers the complete set of 16 battle-tested workflow skills:

| Skill | Description |
|---|---|
| `m-start` | The primary entry router: inspects task context and `.mstack/` state to choose the appropriate workflow skill. |
| `m-think` | Design & premises analysis before implementation: wild brainstorming, attack premises, and architectural spec. |
| `m-plan` | Structured implementation planner: turns designs into atomic, verified, chronological steps. |
| `m-goal` | Autonomous run-until-done loop: drives multi-phase work to completion across checkpoints and restarts. |
| `m-team` | Multi-agent team orchestration: dynamic supervisor & teammate roles across successive rounds. |
| `m-dispatch` | Parallel task fan-out: isolate subtasks to subagents (Claude Code, DSH headless, Codex) in separate worktrees. |
| `m-verify` | Strict evidence verification: verifies builds, test outputs, and real behavior before claiming 'done'. |
| `m-review` | Multi-angle code and architecture reviews with independent reviewers. |
| `m-ship` | Clean PR and release preparation: git branching, test qualification, and CI monitoring. |
| `m-debug` | Root-cause debugger: minimal reproducers, hypothesis generation, and regression tests. |
| `m-deslop` | Removes AI boilerplate, excessive commentary, dead abstractions, and bloated diffs. |
| `m-guard` | Safety guardrails: destructive command checking, workspace freezes, and loop brakes. |
| `m-handoff` | Session snapshotting: saves and restores working state across compacts and model switches. |
| `m-learn` | Post-mortem analysis and knowledge consolidation into lessons and persistent skills. |
| `m-qa` | Automated quality assurance and acceptance testing against formal verification standards. |
| `m-research` | Multi-source, multi-angle research across Exa, Tavily, AnySearch, GitHub, and docs. |

## Installation in DeepSeek Harness

### Method 1: Using the DSH Plugin Manager / Market

Add the plugin to your active DSH profile patch (e.g. `cordis.patch.yml`):

```yaml
- id: dsh-mstack
  name: "@molamaker/dsh-mstack"
  config: {}
```

### Method 2: Local development load

Point your Loader or Cordis preset directly to the local directory:

```yaml
- id: dsh-mstack
  name: "E:/dsh-mstack-plugin"
  config: {}
```

## License

MIT © [Mola-maker](https://github.com/Mola-maker)

## mstack in the DSH web client

The plugin's browser half (`client/client.js`) adds two things to every session:

- **beside the session title**: a one-line status from mstack: the last verify verdict, environment gaps, runs that wait for you;
- **an `mstack` tab** beside Chat: the mola console (approve, deny, stop, start a run, check the environment again).

Both embed the `mola web` console, so DSH, the console in a browser and `mola tui` always show the same state. Start it once in a terminal:

```sh
mola web            # http://127.0.0.1:7333
```

When it is not running, the status says "mstack 未连接" and the tab says how to start it. Another port: run `localStorage.setItem("mstack.console", "http://127.0.0.1:<port>")` in the browser console (only loopback addresses are accepted).

The bundle is written by hand in DSH's client module format, so it needs no DSH checkout to build. `npm test` loads it the way DSH's loader does, against a stand-in React.
