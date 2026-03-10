export class LoopGuard {
  private counts = new Map<string, number>();

  constructor(private globalLimit: number) {}

  check(from: string, to: string, edgeLimit?: number): boolean {
    const key = `${from}->${to}`;
    const current = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, current);
    const limit = edgeLimit ?? this.globalLimit;
    return current <= limit;
  }

  getLoopMap(): Record<string, number> {
    const map: Record<string, number> = {};
    for (const [key, count] of this.counts) {
      map[key] = count;
    }
    return map;
  }
}
