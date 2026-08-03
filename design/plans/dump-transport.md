# Implementation manifest: dump transport

Spec: DESIGN.md § "The Dump Is a File" + the rewritten § "Replace — the
wholesale door" / "The mandatory backup", and the two amended signatures in
[repository-api.ts](../repository-api.ts) — approved 2026-07-31
Stubs: `src/domain/dump-file.ts`, `src/components/dialogs/file-io.ts`
Full gate: npm run typecheck && npx vitest run && npx playwright test

Scope B: domain + repository + file IO. The dialog COMPONENTS are out of scope
and need their own spec — there is no `src/components/ui/` and no dialog
primitive in package.json, so building them is also a dependency decision.

## Groups

### G1 — dump text
- Intent: serialize, parse, and structurally validate a dump; filenames
- Write scope: `src/domain/dump-file.ts`
- Tests: `src/domain/dump-file.test.ts` — filter:
  `npx vitest run src/domain/dump-file.test.ts`
- Depends on: none
- Status: GREEN (2026-07-31)

### G2 — delivery before destruction
- Intent: both danger-zone methods await their deliverer before the
  irreversible step — replace before the wipe, export before the dirty bit
  clears
- Write scope: `src/persistence/repository.ts`
- Tests: `src/persistence/repository.replace.test.ts`,
  `src/persistence/repository.test.ts` — filter:
  `npx vitest run src/persistence/`
- Depends on: none — the repository never imports `dump-file.ts`
- Status: GREEN (2026-08-03)

### G3 — file IO
- Intent: the picker/anchor/file-input layer, and the DEV handle that exposes
  it so the acceptance specs can drive it
- Write scope: `src/components/dialogs/file-io.ts`, `src/main.tsx`
- Tests: `e2e/dump-transport.spec.ts` — filter:
  `npx playwright test --grep "\[G3\]"`
- Depends on: G1, G2
- Status: RED (6 failing)

## Order

G1 and G2 have disjoint write scopes and no dependency edge — parallel-safe,
though one at a time stays the default. G3 last: it imports G1's codec and
calls G2's signatures.

Filter caveat, same as import-replace.md: `[G1]`/`[G2]` tags are reused across
all three manifests in this directory, so a `-t "[G2]"` sweep also runs the
import-merge and import-replace suites. Harmless, but the path-scoped commands
above are the precise ones.

## Known gaps at RED

- `showSaveFilePicker`'s SUCCESS path is not automatable — Playwright cannot
  drive a native save dialog. Test "export falls back to an anchor download
  when the save picker is absent" covers the fallback branch only; the picker
  branch is manual verification.
- One G2 test is already green: "never invokes the deliverer when the dump is
  refused" passes because today's `replaceDatabase` refuses before it would
  call anything. It locks real behavior and must stay green, but it proves
  nothing until G2 lands.
- The six G3 specs fail by 30s timeout (no download/filechooser event ever
  fires) rather than by assertion, because the DEV handle does not yet expose
  the deliverers. Expect ~3 minutes of red e2e until G3 lands.

## Amendments

2026-07-31 — signature amendment approved with the spec: `exportDatabase` and
`replaceDatabase` each gain a delivery callback. 20 locked call sites updated
mechanically (17 in `repository.replace.test.ts`, 2 in
`repository.import.test.ts`, 1 in `repository.test.ts`, plus both existing e2e
specs). No assertion in any locked test was changed — only the argument lists.

2026-07-31 — `dump-file.test.ts` "strips unknown keys from the envelope": the
expected literal was not in sorted order, so `Object.keys(parsed).sort()` could
never equal it (`V` precedes `s`, so `configurationVersions` sorts before
`configurations`). Both sides now sort. No spec delta — DESIGN.md "The envelope
does not grow" already states what the test locks, and the assertion's meaning,
exactly four envelope keys and no more, is unchanged.
