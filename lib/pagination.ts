/**
 * Shared limit/offset pagination for list GET routes.
 *
 * Several pipe-spool list endpoints had no `take` at all — fine while these
 * tables are small, but a real risk once a production deployment accumulates
 * thousands of spools/joints/inspections (an unbounded findMany against a
 * live table an operator can insert into is exactly the kind of thing that
 * degrades gradually until it doesn't). This caps every response at a sane
 * size by default and gives callers an explicit limit/offset contract to
 * build real pagination UI against later, without one existing yet.
 */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export interface PaginationParams {
    take: number;
    skip: number;
}

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
    const limitRaw = parseInt(searchParams.get('limit') ?? '', 10);
    const offsetRaw = parseInt(searchParams.get('offset') ?? '', 10);
    const take = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT;
    const skip = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    return { take, skip };
}
