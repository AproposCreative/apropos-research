export async function requestAuthMail(body: { kind: 'reset'; email: string } | { kind: 'verify' }, token?: string) {
  const response = await fetch('/api/auth/mail', { method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Mailen kunne ikke sendes. Prøv igen.');
}
