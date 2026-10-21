declare global {
  interface BunFetchRequestInit {
    timeout?: boolean;
  }
}

export function fetchWithoutIdleTimeout(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, { ...init, timeout: false });
}
