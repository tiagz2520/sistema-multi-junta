export const healthEndpoint = '/api/v1/health';

export async function checkApiHealth(signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(healthEndpoint, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!response.ok) {
      return false;
    }

    const payload: unknown = await response.json();
    return (
      payload !== null &&
      typeof payload === 'object' &&
      'status' in payload &&
      payload.status === 'ok'
    );
  } catch {
    return false;
  }
}
