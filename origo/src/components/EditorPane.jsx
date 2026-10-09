import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline';
import { IITPSX_LANGUAGE_ID, registerIitpsx } from '../language/iitpsx.js';

if (typeof self !== 'undefined' && !self.MonacoEnvironment) {
  self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
}

const EditorPane = forwardRef(function EditorPane(
  { value, onChange, theme, fontSize, diagnostics, onCursor, activeLine },
  ref,
) {
  const hostRef = useRef(null);
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const suppressRef = useRef(false);
  const decorationIdsRef = useRef([]);
  onChangeRef.current = onChange;

  useEffect(() => {
    registerIitpsx(monaco);
    const editor = monaco.editor.create(hostRef.current, {
      value,
      language: IITPSX_LANGUAGE_ID,
      theme: theme === 'light' ? 'origo-light' : 'origo-dark',
      automaticLayout: true,
      fontSize,
      fontFamily: "'IBM Plex Mono', 'Cascadia Code', Consolas, 'Liberation Mono', monospace",
      fontLigatures: false,
      lineNumbers: 'on',
      renderLineHighlight: 'line',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      tabSize: 8,
      insertSpaces: false,
      padding: { top: 14, bottom: 14 },
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      fixedOverflowWidgets: true,
      cursorBlinking: 'smooth',
      glyphMargin: true,
    });
    editorRef.current = editor;

    const changeSub = editor.onDidChangeModelContent(() => {
      if (suppressRef.current) return;
      onChangeRef.current?.(editor.getValue());
    });
    const cursorSub = editor.onDidChangeCursorPosition((event) => {
      onCursor?.({ line: event.position.lineNumber, column: event.position.column });
    });

    return () => {
      changeSub.dispose();
      cursorSub.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && typeof value === 'string' && value !== editor.getValue()) {
      suppressRef.current = true;
      editor.setValue(value);
      suppressRef.current = false;
    }
  }, [value]);

  useEffect(() => {
    monaco.editor.setTheme(theme === 'light' ? 'origo-light' : 'origo-dark');
  }, [theme]);

  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize });
  }, [fontSize]);

  // Highlight the source line of the instruction the debugger last executed.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const decorations = activeLine
      ? [{
          range: new monaco.Range(activeLine, 1, activeLine, 1),
          options: { isWholeLine: true, className: 'pc-line', glyphMarginClassName: 'pc-glyph' },
        }]
      : [];
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);
    if (activeLine) editor.revealLineInCenterIfOutsideViewport(activeLine);
  }, [activeLine]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model) return;
    const markers = (diagnostics || []).map((d) => ({
      startLineNumber: d.line,
      endLineNumber: d.line,
      startColumn: 1,
      endColumn: 1000,
      message: d.message,
      severity: d.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error,
    }));
    monaco.editor.setModelMarkers(model, 'origo-assembler', markers);
  }, [diagnostics]);

  useImperativeHandle(ref, () => ({
    getValue: () => editorRef.current?.getValue() ?? '',
    focus: () => editorRef.current?.focus(),
    undo: () => editorRef.current?.trigger('menu', 'undo', null),
    redo: () => editorRef.current?.trigger('menu', 'redo', null),
  }), []);

  return <div className="editor-host" ref={hostRef} />;
});

export default EditorPane;
