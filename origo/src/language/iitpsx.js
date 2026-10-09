export const IITPSX_LANGUAGE_ID = 'iitpsx';

// Instruction mnemonics and directives from the assembler's OPTAB (asm.c).
const MNEMONICS = [
  'data', 'ldc', 'adc', 'ldl', 'stl', 'ldnl', 'stnl', 'add', 'sub', 'shl',
  'shr', 'adj', 'a2sp', 'sp2a', 'call', 'return', 'brz', 'brlz', 'br',
  'HALT', 'mul', 'div', 'SET',
];

// Registers supported by the IITPSx architecture (A, B, PC, SP). No flags.
const REGISTERS = 'PC|SP|A|B';

let registered = false;

export function registerIitpsx(monaco) {
  if (registered) return;
  registered = true;

  monaco.languages.register({ id: IITPSX_LANGUAGE_ID });

  monaco.languages.setLanguageConfiguration(IITPSX_LANGUAGE_ID, {
    comments: { lineComment: ';' },
    brackets: [['(', ')']],
    autoClosingPairs: [{ open: '(', close: ')' }],
  });

  monaco.languages.setMonarchTokensProvider(IITPSX_LANGUAGE_ID, {
    defaultToken: '',
    ignoreCase: true,
    keywords: MNEMONICS,
    tokenizer: {
      root: [
        [/;.*$/, 'comment'],
        [/\s+/, 'white'],
        [/[A-Za-z_][A-Za-z0-9_]*(?=\s*:)/, 'label'],
        [/\bHALT\b/, 'keyword.halt'],
        [new RegExp(`\\b(?:${REGISTERS})\\b`), 'register'],
        [/[A-Za-z_][A-Za-z0-9_]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        [/[-+]?0[xX][0-9a-fA-F]+/, 'number.hex'],
        [/[-+]?[0-9]+/, 'number'],
        [/[,():]/, 'delimiter'],
      ],
    },
  });

  monaco.editor.defineTheme('origo-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '7b869c', fontStyle: 'italic' },
      { token: 'keyword', foreground: '82abff' },
      { token: 'keyword.halt', foreground: 'c9a0f5' },
      { token: 'register', foreground: 'c9a0f5' },
      { token: 'label', foreground: 'a6b0c2' },
      { token: 'number', foreground: 'f2b862' },
      { token: 'number.hex', foreground: 'f2b862' },
      { token: 'identifier', foreground: 'dde3ee' },
      { token: 'delimiter', foreground: '818ca0' },
    ],
    colors: {
      'editor.background': '#131821',
      'editor.foreground': '#dde3ee',
      'editorLineNumber.foreground': '#5c667a',
      'editorLineNumber.activeForeground': '#eab04a',
      'editor.lineHighlightBackground': '#1a202b',
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': '#3a66e6',
      'editor.selectionBackground': '#23324f',
      'editor.inactiveSelectionBackground': '#1e2632',
      'editorIndentGuide.background1': '#1e2632',
      'editorGutter.background': '#131821',
      'editorWidget.background': '#0f131a',
      'editorWidget.border': '#1e2632',
      'scrollbarSlider.background': '#2d374880',
      'scrollbarSlider.hoverBackground': '#2d3748c0',
    },
  });

  monaco.editor.defineTheme('origo-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '68748b', fontStyle: 'italic' },
      { token: 'keyword', foreground: '1f55d4' },
      { token: 'keyword.halt', foreground: '7a3cc2' },
      { token: 'register', foreground: '7a3cc2' },
      { token: 'label', foreground: '444e63' },
      { token: 'number', foreground: '9a5200' },
      { token: 'number.hex', foreground: '9a5200' },
      { token: 'identifier', foreground: '151a25' },
      { token: 'delimiter', foreground: '5c677d' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#151a25',
      'editorLineNumber.foreground': '#8a94a3',
      'editorLineNumber.activeForeground': '#3a66e6',
      'editor.lineHighlightBackground': '#eef1f5',
      'editorCursor.foreground': '#3a66e6',
      'editor.selectionBackground': '#cfe0ff',
      'editorGutter.background': '#ffffff',
      'editorWidget.border': '#dde2ea',
    },
  });
}
