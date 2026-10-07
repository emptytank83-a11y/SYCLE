# Phase plans

## Phase 0 - Map the codebase

Create `ARCHITECTURE_NOTES.md` documenting parsing, generation, scoring,
persistence, chat, PDF export, stack, and additive extension points. No existing
file is touched.

## Phase 1 - Skeleton and feature flag

Create the requested module directories, a disabled-by-default environment
flag, a public engine entry point, and legacy snapshot tests. No existing file
is touched; the tests load the legacy inline script through an isolated VM.
