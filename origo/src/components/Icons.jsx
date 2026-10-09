// Coherent 24x24 line-icon set matching the Origo reference.
const PATHS = {
  file: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  search: ['M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'm20 20-4.2-4.2'],
  debugger: ['M8 9h8v5a4 4 0 0 1-8 0z', 'M9.5 4.5 11 7M14.5 4.5 13 7M4 12.5h4M16 12.5h4M5.5 19l3-2M18.5 19l-3-2'],
  settings: ['M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z', 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1'],
  assemble: ['M6 6h12v12H6z', 'M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4'],
  step: ['M5 5v14l10-7z', 'M19 5v14'],
  close: ['M6 6l12 12M18 6 6 18'],
  trash: ['M4 7h16', 'M10 11v6M14 11v6', 'M6 7l1 13h10l1-13M9 7V4h6v3'],
  sun: ['M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z', 'M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8'],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
  refresh: ['M4 12a8 8 0 1 0 2.6-5.9', 'M4 4v4.5h4.5'],
  chevronRight: ['M9 6l6 6-6 6'],
  chevronDown: ['M6 9l6 6 6-6'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v6M12 7.2v.8'],
};

// Solid glyphs (no stroke).
const FILLED = {
  run: 'M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z',
};

export default function Icon({ name, size = 16, className, strokeWidth = 1.7 }) {
  if (FILLED[name]) {
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={FILLED[name]} />
      </svg>
    );
  }
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((d, index) => <path key={index} d={d} />)}
    </svg>
  );
}
