# Variorum

## Introduction

Variorum is a single file artifact editor that is assisted by
a generative AI model of your choosing.

The goal of this tool is to help you speed up your creation of
single artifacts but allowing you to retain your human control
over the exact details of said artifact.

This is a tool for a simpleton like me who can only think and design,
one artifact at a time. If that sounds like you too, then feel free
to clone or fork until your heart's content.

What kind of artifact you're editing is not hardcoded. Variorum began
life as a LinkML editor, but the artifact type, the system prompt, and
the sampling behavior all live in a named, versioned **configuration** —
`linkml` is just the first configuration; `react-component` could be
the second.

An example of this use case is LinkML. Let's say you want to use
LinkML to be the source of truth for the data model of your project.
Let's say you have a pretty good idea of what the model is but you
want to use an LLM to get the bulk of it laid out "on paper". But,
once you've seen it, your own craftsmenship kicks in and you know
exactly how you want to change it. Now you can either change it directly
or you can ask the LLM to change it for you. This tool will support
either approach.

## Architecture

I'm keeping this VERY simple. SPA — React/Tailwind/Vite/shadcn/Vercel
AI Elements — talking directly to an OpenAI-compatible endpoint
(LM Studio, to start). No server: this tool talks to `localhost`, and a
backend here would be a proxy from your machine to your machine.
Persistence is a single IndexedDB database holding everything —
conversations, artifact revision histories, and versioned configurations —
with export/import as a true backup.

Every decision above, and the ones it implies — CORS coupling, API keys
in localStorage, the unit data model, immutable configuration versions,
what tools the LLM does and does not get, prompt injection and
exfiltration — is recorded with its rationale in the
[design record](design/DESIGN.md). That file is the source of truth;
this section is just the trailer.

## License

Variorum is licensed under the [Apache License, Version 2.0](LICENSE).

Apache-2.0 rather than MIT for a specific reason: AI Elements is Apache-2.0 and
ships as a shadcn-style registry, so its source files live *in this repository*
rather than in `node_modules`. Matching the license keeps the attribution story
simple. See [NOTICE](NOTICE) for third-party attributions.

Note the warranty disclaimer in section 7. The [design record](design/DESIGN.md)
is candid about the risks this tool carries — API keys in LocalStorage, XSS
exposure, prompt injection through pasted YAML, and tool results reaching
whatever model you point it at. Those caveats are the point, not boilerplate.
Fork accordingly.
