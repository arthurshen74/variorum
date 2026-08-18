# Abstraction candidates

Per CLAUDE.md "DRY (and when not)": 2 similar instances = Longshot,
3 = Good Bet, extract on the fourth or at a module boundary.

## Longshots

- **Transcript chip** — `ArtifactChip` and `EditNoticeChip`
  (`src/components/chat/`): same visual shell (bordered muted pill, icon,
  one line of text), different icon and label logic.
