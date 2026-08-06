/**
 * The extension contract (DESIGN.md "Extensions") — the ONLY module the
 * host and extensions share. Extensions import React, their own
 * libraries, and this file. Nothing else. Ever.
 *
 * The axiom: extensions speak artifact text, and nothing else. An
 * extension is a view over the canonical string; it owns no data.
 *
 * Growth rule: a field is added here only when a SECOND consumer needs
 * it. Two consumers make an abstraction; one makes speculation.
 */
import type * as React from 'react';

export interface ExtensionContext {
  /** From the unit's configuration name record — e.g. "yaml". */
  artifactType: string;
  /** The unit's lifetime configuration binding — e.g. "linkml". */
  configName: string;
  /** The open unit's id — the key for per-unit device state. */
  unitId: string;
}

export interface EditorProps {
  /** The working copy (owned by the host, never by the extension). */
  content: string;
  /** Propose a change to the working copy. */
  onChange: (next: string) => void;
  readOnly: boolean;
  context: ExtensionContext;
}

export interface ExtensionDefinition {
  id: string;
  /** Tab label in the artifact pane. */
  title: string;
  /** Visibility predicate. First applicable in registry order = default tab. */
  appliesTo: (context: ExtensionContext) => boolean;
  /** Always lazy: heavy libraries load when the tab first opens. */
  component: React.LazyExoticComponent<React.ComponentType<EditorProps>>;
}
