'use client';

import React from 'react';

interface QRCodeProps {
  value: string;
  size?: number;
  label?: string;
}

export function QRCodeGenerator({ value, size = 110, label }: QRCodeProps) {
  const hashString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  };

  const seed = hashString(value);
  const gridSize = 21;
  const cellSize = size / gridSize;

  const isPositionFinder = (r: number, c: number) => {
    if (r < 7 && c < 7) return true;
    if (r < 7 && c >= gridSize - 7) return true;
    if (r >= gridSize - 7 && c < 7) return true;
    return false;
  };

  const getCellFill = (r: number, c: number) => {
    if (isPositionFinder(r, c)) {
      if ((r === 0 || r === 6 || c === 0 || c === 6) && (r < 7 && c < 7)) return true;
      if ((r === 0 || r === 6 || c === gridSize - 7 || c === gridSize - 1) && (r < 7 && c >= gridSize - 7)) return true;
      if ((r === gridSize - 7 || r === gridSize - 1 || c === 0 || c === 6) && (r >= gridSize - 7 && c < 7)) return true;
      if (r >= 2 && r <= 4 && c >= 2 && c <= 4) return true;
      if (r >= 2 && r <= 4 && c >= gridSize - 5 && c <= gridSize - 3) return true;
      if (r >= gridSize - 5 && r <= gridSize - 3 && c >= 2 && c <= 4) return true;
      return false;
    }
    const val = (seed * (r + 1) * (c + 1) + r * 13 + c * 37) % 100;
    return val > 45;
  };

  const cells = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (getCellFill(r, c)) {
        cells.push(
          <rect
            key={`${r}-${c}`}
            x={c * cellSize}
            y={r * cellSize}
            width={cellSize}
            height={cellSize}
            fill="currentColor"
          />
        );
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 p-3 bg-white dark:bg-slate-900 rounded-xl border border-[var(--border-default)] shadow-xs">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="text-slate-900 dark:text-white">
        <rect width={size} height={size} fill="white" />
        <g fill="currentColor">{cells}</g>
      </svg>
      {label && <span className="text-[10px] font-mono text-[var(--text-secondary)] font-semibold truncate max-w-[120px]">{label}</span>}
    </div>
  );
}
