/**
 * The repository (DESIGN.md "State Architecture") — the ONLY writer.
 * Implements the canon contract imported from design/repository-api.ts,
 * so the compiler enforces the design record on every build.
 *
 * Ground rules encoded here:
 *  - Every mutation runs through a serial queue (whole-document
 *    read-modify-write + async put = lost writes without it).
 *  - Write order: IndexedDB `put` first (durability), then store update.
 *  - Reads are store selectors; there are no read methods here.
 */
import type {
  AssistantCompletion,
  Configuration,
  ConfigurationDraft,
  ConfigurationVersion,
  DatabaseDump,
  ImportReport,
  Message,
  NewConfigurationInfo,
  Unit,
  VariorumRepository,
} from '@design/repository-api';
import { SCHEMA_VERSION } from '@/domain/types';
import { planMerge } from '@/domain/merge';
import {
  deleteByKey,
  getAll,
  openDatabase,
  put,
  putMany,
} from './indexed-db-wrapper';
import { variorumStore } from '@/state/store';

function nowIso(): string {
  return new Date().toISOString();
}

class Repository implements VariorumRepository {
  private db: IDBDatabase | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  /** The serial mutation queue: every mutation awaits its predecessor. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private requireDb(): IDBDatabase {
    if (this.db === null) {
      throw new Error('repository.boot() has not completed');
    }
    return this.db;
  }

  private getUnit(unitId: string): Unit {
    const unit = variorumStore
      .getState()
      .units.find((u) => u.id === unitId);
    if (unit === undefined) {
      throw new Error(`unknown unit: ${unitId}`);
    }
    return unit;
  }

  private latestVersion(name: string): ConfigurationVersion {
    const latest = variorumStore
      .getState()
      .configurationVersions.filter((v) => v.name === name)
      .reduce<ConfigurationVersion | undefined>(
        (best, v) =>
          best === undefined || v.version > best.version ? v : best,
        undefined,
      );
    if (latest === undefined) {
      throw new Error(`configuration has no versions: ${name}`);
    }
    return latest;
  }

  private async writeUnit(next: Unit): Promise<Unit> {
    await put(this.requireDb(), 'units', next);
    variorumStore.setState((s) => ({
      units: s.units.map((u) => (u.id === next.id ? next : u)),
      dirtySinceExport: true,
    }));
    return next;
  }

  private async writeConfiguration(
    next: Configuration,
  ): Promise<Configuration> {
    await put(this.requireDb(), 'configurations', next);
    variorumStore.setState((s) => ({
      configurations: s.configurations.map((c) =>
        c.name === next.name ? next : c,
      ),
      dirtySinceExport: true,
    }));
    return next;
  }

  // ---- Boot ---------------------------------------------------------------

  async boot(): Promise<void> {
    const db = await openDatabase();
    this.db = db;
    const [configurations, configurationVersions, units] = await Promise.all([
      getAll<Configuration>(db, 'configurations'),
      getAll<ConfigurationVersion>(db, 'configurationVersions'),
      getAll<Unit>(db, 'units'),
    ]);
    variorumStore.setState({
      hydrated: true,
      configurations,
      configurationVersions,
      units,
      dirtySinceExport: true, // conservative: nothing exported this session
    });
  }

  // ---- Units --------------------------------------------------------------

  createUnit(conversationName: string, configName: string): Promise<Unit> {
    return this.enqueue(async () => {
      const config = variorumStore
        .getState()
        .configurations.find((c) => c.name === configName);
      if (config === undefined) {
        throw new Error(`unknown configuration: ${configName}`);
      }
      if (config.archived) {
        throw new Error(`configuration is archived: ${configName}`);
      }
      this.latestVersion(configName); // must have at least version 1
      const unit: Unit = {
        id: crypto.randomUUID(),
        conversationName,
        configName,
        createdAt: nowIso(),
        archived: false,
        messages: [],
        artifacts: [],
      };
      await put(this.requireDb(), 'units', unit);
      variorumStore.setState((s) => ({
        units: [...s.units, unit],
        dirtySinceExport: true,
      }));
      return unit;
    });
  }

  renameConversation(unitId: string, conversationName: string): Promise<Unit> {
    return this.enqueue(async () => {
      const unit = this.getUnit(unitId);
      return this.writeUnit({ ...unit, conversationName });
    });
  }

  appendUserMessage(unitId: string, content: string): Promise<Unit> {
    return this.enqueue(async () => {
      const unit = this.getUnit(unitId);
      const version = this.latestVersion(unit.configName);
      const message: Message = {
        role: 'user',
        configVersion: version.version,
        sentAt: nowIso(),
        content,
      };
      return this.writeUnit({
        ...unit,
        messages: [...unit.messages, message],
      });
    });
  }

  completeExchange(
    unitId: string,
    assistant: AssistantCompletion,
    artifactContent?: string,
  ): Promise<Unit> {
    return this.enqueue(async () => {
      const unit = this.getUnit(unitId);
      const version = this.latestVersion(unit.configName);
      const message: Message = {
        role: 'assistant',
        configVersion: version.version,
        sentAt: assistant.sentAt,
        receivedFinishedAt: assistant.receivedFinishedAt,
        content: assistant.content,
      };
      const messages = [...unit.messages, message];
      const lastRevision = unit.artifacts.at(-1);
      const changed =
        artifactContent !== undefined &&
        artifactContent !== lastRevision?.content;
      const artifacts = changed
        ? [
            ...unit.artifacts,
            {
              version: (lastRevision?.version ?? 0) + 1,
              savedAt: nowIso(),
              source: 'llm' as const,
              messageIndex: messages.length - 1,
              content: artifactContent,
            },
          ]
        : unit.artifacts;
      return this.writeUnit({ ...unit, messages, artifacts });
    });
  }

  saveManualEdit(unitId: string, content: string): Promise<Unit> {
    return this.enqueue(async () => {
      const unit = this.getUnit(unitId);
      const lastRevision = unit.artifacts.at(-1);
      if (content === lastRevision?.content) {
        return unit; // a Save that changes nothing mints nothing
      }
      return this.writeUnit({
        ...unit,
        artifacts: [
          ...unit.artifacts,
          {
            version: (lastRevision?.version ?? 0) + 1,
            savedAt: nowIso(),
            source: 'manual' as const,
            content,
          },
        ],
      });
    });
  }

  archiveUnit(unitId: string): Promise<Unit> {
    return this.enqueue(async () => {
      const unit = this.getUnit(unitId);
      return this.writeUnit({ ...unit, archived: true });
    });
  }

  restoreUnit(unitId: string): Promise<Unit> {
    return this.enqueue(async () => {
      const unit = this.getUnit(unitId);
      return this.writeUnit({ ...unit, archived: false });
    });
  }

  // ---- Configurations (interface-only, forever) ---------------------------

  createConfiguration(
    info: NewConfigurationInfo,
    draft: ConfigurationDraft,
  ): Promise<ConfigurationVersion> {
    return this.enqueue(async () => {
      const exists = variorumStore
        .getState()
        .configurations.some((c) => c.name === info.name);
      if (exists) {
        throw new Error(`configuration already exists: ${info.name}`);
      }
      const configuration: Configuration = {
        name: info.name,
        artifactType: info.artifactType,
        archived: false,
        ...(info.description !== undefined
          ? { description: info.description }
          : {}),
      };
      const versionOne: ConfigurationVersion = {
        name: info.name,
        version: 1,
        ...draft,
      };
      // The system's ONE multi-store write: name record + version 1,
      // atomically (DESIGN.md "State Architecture").
      await putMany(this.requireDb(), [
        { store: 'configurations', doc: configuration },
        { store: 'configurationVersions', doc: versionOne },
      ]);
      variorumStore.setState((s) => ({
        configurations: [...s.configurations, configuration],
        configurationVersions: [...s.configurationVersions, versionOne],
        dirtySinceExport: true,
      }));
      return versionOne;
    });
  }

  saveConfigurationVersion(
    name: string,
    draft: ConfigurationDraft,
  ): Promise<ConfigurationVersion> {
    return this.enqueue(async () => {
      const latest = this.latestVersion(name);
      const next: ConfigurationVersion = {
        name,
        version: latest.version + 1,
        ...draft,
      };
      await put(this.requireDb(), 'configurationVersions', next);
      variorumStore.setState((s) => ({
        configurationVersions: [...s.configurationVersions, next],
        dirtySinceExport: true,
      }));
      return next;
    });
  }

  updateConfigurationDescription(
    name: string,
    description: string,
  ): Promise<Configuration> {
    return this.enqueue(async () => {
      const config = variorumStore
        .getState()
        .configurations.find((c) => c.name === name);
      if (config === undefined) {
        throw new Error(`unknown configuration: ${name}`);
      }
      return this.writeConfiguration({ ...config, description });
    });
  }

  archiveConfiguration(name: string): Promise<Configuration> {
    return this.enqueue(async () => {
      const config = variorumStore
        .getState()
        .configurations.find((c) => c.name === name);
      if (config === undefined) {
        throw new Error(`unknown configuration: ${name}`);
      }
      return this.writeConfiguration({ ...config, archived: true });
    });
  }

  restoreConfiguration(name: string): Promise<Configuration> {
    return this.enqueue(async () => {
      const config = variorumStore
        .getState()
        .configurations.find((c) => c.name === name);
      if (config === undefined) {
        throw new Error(`unknown configuration: ${name}`);
      }
      return this.writeConfiguration({ ...config, archived: false });
    });
  }

  // ---- Danger zone (interface-only) ---------------------------------------

  exportDatabase(): Promise<DatabaseDump> {
    return this.enqueue(async () => {
      const s = variorumStore.getState();
      const dump: DatabaseDump = {
        schemaVersion: SCHEMA_VERSION,
        configurations: s.configurations,
        configurationVersions: s.configurationVersions,
        units: s.units,
      };
      variorumStore.setState({ dirtySinceExport: false });
      return dump;
    });
  }

  importDatabase(dump: DatabaseDump): Promise<ImportReport> {
    return this.enqueue(async () => {
      const s = variorumStore.getState();
      const local: DatabaseDump = {
        schemaVersion: SCHEMA_VERSION,
        configurations: s.configurations,
        configurationVersions: s.configurationVersions,
        units: s.units,
      };
      const plan = planMerge(local, dump, () => crypto.randomUUID());
      await putMany(this.requireDb(), [
        ...plan.configurations.map((doc) => ({
          store: 'configurations' as const,
          doc,
        })),
        ...plan.configurationVersions.map((doc) => ({
          store: 'configurationVersions' as const,
          doc,
        })),
        ...plan.units.map((doc) => ({ store: 'units' as const, doc })),
      ]);
      variorumStore.setState((prev) => ({
        configurations: mergeByKey(
          prev.configurations,
          plan.configurations,
          (c) => c.name,
        ),
        configurationVersions: mergeByKey(
          prev.configurationVersions,
          plan.configurationVersions,
          (v) => `${v.name}.${v.version}`,
        ),
        units: mergeByKey(prev.units, plan.units, (u) => u.id),
        dirtySinceExport: true,
      }));
      return plan.report;
    });
  }

  pruneArchivedUnits(): Promise<number> {
    return this.enqueue(async () => {
      if (variorumStore.getState().dirtySinceExport) {
        throw new Error(
          'prune requires a fresh export — export the database first (DESIGN.md "Prune")',
        );
      }
      const archived = variorumStore
        .getState()
        .units.filter((u) => u.archived);
      const db = this.requireDb();
      for (const unit of archived) {
        await deleteByKey(db, 'units', unit.id);
      }
      variorumStore.setState((s) => ({
        units: s.units.filter((u) => !u.archived),
        // pruning is itself a mutation the next export should capture
        dirtySinceExport: archived.length > 0 ? true : s.dirtySinceExport,
      }));
      return archived.length;
    });
  }

  replaceDatabase(_dump: DatabaseDump): Promise<DatabaseDump> {
    throw new Error('not implemented: replaceDatabase');
  }
}

/** Replace-or-append by key: plan records win over existing ones. */
function mergeByKey<T>(
  existing: readonly T[],
  incoming: readonly T[],
  keyOf: (item: T) => string,
): T[] {
  const byKey = new Map(existing.map((item) => [keyOf(item), item]));
  for (const item of incoming) {
    byKey.set(keyOf(item), item);
  }
  return [...byKey.values()];
}

/** The one instance. Components and tool handlers import this. */
export const repository: VariorumRepository = new Repository();
