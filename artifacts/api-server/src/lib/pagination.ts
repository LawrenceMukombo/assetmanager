import type { Request } from "express";

export interface PageParams {
  page: number;
  pageSize: number;
  offset: number;
  enabled: boolean;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

export function readPageParams(req: Request): PageParams {
  const q = req.query as { page?: string; page_size?: string };
  const enabled = q.page !== undefined || q.page_size !== undefined;
  const rawPage = Number(q.page);
  const rawSize = Number(q.page_size);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawSize) && rawSize >= 1
    ? Math.min(Math.floor(rawSize), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  return { page, pageSize, offset: (page - 1) * pageSize, enabled };
}

export function paginatedResponse<T>(items: T[], total: number, params: PageParams) {
  const totalPages = params.pageSize > 0 ? Math.ceil(total / params.pageSize) : 1;
  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages,
  };
}

export function paginateArray<T>(arr: T[], params: PageParams): { items: T[]; total: number } {
  const total = arr.length;
  if (!params.enabled) return { items: arr, total };
  const items = arr.slice(params.offset, params.offset + params.pageSize);
  return { items, total };
}
