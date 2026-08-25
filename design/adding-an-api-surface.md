# Adding an API Surface

The mechanics of adding a wire protocol — a new way for the transport to
talk to an LLM endpoint. The rationale for the adapter's shape lives in
[DESIGN.md "LLM Provider Interface"](DESIGN.md) (the "Protocol
adapters" paragraph); the contract itself is
[`src/llm/protocols/adapter.ts`](../src/llm/protocols/adapter.ts). This
file restates neither — it is the checklist.

## Steps

1. **Get the provider approved** — a protocol is a `@ai-sdk/*` provider
   package (or one you hand-write against `ai`'s `LanguageModel`). A
   new npm library requires human approval BEFORE it enters
   `package.json` (CLAUDE.md).
2. **Pick the id** — a kebab-case protocol id naming the WIRE, not a
   vendor (`openai-compatible`, `anthropic-messages`; never `groq`,
   `lm-studio`). Add it to the `ApiProtocol` union in `adapter.ts`.
3. **Write the adapter** — `src/llm/protocols/<id>.ts`, exporting one
   `ProtocolAdapter`:
   - `id` — the protocol id.
   - `label` — what the Models/Providers tree shows beside an endpoint
     URL.
   - `usesMaxOutputTokens` — true only when the wire makes an output
     cap mandatory; it puts the field on every model under such an
     endpoint.
   - `prepareRequest(resolved, version, fetch)` — builds the
     provider's `LanguageModel` from the resolved endpoint and key, and
     returns it with the `streamText` options and any fetch wrapping
     the protocol needs. A resolved model with no key means NO auth
     header, whatever the provider's default; strip it if the provider
     insists on one.
4. **Register it** — add the adapter to the map in
   `src/llm/protocols/registry.ts`. That map is the only list of
   protocols: the document validator, the tree's protocol selector, and
   the transport all read it.
5. **Write the wire test** — `src/llm/chat-transport.<id>.test.ts`,
   driving `VariorumChatTransport` through an injected fetch against a
   scripted endpoint of the new protocol. Cover: the recipe fields on
   the wire (model id, system prompt, sampling, reasoning effort or its
   deliberate absence), the key header and its absence, the output cap
   if any, text and reasoning decoding, truncation as a FAILED request,
   and usage on the finish chunk. The existing two files are the
   template.
6. **Add an acceptance mock** — `e2e/mock-<id>.ts`, the Playwright
   route handler that speaks the new protocol, and one acceptance
   path in `e2e/models-providers.spec.ts` that binds a model to it and
   sends a message.

## The fences

- Nothing outside `src/llm/protocols/` names a protocol literal. If a
  change needs `if (api === '<id>')` anywhere else, the adapter is
  missing a field — add it to the contract only when a SECOND adapter
  needs it.
- The adapter never reads localStorage, the store, or the repository.
  It receives a resolved model and a configuration version and returns
  a request.
- Sampling parameters and reasoning effort come from the configuration
  version. The adapter decides how (or whether) they reach the wire;
  it never invents values.

## Done

The standard gate (CLAUDE.md "Definition of done"), plus a manual check
that the new protocol appears in the endpoint form's selector and that
a message round-trips against a real endpoint of that protocol.
