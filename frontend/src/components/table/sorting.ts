export type SortDirection = 'asc' | 'desc';

export type SortDescriptor<K extends string = string> = {
  column: K;
  direction: SortDirection;
};

export const updateSortDescriptors = <K extends string>(
  descriptors: SortDescriptor<K>[],
  column: K,
  multi: boolean
): SortDescriptor<K>[] => {
  const next = multi ? [...descriptors] : descriptors.filter((descriptor) => descriptor.column === column);
  const index = next.findIndex((descriptor) => descriptor.column === column);

  if (index === -1) {
    next.push({ column, direction: 'asc' });
    return multi ? next : next.slice(-1);
  }

  const current = next[index].direction;
  if (current === 'asc') {
    next[index] = { column, direction: 'desc' };
    return next;
  }

  next.splice(index, 1);
  return next;
};

type SortableValue = string | number | Date | boolean | null | undefined;

const compareValues = (left: SortableValue, right: SortableValue): number => {
  if (left === null || left === undefined) {
    return right === null || right === undefined ? 0 : -1;
  }

  if (right === null || right === undefined) {
    return 1;
  }

  if (left instanceof Date || right instanceof Date) {
    const toTime = (value: SortableValue): number => {
      if (value instanceof Date) {
        return value.getTime();
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const timestamp = new Date(value).getTime();
        return Number.isNaN(timestamp) ? 0 : timestamp;
      }
      return 0;
    };

    const leftTime = toTime(left);
    const rightTime = toTime(right);
    return leftTime - rightTime;
  }

  if (typeof left === 'number' || typeof right === 'number') {
    const leftNumber = typeof left === 'number' ? left : Number(left);
    const rightNumber = typeof right === 'number' ? right : Number(right);
    return leftNumber - rightNumber;
  }

  if (typeof left === 'boolean' || typeof right === 'boolean') {
    const leftBool = Boolean(left);
    const rightBool = Boolean(right);
    return Number(leftBool) - Number(rightBool);
  }

  const leftString = String(left);
  const rightString = String(right);
  return leftString.localeCompare(rightString, 'cs', { sensitivity: 'base' });
};

export const sortByDescriptors = <T, K extends string>(
  data: readonly T[],
  descriptors: SortDescriptor<K>[],
  accessors: Record<K, (item: T) => SortableValue>
): T[] => {
  if (descriptors.length === 0) {
    return [...data];
  }

  const entries = [...data];
  entries.sort((left, right) => {
    for (const descriptor of descriptors) {
      const accessor = accessors[descriptor.column];
      if (!accessor) {
        continue;
      }

      const result = compareValues(accessor(left), accessor(right));
      if (result !== 0) {
        return descriptor.direction === 'asc' ? result : -result;
      }
    }

    return 0;
  });

  return entries;
};
