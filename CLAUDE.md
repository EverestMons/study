# CLAUDE.md

## RUN EXE (Eluvian Standard)

When the CEO types **"RUN EXE"**, scan `knowledge/decisions/` for executable files — any `.md` file prefixed with `executable-` or `diagnostic-` that is NOT inside the `Done/` subfolder.

- **If one executable found:** Read it, execute Step 1, wait for CEO confirmation between steps as normal. After the final step (plan moved to Done), scan again. If another executable is now pending, load and begin it. If none remain, report "NO EXE."
- **If multiple executables found:** Check for `parallel-N-` prefixed files sharing the same group number — these run back-to-back within a single confirmation window (same as current parallel step handling). Non-parallel executables run sequentially by date (oldest first). Report what was found and begin executing.
- **If no executables found:** Report "NO EXE."
