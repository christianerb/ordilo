const DEFAULT_PAGE_SIZE = 1_000;

type PageResult<T> = { data: T[] | null; error: unknown };

/**
 * Read every row of a query page by page. PostgREST caps a single response
 * (max_rows, 1000 by default) without an error, so any admin list that can
 * grow past that must page. `page` builds the query for one inclusive row
 * range and must use a stable order.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}
