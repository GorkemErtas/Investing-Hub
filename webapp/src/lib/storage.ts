import { useState } from 'react';

export function useStored<T>(key: string, initial: T, validate: (value: unknown) => T) {
  const [loaded] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return { value: raw === null ? initial : validate(JSON.parse(raw)), warning: '' };
    } catch {
      return {
        value: initial,
        warning:
          'Saved browser data could not be read. Original data has been left untouched; changes will replace it.',
      };
    }
  });
  const [value, setValue] = useState(loaded.value);
  const [warning, setWarning] = useState(loaded.warning);
  function save(next: T) {
    const valid = validate(next);
    try {
      localStorage.setItem(key, JSON.stringify(valid));
      setWarning('');
    } catch {
      setWarning(
        'Browser storage is unavailable or full. Changes are kept only until this page closes.',
      );
    }
    setValue(valid);
  }
  return [value, save, warning] as const;
}
