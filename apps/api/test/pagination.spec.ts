/**
 * Paging maths. Pure — no database.
 *
 * `reflect-metadata` is imported explicitly because this is the only spec that
 * loads a decorated module without going through Nest first, which is what
 * normally pulls the polyfill in.
 */
import 'reflect-metadata';
import { pageParams, toPage, DEFAULT_PAGE_SIZE } from '../src/common/pagination';

describe('pageParams', () => {
  it('defaults to the first page at the default size', () => {
    expect(pageParams({})).toEqual({ skip: 0, take: DEFAULT_PAGE_SIZE, page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('computes skip from page and size', () => {
    expect(pageParams({ page: 3, pageSize: 20 })).toMatchObject({ skip: 40, take: 20 });
  });

  it('clamps nonsense rather than producing a negative skip', () => {
    expect(pageParams({ page: 0 }).skip).toBe(0);
    expect(pageParams({ page: -5 }).page).toBe(1);
    expect(pageParams({ pageSize: 0 }).take).toBe(1);
    expect(pageParams({ pageSize: 10_000 }).take).toBe(200);
  });
});

describe('toPage', () => {
  it('reports the page count', () => {
    expect(toPage([], 100, 1, 25).pages).toBe(4);
    expect(toPage([], 101, 1, 25).pages).toBe(5);
  });

  it('never reports zero pages, so the UI cannot render "page 1 of 0"', () => {
    expect(toPage([], 0, 1, 25).pages).toBe(1);
  });

  it('carries the rows and total through untouched', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(toPage(rows, 57, 2, 2)).toEqual({ items: rows, total: 57, page: 2, pageSize: 2, pages: 29 });
  });
});
