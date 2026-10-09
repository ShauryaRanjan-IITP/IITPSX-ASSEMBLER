import { useCallback } from 'react';

// A thin drag handle. `orientation` is 'vertical' (resizes a width, dragging
// left/right) or 'horizontal' (resizes a height, dragging up/down).
export default function Resizer({ orientation, value, min, max, onChange, label, invert }) {
  const onMouseDown = useCallback((event) => {
    event.preventDefault();
    const start = orientation === 'vertical' ? event.clientX : event.clientY;
    const startValue = value;

    const onMove = (moveEvent) => {
      const current = orientation === 'vertical' ? moveEvent.clientX : moveEvent.clientY;
      const raw = invert ? current - start : start - current;
      const next = Math.min(Math.max(startValue + raw, min), max);
      onChange(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [orientation, value, min, max, onChange]);

  return (
    <div
      className={`resizer ${orientation}`}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      onMouseDown={onMouseDown}
    />
  );
}
