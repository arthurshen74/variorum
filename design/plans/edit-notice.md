# Implementation manifest: edit notice + marked fence

Spec: DESIGN.md § "Manual edits enter the conversation — the edit notice"
(Chat), the amended § "Post-hoc extraction, not streaming extraction"
(Chat), and § "The artifact fence marker — what a system prompt must
teach" (Configurations) — approved 2026-08-18. CLAUDE.md gained the
persisted-before-send invariant (State management).

Stubs: design/repository-api.ts (MessageKind, Message.kind,
Message.artifactVersion, appendUserMessage contract),
design/application-schema.yaml (same shapes), src/domain/edit-notice.ts,
src/components/chat/EditNoticeChip.tsx, ChatMessageProps.editNoticeVersion
(ChatPane passes a null placeholder until G3).

Full gate: npm run typecheck && npx vitest run && npx playwright test

Note on filters: [G1]/[G2] tags also exist in older manifests' tests
(chat.md). Scope every filter by file path as written below; the extra
green tests a bare `-t "[G1]"` would pull in are harmless but noisy.

Two guard tests are deliberately born green (documented at planning,
human-approved): repository.chat.test.ts "no notice without a pending
manual revision" and edit-notice.spec.ts "[G3] no manual save, no
notice". Both lock the quiet path against over-minting; they cannot be
red because they assert today's behavior.

## Groups

### G1 — domain: marked-fence extraction + edit-notice decisions
- Intent: extractor prefers artifact-marked fences; pendingEditNotice /
  editNoticeContent per the spec.
- Write scope: src/domain/extract.ts, src/domain/edit-notice.ts
- Tests: src/domain/extract.test.ts, src/domain/edit-notice.test.ts,
  e2e/marked-fence.spec.ts — filters:
  npx vitest run src/domain/extract.test.ts src/domain/edit-notice.test.ts /
  npx playwright test e2e/marked-fence.spec.ts
- Depends on: none
- Status: RED

### G2 — persistence: notice minting + dump validator
- Intent: appendUserMessage mints the pending notice atomically before
  the user message; parseDump learns kind/artifactVersion with the
  pairing rule. (merge.ts needs no change — sameFields compares fields
  generically.)
- Write scope: src/persistence/repository.ts, src/domain/dump-file.ts
- Tests: src/persistence/repository.chat.test.ts (new describe),
  src/domain/dump-file.test.ts (new describe) — filters:
  npx vitest run src/persistence/repository.chat.test.ts src/domain/dump-file.test.ts -t "edit-notice"
- Depends on: G1
- Status: RED

### G3 — components: send-path wiring + chip
- Intent: ChatPane gets the minted notice into the request it sends and
  derives editNoticeVersion for rendering; ChatMessage renders a notice
  as EditNoticeChip ("You edited → revision N").
- Write scope: src/components/shell/ChatPane.tsx,
  src/components/chat/ChatMessage.tsx,
  src/components/chat/EditNoticeChip.tsx
- Tests: e2e/edit-notice.spec.ts — filters:
  npx playwright test e2e/edit-notice.spec.ts
- Depends on: G1, G2
- Status: RED

## Order

G1 → G2 → G3, strictly: G2's repository calls G1's module; G3's request
assertions need G2's minting. No parallel-safe pairs.

After G3, the human updates the live configurations' system prompts with
the marker instruction from DESIGN.md "The artifact fence marker" —
prompt content is configuration data, not code, so no group covers it.

## Amendments

