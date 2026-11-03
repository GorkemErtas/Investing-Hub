export interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function readStored<T>(
  storage: BrowserStorage,
  key: string,
  initial: T,
  validate: (value: unknown) => T,
) {
  try {
    const raw = storage.getItem(key);
    return { value: raw === null ? initial : validate(JSON.parse(raw)), warning: '' };
  } catch {
    return {
      value: initial,
      warning:
        'Saved browser data could not be read. Original data has been left untouched; changes will replace it.',
    };
  }
}
export function writeStored<T>(
  storage: BrowserStorage,
  key: string,
  value: T,
  validate: (value: unknown) => T,
) {
  const valid = validate(value);
  try {
    storage.setItem(key, JSON.stringify(valid));
    return { value: valid, warning: '' };
  } catch {
    return {
      value: valid,
      warning:
        'Browser storage is unavailable or full. Changes are kept only until this page closes.',
    };
  }
}
