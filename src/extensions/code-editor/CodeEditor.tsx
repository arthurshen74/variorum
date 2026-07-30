/**
 * Extension zero: the CodeMirror 6 editor (DESIGN.md "Extensions").
 * A view over the canonical artifact text — no store, no repository,
 * no other components. Props in, onChange out.
 */
import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { EditorProps } from '../extension';

// Editor chrome from the shadcn tokens (DESIGN.md "Theming") — the CSS
// variables cascade in ambiently, so the extension follows the active
// theme without importing anything.
const chromeTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--accent)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--accent)' },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--accent)',
  },
});

// Syntax colors from the --editor-* tokens (both blocks of index.css).
const syntaxColors = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--editor-keyword)' },
  { tag: tags.propertyName, color: 'var(--editor-property)' },
  { tag: tags.string, color: 'var(--editor-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--editor-number)' },
  { tag: tags.comment, color: 'var(--editor-comment)' },
]);

export default function CodeEditor({
  content,
  onChange,
  readOnly,
  context,
}: EditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Keep the latest onChange without re-creating the editor.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mount-time content, deliberately not a reactive dependency: after
  // mount the view owns the document, and external changes come through
  // the sync effect below.
  const initialContentRef = useRef(content);
  initialContentRef.current = content;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const languages =
      context.artifactType === 'yaml' || context.artifactType === 'linkml'
        ? [yaml()]
        : []; // more languages arrive with more artifact types
    const view = new EditorView({
      doc: initialContentRef.current,
      parent: host,
      extensions: [
        basicSetup,
        chromeTheme,
        syntaxHighlighting(syntaxColors),
        ...languages,
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [readOnly, context.artifactType]);

  // External content changes (revision restore, LLM update accepted by the
  // host) sync into the view; self-originated changes are already there.
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) {
      return;
    }
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
    }
  }, [content]);

  return <div ref={hostRef} className="h-full min-h-0 overflow-auto text-sm" />;
}
