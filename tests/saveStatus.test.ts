import { describe, expect, it } from 'vitest';
import { ARRIVAL_SLACK_MS, QUIET_MS, isNoteSaved } from '../src/superdoc/save-status';

const base = { now: 10_000, lastEditAt: 0, workerLastLocalUpdateAt: 0, workerUnpushed: false };

describe('isNoteSaved', () => {
  it('is saved when nothing was edited and the worker has nothing pending', () => {
    expect(isNoteSaved(base)).toBe(true);
    expect(isNoteSaved({ ...base, workerUnpushed: true })).toBe(false);
  });

  it('is not saved while the student is still typing', () => {
    expect(
      isNoteSaved({
        ...base,
        lastEditAt: base.now - QUIET_MS + 1,
        workerLastLocalUpdateAt: base.now,
      }),
    ).toBe(false);
  });

  it("is not saved until the worker has seen the latest edit (the bug's window)", () => {
    const lastEditAt = base.now - 2000;
    expect(
      isNoteSaved({
        ...base,
        lastEditAt,
        workerLastLocalUpdateAt: lastEditAt - ARRIVAL_SLACK_MS - 1,
      }),
    ).toBe(false);
    expect(isNoteSaved({ ...base, lastEditAt, workerLastLocalUpdateAt: lastEditAt + 5 })).toBe(
      true,
    );
  });

  it('is not saved while the worker holds unpushed edits', () => {
    const lastEditAt = base.now - 2000;
    expect(
      isNoteSaved({
        ...base,
        lastEditAt,
        workerLastLocalUpdateAt: lastEditAt,
        workerUnpushed: true,
      }),
    ).toBe(false);
  });

  it('never trusts a missing worker report after an edit (falls back to waiting)', () => {
    expect(isNoteSaved({ ...base, lastEditAt: base.now - 5000 })).toBe(false);
  });
});
