import { Suspense } from 'react';
import { fromRecord } from '@/lib/url-state';
import { UsersGrid } from './users-grid';

async function UsersSection({ searchParams }: { searchParams: PageProps<'/users'>['searchParams'] }) {
  const initialUrlState = fromRecord(await searchParams);
  return <UsersGrid initialUrlState={initialUrlState} />;
}

export default function UsersPage({ searchParams }: PageProps<'/users'>) {
  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col">
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading users…</div>}>
        <UsersSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
