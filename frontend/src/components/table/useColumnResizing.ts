import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ColumnSizeConfig<K extends string> = {
  key: K;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
};

type ColumnSizes<K extends string> = Record<K, number>;

type ResizingState<K extends string> = {
  key: K;
  startX: number;
  startWidth: number;
};

const clampWidth = (value: number, min = 120, max?: number) => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return min;
  }

  if (value < min) {
    return min;
  }

  if (typeof max === 'number' && value > max) {
    return max;
  }

  return value;
};

export const useColumnResizing = <K extends string>(
  columns: Array<ColumnSizeConfig<K>>
) => {
  const constraints = useRef(
    new Map<K, { minWidth: number; maxWidth?: number }>(
      columns.map((column) => [
        column.key,
        { minWidth: column.minWidth ?? 120, maxWidth: column.maxWidth },
      ])
    )
  );

  const defaults = useMemo<ColumnSizes<K>>(() => {
    const initial = {} as ColumnSizes<K>;
    columns.forEach((column) => {
      const constraint = constraints.current.get(column.key);
      const minWidth = constraint?.minWidth ?? 120;
      initial[column.key] = clampWidth(column.defaultWidth ?? minWidth, minWidth, constraint?.maxWidth);
    });
    return initial;
  }, [columns]);

  const [sizes, setSizes] = useState<ColumnSizes<K>>(defaults);
  const [activeKey, setActiveKey] = useState<K | null>(null);
  const resizing = useRef<ResizingState<K> | null>(null);

  useEffect(() => {
    setSizes((current) => {
      const next = { ...current };
      columns.forEach((column) => {
        if (!(column.key in next)) {
          const constraint = constraints.current.get(column.key);
          const minWidth = constraint?.minWidth ?? 120;
          next[column.key] = clampWidth(
            column.defaultWidth ?? minWidth,
            minWidth,
            constraint?.maxWidth
          );
        }
      });
      return next;
    });
  }, [columns]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    const state = resizing.current;
    if (!state) {
      return;
    }

    const constraint = constraints.current.get(state.key);
    const delta = event.clientX - state.startX;
    const nextWidth = clampWidth(
      state.startWidth + delta,
      constraint?.minWidth ?? 120,
      constraint?.maxWidth
    );

    setSizes((current) => {
      if (current[state.key] === nextWidth) {
        return current;
      }

      return {
        ...current,
        [state.key]: nextWidth,
      };
    });
  }, []);

  const stopResizing = useCallback(() => {
    resizing.current = null;
    setActiveKey(null);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', stopResizing);
  }, [handleMouseMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [handleMouseMove, stopResizing]);

  const startResizing = useCallback(
    (key: K, event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      resizing.current = {
        key,
        startX: event.clientX,
        startWidth: sizes[key],
      };
      setActiveKey(key);

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', stopResizing);
    },
    [handleMouseMove, sizes, stopResizing]
  );

  const resetWidth = useCallback(
    (key: K) => {
      const constraint = constraints.current.get(key);
      const minWidth = constraint?.minWidth ?? 120;
      setSizes((current) => ({
        ...current,
        [key]: clampWidth(defaults[key], minWidth, constraint?.maxWidth),
      }));
    },
    [defaults]
  );

  return {
    sizes,
    startResizing,
    resetWidth,
    activeKey,
  };
};
