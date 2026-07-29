/**
 * The extension registry (DESIGN.md "Extensions"). The host imports
 * extensions ONLY through this file. Order matters: the first applicable
 * extension is the default tab.
 */
import { lazy } from 'react';
import type { ExtensionContext, ExtensionDefinition } from './extension';

export const extensions: ExtensionDefinition[] = [
  {
    id: 'code-editor',
    title: 'Editor',
    appliesTo: () => true, // extension zero: applies everywhere
    component: lazy(() => import('./code-editor/CodeEditor')),
  },
  // Future: linkml-graph — appliesTo: (ctx) => ctx.configName === 'linkml'
];

export function applicableExtensions(
  context: ExtensionContext,
): ExtensionDefinition[] {
  return extensions.filter((e) => e.appliesTo(context));
}
