export type Semaphore = {
  readonly run: <T>(task: () => Promise<T>) => Promise<T>;
};

export function createSemaphore(limit: number): Semaphore {
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError("semaphore limit must be a positive integer");
  let activeCount = 0;
  const waitingList: (() => void)[] = [];

  async function acquire(): Promise<void> {
    if (activeCount < limit) {
      activeCount += 1;
      return;
    }
    await new Promise<void>((resolve) => waitingList.push(resolve));
  }

  function release(): void {
    const next = waitingList.shift();
    if (next === undefined) activeCount -= 1;
    else next();
  }

  return {
    async run(task) {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
