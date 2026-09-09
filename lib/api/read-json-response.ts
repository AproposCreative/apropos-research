/** Never turn a failed/empty API response into successful empty application data. */
export async function readJsonResponse<T = any>(response: Response): Promise<T> {
  const text = await response.text();
  const requestId = response.headers.get('x-request-id');
  const suffix = ` (HTTP ${response.status}${requestId ? `, reference ${requestId}` : ''})`;
  let data: any;
  try { data = JSON.parse(text); }
  catch {
    throw new Error((response.status === 401 ? 'Din session er udløbet. Log ind igen.' :
      'Serveren returnerede et tomt eller ugyldigt svar. Prøv igen.') + suffix);
  }
  if (!response.ok) {
    throw new Error((response.status === 401 ? 'Din session er udløbet. Log ind igen.' :
      typeof data?.error === 'string' ? data.error : 'Forespørgslen mislykkedes.') + suffix);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Serverens svar havde et ugyldigt format.' + suffix);
  }
  return data as T;
}
