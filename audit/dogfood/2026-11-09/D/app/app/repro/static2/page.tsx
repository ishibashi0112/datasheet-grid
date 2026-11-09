import { Suspense } from 'react';
import { Grid } from './grid';

export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Grid />
    </Suspense>
  );
}
