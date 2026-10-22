const MILLISECONDS_PER_MINUTE = 60_000;

export const UNKNOWN_CLIENT_KEY = "unknown";

export type WebhookRateLimiter = {
  readonly take: (clientKey: string | null) => boolean;
};

export type WebhookRateLimiterOptions = {
  readonly limitPerMinute: number;
  readonly now: () => Date;
};

type WindowCount = {
  windowIndex: number;
  count: number;
};

export function createWebhookRateLimiter({
  limitPerMinute,
  now,
}: WebhookRateLimiterOptions): WebhookRateLimiter {
  const windowByKey = new Map<string, WindowCount>();

  function pruneOtherWindows(windowIndex: number): void {
    for (const [key, window] of windowByKey) {
      if (window.windowIndex !== windowIndex) windowByKey.delete(key);
    }
  }

  return {
    take(clientKey) {
      const key = clientKey ?? UNKNOWN_CLIENT_KEY;
      const windowIndex = Math.floor(now().getTime() / MILLISECONDS_PER_MINUTE);
      pruneOtherWindows(windowIndex);
      const window = windowByKey.get(key) ?? { windowIndex, count: 0 };
      if (window.count >= limitPerMinute) return false;
      window.count += 1;
      windowByKey.set(key, window);
      return true;
    },
  };
}
