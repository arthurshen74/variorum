/**
 * The model's four tools — the ONLY tools the model ever sees
 * (DESIGN.md "Local Tools"; CLAUDE.md invariants). Export, import, prune,
 * restore, and everything touching configurations are interface-only and
 * must never appear here.
 *
 * Note the strongest verb the model holds is `archive_conversation` —
 * never "delete" — and it is gated: the handler suspends on a
 * human-confirmation callback supplied by the UI.
 *
 * Wiring these into the streaming chat loop lands with the chat
 * implementation; the handlers below are the complete intended surface.
 */
import { repository } from '@/persistence/repository';
import { variorumStore } from '@/state/store';
import { selectActiveUnits } from '@/state/selectors';

/** UI-supplied gate: resolves true only if a human confirmed the archive. */
export type ArchiveConfirmationGate = (
  unitId: string,
  conversationName: string,
) => Promise<boolean>;

export interface UnitSummary {
  unitId: string;
  conversationName: string;
  configName: string;
}

export function createToolHandlers(confirmArchive: ArchiveConfirmationGate) {
  return {
    async create_unit(input: {
      conversationName: string;
      configName: string;
    }): Promise<UnitSummary> {
      const unit = await repository.createUnit(
        input.conversationName,
        input.configName,
      );
      return {
        unitId: unit.id,
        conversationName: unit.conversationName,
        configName: unit.configName,
      };
    },

    /** Active units only — archived units are invisible to the model. */
    async load_unit(input: { unitId: string }) {
      const unit = selectActiveUnits(variorumStore.getState()).find(
        (u) => u.id === input.unitId,
      );
      if (unit === undefined) {
        return { error: `no active unit with id ${input.unitId}` };
      }
      return {
        unitId: unit.id,
        conversationName: unit.conversationName,
        configName: unit.configName,
        artifact: unit.artifacts.at(-1)?.content ?? null,
      };
    },

    /** Active units only — the model must never see archived units. */
    async list_units(): Promise<UnitSummary[]> {
      return selectActiveUnits(variorumStore.getState()).map((u) => ({
        unitId: u.id,
        conversationName: u.conversationName,
        configName: u.configName,
      }));
    },

    /** Human-confirmation gated; archiving is soft and restorable. */
    async archive_conversation(input: { unitId: string }) {
      const unit = selectActiveUnits(variorumStore.getState()).find(
        (u) => u.id === input.unitId,
      );
      if (unit === undefined) {
        return { archived: false, reason: `no active unit ${input.unitId}` };
      }
      const confirmed = await confirmArchive(unit.id, unit.conversationName);
      if (!confirmed) {
        return { archived: false, reason: 'declined by the user' };
      }
      await repository.archiveUnit(unit.id);
      return { archived: true };
    },
  };
}
