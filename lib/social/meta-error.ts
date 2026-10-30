/** A safe, structured error, never the provider's raw payload or token-bearing URL. */
export class MetaRequestError extends Error {
  constructor(public definite: boolean, code?: number) {
    super(code === 190 ? 'Meta afviste adgangen. Forbind kontoen igen i Indstillinger.' :
      code ? `Meta afviste handlingen (kode ${code}).` : 'Meta kunne ikke bekræfte handlingen.');
  }
}
