# GitHub Copilot CLI: Static Analysis

## Scope and provenance

The inspected CLI was version `1.0.98`, installed through VS Code's Copilot CLI integration. Its launcher is a shell script that starts the VS Code-bundled Node runtime with `ELECTRON_RUN_AS_NODE=1` and loads `copilotCLIShim.js`. The shim identifies itself as copied from `microsoft/vscode`; this analysis does not treat it as the Copilot CLI implementation.

The official npm package `@github/copilot@1.0.98` is a small platform selector. Its Linux x64 package, `@github/copilot-linux-x64@1.0.98`, contains the native payload. The inspected ELF came from that exact package and was kept outside the repository.

## REA evidence

REA `analyze-javascript-application` examined the installed shim directory without executing its JavaScript:

- Application Evidence: `ev_a7240a48e7736457a578499256ea61724d3ddfa776385546902941a03d689452`
- Root artifact SHA-256: `e3935f0e403795f9e0576453528b3634f1c69a33710fbd412077410f6db6a648`
- Structural graph: 7 nodes, 0 relationships
- Semantic graph: 4,457 nodes, 4,198 relations, 1,082 unknowns

A semantic trace seeded at the `spawnSync` property returned 7 candidate property-read relations and 7 relevant unknowns. Coverage remained `partial`: the receiver could not be resolved to a retained container. Candidate edges are not proof of runtime calls.

The platform ELF was inspected with REA's offline `inspect-binary-layout` workflow using the documented pinned Python dependencies in a temporary virtual environment:

- Layout Evidence: `ev_8d90c5aedc7543bb835ff61c09fead95e5c8483d98216db9e0bdad2e5477c3b4`
- Binary SHA-256: `a733f3e635944324d5da1782c51bb7f96dfa2400ff593fcd3533987a63d8fbd8`
- Format: 64-bit little-endian x86-64 ELF, `ET_EXEC`, 186,063,596 bytes
- Entry point: linked virtual address `0x7ed080`; runtime load base unknown
- Inventory: 45 sections, 15 segments, 38,895 symbols, 670 REL/RELA relocations
- Dynamic dependencies observed: `libdl.so.2`, `libstdc++.so.6`, `libm.so.6`, `libgcc_s.so.1`, `libpthread.so.0`, `libc.so.6`, and `ld-linux-x86-64.so.2`
- Static mitigation indicators: non-PIE, NX enabled, executable stack disabled, stack-canary symbol present, Full RELRO

These mitigation results are static heuristics. Relocation and GOT/PLT inventory completeness is unknown; library paths and runtime load base are unknown.

## Shim behavior observed in source

Formatting the minified shim as a read-only view exposed these operations:

1. It checks whether `copilot` is available by synchronously running `copilot --version` through a shell, parses a semantic version, and compares it with the bundled minimum.
2. If the CLI is missing or too old, it asks before installing/updating. It tries npm global installation/update, Homebrew, then the official `gh.io/copilot-install` script through `curl` or `wget`, depending on available tools.
3. After validation, it forwards `process.argv.slice(2)` to `copilot` with inherited stdio and the shim's environment.
4. It calls `process.exit(0)` after the child returns rather than propagating the child's exit status. This is a static observation of the shim's source.

The installer paths and prompt choices are implementation details of this VS Code shim, not evidence about Copilot CLI's internal agent loop.

## Limits and next step

No Copilot session was launched and no native code was executed. The ELF has no recovered function pseudocode or assembly analysis: the environment has no configured Ghidra, IDA, or Hopper provider. REA's offline ELF result is limited to layout, symbols, relocations, dependencies, and static mitigation candidates. The semantic trace remains partial and ambiguous; runtime reachability, agent behavior, and server/network policy are not established by these results.

For function-level native analysis, configure a caller-supplied REA-supported native provider and reopen the exact ELF identified by the SHA-256 above. For behavior claims, use a separately authorized runtime trace against a disposable Copilot CLI environment.
