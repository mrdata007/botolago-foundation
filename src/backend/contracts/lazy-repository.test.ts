import { describe, expect, it } from "bun:test";
import { lazyRepository } from "./lazy-repository";

interface Counter {
  add(by: number): Promise<number>;
}

class CounterImpl implements Counter {
  total = 0;
  async add(by: number) {
    this.total += by;
    return this.total;
  }
}

describe("lazyRepository", () => {
  it("loads nothing until the first call, then loads once and keeps `this`", async () => {
    let loads = 0;
    const repository = lazyRepository<Counter>(async () => {
      loads += 1;
      return new CounterImpl();
    });
    expect(loads).toBe(0);
    expect(await repository.add(2)).toBe(2);
    expect(await repository.add(3)).toBe(5);
    expect(loads).toBe(1);
  });

  it("tries the load again after a failure", async () => {
    let attempts = 0;
    const repository = lazyRepository<Counter>(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return new CounterImpl();
    });
    await expect(repository.add(1)).rejects.toThrow("offline");
    expect(await repository.add(1)).toBe(1);
    expect(attempts).toBe(2);
  });

  it("is not a thenable, so awaiting it gives it back", async () => {
    const repository = lazyRepository<Counter>(async () => new CounterImpl());
    expect(await repository).toBe(repository);
  });
});
