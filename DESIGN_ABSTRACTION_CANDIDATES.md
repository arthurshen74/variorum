# Abstraction candidates

Per CLAUDE.md "DRY (and when not)": 2 similar instances = Longshot,
3 = Good Bet, extract on the fourth or at a module boundary.

## Longshots

- **Transcript chip** — `ArtifactChip` and `EditNoticeChip`
  (`src/components/chat/`): same visual shell (bordered muted pill, icon,
  one line of text), different icon and label logic.
- **Replace confirmation UI** — `DatabaseView` (`src/components/dialogs/`)
  and `SetupGate` (`src/components/setup/`): the same `DatabasePorts`
  object over the repository and file-io, the pick → confirm panel →
  `runReplace` sequence, and the consequence wording beside "Cancel" /
  "Confirm replace".
- **Load the provider document or its error** — `loadDocument` in
  `ProvidersView` and in `SetupGate`: `readProviderDocument` with
  `ProviderDocumentError` caught. The view keeps the message to show; the
  gate only needs to know the document is malformed. The null-on-malformed
  shape now exists as `readProviderDocumentOrNull`
  (`src/llm/provider-document.ts`, used by `NewUnitDialog` and
  `ChatErrorRow`); the gate's copy is identical to it and can adopt it.
- **Untouched picker means the first option** — `chosenHandle` in
  `NewUnitDialog` and `offerFor` in `ChatErrorRow`: a picked handle kept
  only while the offered list still holds it, else the first. The
  dialog's configuration picker follows the same convention inline.
