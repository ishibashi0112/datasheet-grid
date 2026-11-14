import { OrdersGrid } from './orders-grid';

// API_REFERENCE.md「状態の保存 / 復元」の URL の例そのまま
export default async function Page({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const [columnKey, direction] = ((await searchParams).sort ?? '').split('.');
  const initialState = columnKey
    ? { sort: [{ columnKey, direction: direction === 'desc' ? ('desc' as const) : ('asc' as const) }] }
    : undefined;
  return <OrdersGrid initialState={initialState} />;
}
