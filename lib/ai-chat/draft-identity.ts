/** Reserve synchronously before async saves so concurrent callers share one document. */
export function createWriterDraftIdentity(makeId = () => `draft_${crypto.randomUUID()}`) {
  let id: string | null = null;
  return {
    set(next: string | null) { id = next; },
    reserve() { return id ||= makeId(); },
  };
}
