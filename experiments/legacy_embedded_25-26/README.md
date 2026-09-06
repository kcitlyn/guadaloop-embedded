# Legacy `Embedded_25-26` workspace

The original single-project layout, before the codebase was split into five named
ECU projects. Superseded by `firmware/` — kept because the contactor state machine
below is the only implementation of that logic anywhere in the repo.

## `Core/Src/Main_contactor_fsm.c`

**Renamed.** Upstream this file is `Main.c`, sitting next to `main.c` in the same
directory. Git can store both; Windows and macOS cannot check out both at once,
because their filesystems are case-insensitive and one file silently overwrites
the other. The contents are byte-for-byte unmodified — only the name changed.

It implements the HV precharge sequence:

```
ST_START → ST_WAIT_START → ST_PRECHARGE → ST_MAIN_ON → ST_RUN → ST_SHUTDOWN
```

with `PRECHARGE_TIME_MS 5570U`.

**Before this ever runs on live HV:** `g_start_cmd` is hardcoded `true`, so the
sequence self-starts at power-on with no operator command. That is correct for a
bench test and unacceptable on a pod with a charged pack. It needs to come from a
real command input.

The rest of this directory is byte-identical to `Embedded_25-26/` on the
`printing` branch.
