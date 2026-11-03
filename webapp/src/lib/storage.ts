import { useState } from 'react';
import { readStored, writeStored } from './storageAdapter';

const browserStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};

export function useStored<T>(key: string, initial: T, validate: (value: unknown) => T) {
  const [loaded] = useState(() => readStored(browserStorage, key, initial, validate));
  const [value, setValue] = useState(loaded.value);
  const [warning, setWarning] = useState(loaded.warning);
  function save(next: T) {
    const saved = writeStored(browserStorage, key, next, validate);
    setWarning(saved.warning);
    setValue(saved.value);
  }
  return [value, save, warning] as const;
}
