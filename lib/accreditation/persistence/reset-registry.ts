type Resettable = { __resetForTests?: () => void | Promise<void> };

const resettables: Resettable[] = [];

export function registerAccreditationStoreReset(store: Resettable): void {
  resettables.push(store);
}

export function listAccreditationStoreResets(): Resettable[] {
  return resettables;
}
