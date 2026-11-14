import { Suspense } from 'react';
import { Grid } from './grid';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Grid />
    </Suspense>
  );
}
