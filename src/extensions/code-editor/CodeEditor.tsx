/**
 * Extension zero: the CodeMirror 6 editor (DESIGN.md "Extensions").
 * A view over the canonical artifact text — no store, no repository,
 * no other components. Props in, onChange out.
 */
import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { yaml } from '@codemirror/lang-yaml';
import type { EditorProps } from '../extension';

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
