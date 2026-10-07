# Blockers

## Phase 9 - production narrator client

The current static SYCLE application has no LLM client or backend API. The
constrained narrator therefore accepts an injected `llmClient` and is fully
tested with a mock, but no production model call can be registered without an
existing guarded backend extension point or a new API architecture. The engine
still supports a deterministic evidence-only narrative fallback.

## Phase 10 - static application registration

The legacy app is one inline browser script with no module loader and no
build-time environment injection. Registering the CommonJS evidence engine in
that file would require a new browser bundle and an existing-file script hook.
To obey the additive/no-UI rule, Phase 10 provides the adapter and verifies it
against the legacy renderer in isolation, but does not register it in the live
static UI. A backend or approved browser-bundle hook is required to enable it.
