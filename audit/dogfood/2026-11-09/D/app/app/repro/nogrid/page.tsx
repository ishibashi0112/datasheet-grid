'use client';

import { useState } from 'react';

export default function Page() {
  const [rows] = useState([{ id: 1, name: 'alpha' }]);
  return <div>{rows.map((r) => <div key={r.id}>{r.name}</div>)}</div>;
}
