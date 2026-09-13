export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installStreamWarningDiagnostics } = await import('./lib/stream-warning-diagnostics');
    installStreamWarningDiagnostics();
  }
}
