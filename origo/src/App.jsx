import { useCallback, useEffect, useRef, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import ActivityBar from './components/ActivityBar.jsx';
import TabStrip from './components/TabStrip.jsx';
import FileExplorer from './components/FileExplorer.jsx';
import EditorPane from './components/EditorPane.jsx';
import DebuggerPane from './components/DebuggerPane.jsx';
import OutputPanel from './components/OutputPanel.jsx';
import StatusBar from './components/StatusBar.jsx';
import Resizer from './components/Resizer.jsx';
import { STARTER_PROGRAM } from './examples/starter.js';

const bridge = typeof window !== 'undefined' ? window.origo : undefined;

const stamp = () => new Date().toLocaleTimeString('en-GB', { hour12: false });

const NEW_FILE_TEMPLATE = `; Origo - IITPSx assembly workspace
; Comments start with ';'.

        HALT
`;

function toneForLine(line, fallback = 'default') {
  // Match the assembler/emulator diagnostic prefixes, not substrings like
  // "Syntax errors: 0".
  if (/Error:/.test(line)) return 'error';
  if (/Warning:/.test(line)) return 'warning';
  if (/succeeded|completed/i.test(line)) return 'success';
  return fallback;
}

function toEntries(text, fallbackTone) {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => ({ text: line.length ? line : ' ', tone: toneForLine(line, fallbackTone) }));
}

function parseDiagnostics(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const match = /^Line (\d+): (Error|Warning): (.*)$/.exec(raw.trim());
    if (match) {
      out.push({
        line: Number(match[1]),
        severity: match[2] === 'Warning' ? 'warning' : 'error',
        message: match[3],
      });
    }
  }
  return out;
}

// Map assembler listing addresses (word addresses) to 1-based source lines so
// the current instruction (PC) can be highlighted in the editor.
function buildLineMap(source, listing) {
  const rows = [];
  for (const raw of String(listing || '').split(/\r?\n/)) {
    const match = /^([0-9A-Fa-f]{8})\s/.exec(raw);
    if (match) rows.push(match[1].toUpperCase());
  }
  const MNEMONIC = /^(data|ldc|adc|ldl|stl|ldnl|stnl|add|sub|shl|shr|adj|a2sp|sp2a|call|return|brz|brlz|br|halt|mul|div|set)$/i;
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const instrLines = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/;.*$/, '').trim().replace(/^[A-Za-z_][A-Za-z0-9_]*:\s*/, '');
    if (!line) continue;
    if (MNEMONIC.test(line.split(/\s+/)[0])) instrLines.push(i + 1);
  }
  const map = new Map();
  for (let i = 0; i < rows.length && i < instrLines.length; i++) map.set(rows[i], instrLines[i]);
  return map;
}

// The CPU initialises A, B, PC and SP to zero before every run (emu.c
// init_cpu), so a fresh execution's real "before" state is all zeros.
const ZERO_REGISTERS = { A: '00000000', B: '00000000', PC: '00000000', SP: '00000000' };

// Loaded words from the listing are the real pre-execution memory image.
function buildProgramMemory(listing) {
  const map = new Map();
  for (const raw of String(listing || '').split(/\r?\n/)) {
    const match = /^([0-9A-Fa-f]{8})\s+([0-9A-Fa-f]{8})\s/.exec(raw);
    if (match) map.set(match[1].toUpperCase(), match[2].toUpperCase());
  }
  return map;
}

// Full listing map: address -> { word, text } for the Debugger trace display.
function buildListingMap(listing) {
  const map = new Map();
  for (const raw of String(listing || '').split(/\r?\n/)) {
    const match = /^([0-9A-Fa-f]{8})\s+([0-9A-Fa-f]{8})\s*(.*)$/.exec(raw);
    if (match) map.set(match[1].toUpperCase(), { word: match[2].toUpperCase(), text: match[3].trim() });
  }
  return map;
}

const MEMORY_ROW = /^[0-9A-Fa-f]{8} [0-9A-Fa-f]{8}$/;

// Keep only the useful emulator messages for the Console; the memory image and
// register line are already shown in the Memory and Registers panels.
function condenseEmulatorStdout(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || MEMORY_ROW.test(line.trim()) || /^REG A=/.test(line)) continue;
    const loaded = /^Loaded (\d+) words/.exec(line);
    if (loaded) { out.push({ text: `Loaded ${loaded[1]} words.`, tone: 'muted' }); continue; }
    out.push({ text: line, tone: toneForLine(line) });
  }
  return out;
}

// Assembler diagnostics for the Console: errors and warnings only. The full
// assembler output is preserved in the Assembly output view.
function assemblyConsoleEntries(stdout, stderr) {
  const out = [];
  for (const raw of String(stdout || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (/Error:|Warning:/.test(line)) out.push({ text: line.trim(), tone: toneForLine(line) });
  }
  if (stderr) out.push(...toEntries(stderr, 'error'));
  return out;
}

export default function App() {
  const [content, setContent] = useState(STARTER_PROGRAM);
  const [fileName, setFileName] = useState('untitled.asm');
  const [filePath, setFilePath] = useState(null);
  const [dirty, setDirty] = useState(false);

  const [assembling, setAssembling] = useState(false);
  const [running, setRunning] = useState(false);
  const [canRun, setCanRun] = useState(false);

  const [theme, setTheme] = useState(() => localStorage.getItem('origo.theme') || 'dark');
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem('origo.fontSize')) || 14);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });

  const [consoleLines, setConsoleLines] = useState(() => ([
    { id: 1, text: 'Origo workspace ready.', tone: 'muted', time: stamp() },
    { id: 2, text: 'Open a file or folder, then Assemble and Run.', tone: 'muted', time: stamp() },
  ]));
  const [assemblyText, setAssemblyText] = useState('');
  const [machineText, setMachineText] = useState('');
  const [errorLines, setErrorLines] = useState([]);
  const [outputTab, setOutputTab] = useState('console');
  const [diagnostics, setDiagnostics] = useState([]);

  const [workspace, setWorkspace] = useState(null);
  const [selectedPath, setSelectedPath] = useState(null);

  const [memory, setMemory] = useState([]);
  const [previousMemory, setPreviousMemory] = useState([]);
  const [registers, setRegisters] = useState(null);
  const [previousRegisters, setPreviousRegisters] = useState(null);

  const [debugActive, setDebugActive] = useState(false);
  const [stepping, setStepping] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [halted, setHalted] = useState(false);
  const [activeLine, setActiveLine] = useState(null);
  const [lineMap, setLineMap] = useState(null);
  const [loadedWords, setLoadedWords] = useState(null);
  const [programMemory, setProgramMemory] = useState(null);
  const [listingMap, setListingMap] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [debuggerWidth, setDebuggerWidth] = useState(340);
  const [outputHeight, setOutputHeight] = useState(200);

  const editorApi = useRef(null);
  const idRef = useRef(3);
  const nextId = () => idRef.current++;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('origo.theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('origo.fontSize', String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    document.title = `${dirty ? '\u2022 ' : ''}${fileName} \u2014 Origo`;
  }, [dirty, fileName]);

  useEffect(() => {
    bridge?.setDirty(dirty);
  }, [dirty]);

  const clearOutput = useCallback(() => {
    setConsoleLines([]);
    setAssemblyText('');
    setMachineText('');
    setErrorLines([]);
  }, []);

  const emit = useCallback((entries) => {
    const withIds = entries.map((entry) => ({ id: idRef.current++, text: entry.text, tone: entry.tone || 'default', time: entry.time || stamp() }));
    setConsoleLines((prev) => [...prev, ...withIds]);
    const errs = withIds.filter((entry) => entry.tone === 'error' || entry.tone === 'warning');
    if (errs.length) setErrorLines((prev) => [...prev, ...errs]);
  }, []);

  // Clear debugger state so values from a previous execution are never shown
  // as current after an edit, new/open, or re-assembly.
  const resetDebugger = useCallback(() => {
    setRegisters(null);
    setPreviousRegisters(null);
    setMemory([]);
    setPreviousMemory([]);
    setDebugActive(false);
    setStepCount(0);
    setHalted(false);
    setActiveLine(null);
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  // Apply a recorded execution state to the UI. Navigation only reads stored
  // snapshots; it never re-runs the emulator.
  const applyEntry = useCallback((index, list) => {
    const entries = list || history;
    if (index < 0 || index >= entries.length) return;
    const entry = entries[index];
    const prev = index > 0 ? entries[index - 1] : null;
    setHistoryIndex(index);
    setRegisters(entry.registers || null);
    setPreviousRegisters(prev && prev.registers ? prev.registers : null);
    setMemory(entry.memory || []);
    setPreviousMemory(prev && prev.memory ? prev.memory : []);
    setDebugActive(true);
    setStepCount(entry.instr || 0);
    setHalted(entry.status === 'HALTED');
    setActiveLine(lineMap && entry.pc != null ? (lineMap.get(entry.pc) ?? null) : null);
  }, [history, lineMap]);

  const handlePrevHistory = useCallback(() => {
    if (historyIndex > 0) applyEntry(historyIndex - 1);
  }, [applyEntry, historyIndex]);

  const handleNextHistory = useCallback(() => {
    if (historyIndex >= 0 && historyIndex < history.length - 1) applyEntry(historyIndex + 1);
  }, [applyEntry, historyIndex, history.length]);

  const handleSelectHistory = useCallback((index) => applyEntry(index), [applyEntry]);

  const confirmDiscardIfNeeded = useCallback(async () => {
    if (!dirty) return true;
    if (!bridge?.confirmDiscard) return true;
    return Boolean(await bridge.confirmDiscard());
  }, [dirty]);

  const loadDocument = useCallback((doc) => {
    setContent(doc.content);
    setFileName(doc.fileName);
    setFilePath(doc.filePath);
    setSelectedPath(doc.filePath || null);
    setDirty(false);
    setCanRun(false);
    setDiagnostics([]);
    resetDebugger();
    editorApi.current?.focus();
  }, [resetDebugger]);

  const handleNew = useCallback(async () => {
    if (!(await confirmDiscardIfNeeded())) return;
    loadDocument({ content: NEW_FILE_TEMPLATE, fileName: 'untitled.asm', filePath: null });
    setSelectedPath(null);
    emit([{ text: 'New file.', tone: 'muted' }]);
  }, [confirmDiscardIfNeeded, loadDocument, emit]);

  const handleOpen = useCallback(async () => {
    if (!bridge) { emit([{ text: '[app] File operations require the desktop app.', tone: 'error' }]); return; }
    if (!(await confirmDiscardIfNeeded())) return;
    const result = await bridge.openFile();
    if (!result || result.canceled) return;
    if (result.error) { emit([{ text: `[app] ${result.error}`, tone: 'error' }]); return; }
    loadDocument(result);
    emit([{ text: `Opened ${result.fileName}`, tone: 'muted' }]);
  }, [confirmDiscardIfNeeded, loadDocument, emit]);

  const handleOpenFolder = useCallback(async () => {
    if (!bridge?.chooseWorkspace) { emit([{ text: '[app] File operations require the desktop app.', tone: 'error' }]); return; }
    const result = await bridge.chooseWorkspace();
    if (!result || result.canceled) return;
    setWorkspace({ path: result.rootPath, name: result.name });
    emit([{ text: `Workspace: ${result.rootPath}`, tone: 'muted' }]);
  }, [emit]);

  const handleOpenEntry = useCallback(async (entry) => {
    if (!(await confirmDiscardIfNeeded())) return;
    const result = await bridge.openPath({ filePath: entry.path });
    if (!result || result.error) { emit([{ text: `[app] ${result?.error || 'Could not open file.'}`, tone: 'error' }]); return; }
    loadDocument(result);
    emit([{ text: `Opened ${result.fileName}`, tone: 'muted' }]);
  }, [confirmDiscardIfNeeded, loadDocument, emit]);

  const handleSaveAs = useCallback(async (textOverride) => {
    if (!bridge) { emit([{ text: '[app] File operations require the desktop app.', tone: 'error' }]); return; }
    const text = typeof textOverride === 'string' ? textOverride : (editorApi.current?.getValue() ?? content);
    const result = await bridge.saveFileAs({ content: text, suggestedName: fileName });
    if (!result) return;
    if (result.error) { emit([{ text: `[app] ${result.error}`, tone: 'error' }]); return; }
    if (result.saved) {
      setFilePath(result.filePath);
      setFileName(result.fileName);
      setSelectedPath(result.filePath);
      setDirty(false);
      emit([{ text: `Saved ${result.fileName}`, tone: 'muted' }]);
    }
  }, [content, emit, fileName]);

  const handleSave = useCallback(async () => {
    if (!bridge) { emit([{ text: '[app] File operations require the desktop app.', tone: 'error' }]); return; }
    const text = editorApi.current?.getValue() ?? content;
    if (!filePath) { await handleSaveAs(text); return; }
    const result = await bridge.saveFile({ filePath, content: text });
    if (!result) return;
    if (result.error) { emit([{ text: `[app] ${result.error}`, tone: 'error' }]); return; }
    if (result.saved) {
      setFileName(result.fileName);
      setDirty(false);
      emit([{ text: `Saved ${result.fileName}`, tone: 'muted' }]);
    }
  }, [content, emit, filePath, handleSaveAs]);

  const handleAssemble = useCallback(async () => {
    if (assembling || running) return;
    if (!bridge?.assemble) { emit([{ text: '[app] The assembler is only available in the desktop app.', tone: 'error' }]); return; }
    const source = editorApi.current?.getValue() ?? content;
    setAssembling(true);
    setOutputTab('console');
    setConsoleLines([{ id: idRef.current++, text: `Assembling ${fileName}…`, tone: 'muted', time: stamp() }]);
    setAssemblyText('');
    setMachineText('');
    setErrorLines([]);
    setDiagnostics([]);
    resetDebugger();
    try {
      const result = await bridge.assemble({ source, filePath });
      const entries = [];
      if (!(result.appError && /in progress/i.test(result.appError))) setCanRun(result.runnable === true);

      if (result.appError) entries.push({ text: `[app] ${result.appError}`, tone: 'error' });
      entries.push(...assemblyConsoleEntries(result.stdout, result.stderr));

      setAssemblyText(`${result.stdout || ''}${result.stderr ? `\n${result.stderr}` : ''}`.trim());
      setDiagnostics(parseDiagnostics(result.stdout));

      if (!result.appError) {
        if (result.timedOut) entries.push({ text: '[app] The assembler timed out and was stopped.', tone: 'error' });
        const ok = result.ok === true;
        entries.push({
          text: ok ? 'Assembly completed successfully.' : `Assembly failed${result.exitCode != null ? ` (exit ${result.exitCode})` : ''}.`,
          tone: ok ? 'success' : 'error',
        });
        if (result.object) {
          const words = result.object.words != null ? `, ${result.object.words} words` : '';
          entries.push({ text: `  object: ${result.object.name} — ${result.object.size} bytes${words}`, tone: 'muted' });
        } else if (ok) {
          entries.push({ text: '  object: not produced', tone: 'muted' });
        }
        if (!ok) entries.push({ text: '  Run is disabled until the source assembles without errors.', tone: 'warning' });
        if (result.builtFromSource) entries.push({ text: '  (built the assembler from asm.c; no prebuilt binary was found)', tone: 'muted' });
        if (result.truncated) entries.push({ text: '  (assembler output was truncated)', tone: 'muted' });
        if (ok && result.listing?.content) setMachineText(result.listing.content.trimEnd());
        if (ok) {
          setLineMap(buildLineMap(source, result.listing?.content));
          setLoadedWords(result.object?.words ?? null);
          setProgramMemory(buildProgramMemory(result.listing?.content));
          setListingMap(buildListingMap(result.listing?.content));
        }
      }

      emit(entries);
    } catch (error) {
      emit([{ text: `[app] ${error?.message || String(error)}`, tone: 'error' }]);
    } finally {
      setAssembling(false);
    }
  }, [assembling, running, content, emit, fileName, filePath]);

  const handleRun = useCallback(async () => {
    if (running || assembling) return;
    if (!bridge?.runProgram) { emit([{ text: '[app] The emulator is only available in the desktop app.', tone: 'error' }]); return; }
    if (!canRun) { emit([{ text: '[app] Assemble the current source successfully before running.', tone: 'warning' }]); return; }
    const source = editorApi.current?.getValue() ?? content;
    setRunning(true);
    setOutputTab('debugger');
    setConsoleLines([{ id: idRef.current++, text: `Running ${fileName}…`, tone: 'muted', time: stamp() }]);
    setErrorLines([]);
    try {
      const result = await bridge.runProgram({ source });
      const entries = [];

      if (result.appError) {
        entries.push({ text: `[app] ${result.appError}`, tone: 'error' });
        if (/source has changed|No current successful assembly/i.test(result.appError)) setCanRun(false);
      }
      entries.push(...condenseEmulatorStdout(result.stdout));
      if (result.stderr) entries.push(...toEntries(result.stderr, 'error'));
      if (result.stdout) {
        setAssemblyText((prev) => {
          const chunk = `=== Emulator output ===\n${result.stdout.replace(/\s+$/, '')}`;
          return prev ? `${prev}\n\n${chunk}` : chunk;
        });
      }

      const runEntry = {
        kind: 'run',
        instr: null,
        pc: result.registers ? result.registers.PC : null,
        registers: result.registers || null,
        memory: Array.isArray(result.memory) ? result.memory : [],
        status: result.ok === true ? 'HALTED' : 'ERROR',
        time: stamp(),
      };
      const runHistory = [...history, runEntry];
      setHistory(runHistory);
      applyEntry(runHistory.length - 1, runHistory);
      setLoadedWords(Number.isInteger(result.loadedWords) ? result.loadedWords : loadedWords);

      if (!result.appError) {
        if (result.timedOut) entries.push({ text: '[app] The emulator timed out and was stopped.', tone: 'error' });
        const ok = result.ok === true;
        entries.push({
          text: ok ? 'Execution completed (HALT).' : `Execution failed${result.exitCode != null ? ` (exit ${result.exitCode})` : ''}.`,
          tone: ok ? 'success' : 'error',
        });
        if (result.builtFromSource) entries.push({ text: '  (built the emulator from emu.c; no prebuilt binary was found)', tone: 'muted' });
        if (result.truncated) entries.push({ text: '  (emulator output was truncated)', tone: 'muted' });
      }

      emit(entries);
    } catch (error) {
      emit([{ text: `[app] ${error?.message || String(error)}`, tone: 'error' }]);
    } finally {
      setRunning(false);
    }
  }, [assembling, canRun, content, emit, fileName, running, history, applyEntry, loadedWords]);

  const handleStep = useCallback(async () => {
    if (assembling || running || stepping) return;
    if (!bridge?.stepProgram) { emit([{ text: '[app] Stepping is only available in the desktop app.', tone: 'error' }]); return; }
    if (!canRun) { emit([{ text: '[app] Assemble the current source successfully before stepping.', tone: 'warning' }]); return; }
    const source = editorApi.current?.getValue() ?? content;

    // Continue from the selected recorded state. A run entry (or no history)
    // cannot be used as a step prefix, so it starts a fresh trace at step 1.
    const atEnd = historyIndex === history.length - 1;
    const last = history.length ? history[history.length - 1] : null;
    let base;
    if (atEnd && last && last.kind === 'step') base = history;
    else if (atEnd && last && last.kind === 'run') base = [];
    else if (historyIndex >= 0 && history[historyIndex].kind === 'step') base = history.slice(0, historyIndex + 1);
    else base = [];

    const k = base.length + 1;
    const pcBefore = base.length ? base[base.length - 1].registers.PC : '00000000';
    setStepping(true);
    setOutputTab('debugger');
    try {
      const result = await bridge.stepProgram({ source, steps: k });
      if (result.appError) { emit([{ text: `[app] ${result.appError}`, tone: 'error' }]); return; }
      if (!result.registers) { emit([{ text: '[app] The emulator did not return a state for this step.', tone: 'error' }]); return; }
      const entry = {
        kind: 'step',
        instr: k,
        pc: pcBefore,
        nextPc: result.registers.PC,
        registers: result.registers,
        memory: Array.isArray(result.memory) ? result.memory : [],
        status: result.status,
        time: stamp(),
      };
      const newHistory = [...base, entry];
      setHistory(newHistory);
      applyEntry(newHistory.length - 1, newHistory);
      setLoadedWords(Number.isInteger(result.loadedWords) ? result.loadedWords : loadedWords);
      emit([{ text: `Step ${k}: executed 0x${pcBefore} → PC 0x${result.registers.PC}${result.status === 'HALTED' ? ' (halted)' : ''}`, tone: result.status === 'HALTED' ? 'success' : 'muted' }]);
    } catch (error) {
      emit([{ text: `[app] ${error?.message || String(error)}`, tone: 'error' }]);
    } finally {
      setStepping(false);
    }
  }, [assembling, running, stepping, canRun, content, history, historyIndex, applyEntry, loadedWords, emit]);

  const handleDebugReset = useCallback(() => {
    resetDebugger();
    setOutputTab('debugger');
    emit([{ text: 'Debugger reset.', tone: 'muted' }]);
  }, [resetDebugger, emit]);

  const handleChange = useCallback((value) => {
    setContent(value);
    setDirty(true);
    setCanRun(false);
    resetDebugger();
  }, [resetDebugger]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    if (!bridge?.onMenu) return undefined;
    return bridge.onMenu((action) => {
      if (action === 'menu:new') handleNew();
      else if (action === 'menu:open') handleOpen();
      else if (action === 'menu:openFolder') handleOpenFolder();
      else if (action === 'menu:save') handleSave();
      else if (action === 'menu:saveAs') handleSaveAs();
      else if (action === 'menu:assemble') handleAssemble();
      else if (action === 'menu:run') handleRun();
      else if (action === 'menu:toggleTheme') handleToggleTheme();
      else if (action === 'menu:undo') editorApi.current?.undo();
      else if (action === 'menu:redo') editorApi.current?.redo();
    });
  }, [handleNew, handleOpen, handleOpenFolder, handleSave, handleSaveAs, handleAssemble, handleRun, handleToggleTheme]);

  return (
    <div
      className="app"
      style={{ '--sidebar-width': `${sidebarWidth}px`, '--debugger-width': `${debuggerWidth}px` }}
    >
      <TopBar
        fileName={fileName}
        dirty={dirty}
        assembling={assembling}
        running={running}
        canRun={canRun}
        theme={theme}
        onNew={handleNew}
        onOpen={handleOpen}
        onOpenFolder={handleOpenFolder}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onAssemble={handleAssemble}
        onRun={handleRun}
        onStep={handleStep}
        onReset={handleDebugReset}
        stepping={stepping}
        debugActive={debugActive}
        halted={halted}
        onToggleTheme={handleToggleTheme}
        onUndo={() => editorApi.current?.undo()}
        onRedo={() => editorApi.current?.redo()}
      />

      <div className="shell">
        <ActivityBar
          theme={theme}
          fontSize={fontSize}
          onToggleTheme={handleToggleTheme}
          onFontSize={setFontSize}
        />
        <FileExplorer
          root={workspace}
          selectedPath={selectedPath}
          fileName={fileName}
          onChooseFolder={handleOpenFolder}
          onOpenFile={handleOpenEntry}
        />
        <Resizer
          orientation="vertical"
          invert
          value={sidebarWidth}
          min={180}
          max={420}
          onChange={setSidebarWidth}
          label="Resize explorer"
        />

        <section className="center">
          <TabStrip fileName={fileName} dirty={dirty} onClose={handleNew} />
          <div className="editor-pane">
            <EditorPane
              ref={editorApi}
              value={content}
              onChange={handleChange}
              theme={theme}
              fontSize={fontSize}
              diagnostics={diagnostics}
              onCursor={setCursor}
              activeLine={activeLine}
            />
          </div>
          <Resizer
            orientation="horizontal"
            value={outputHeight}
            min={110}
            max={Math.max(160, window.innerHeight - 260)}
            onChange={setOutputHeight}
            label="Resize output"
          />
          <OutputPanel
            activeTab={outputTab}
            onTabChange={setOutputTab}
            consoleLines={consoleLines}
            assemblyText={assemblyText}
            machineText={machineText}
            errorLines={errorLines}
            onClear={clearOutput}
            height={outputHeight}
            debuggerPanel={{
              entries: history,
              index: historyIndex,
              onSelect: handleSelectHistory,
              onPrev: handlePrevHistory,
              onNext: handleNextHistory,
              onStep: handleStep,
              onRun: handleRun,
              onReset: handleDebugReset,
              canStep: canRun && !halted && !running,
              canRun,
              busy: assembling || running || stepping,
              debugActive,
              listingMap,
              lineMap,
              programMemory,
            }}
          />
        </section>

        <Resizer
          orientation="vertical"
          value={debuggerWidth}
          min={260}
          max={560}
          onChange={setDebuggerWidth}
          label="Resize debugger"
        />
        <DebuggerPane
          registers={registers}
          previousRegisters={previousRegisters}
          memory={memory}
          previousMemory={previousMemory}
          running={running}
          stepping={stepping}
          debugActive={debugActive}
          stepCount={stepCount}
          halted={halted}
          loadedWords={loadedWords}
          programMemory={programMemory}
        />
      </div>

      <StatusBar
        fileName={fileName}
        dirty={dirty}
        cursor={cursor}
        canRun={canRun}
        memoryCount={memory.length}
        assembling={assembling}
        running={running}
        registers={registers}
      />
    </div>
  );
}
