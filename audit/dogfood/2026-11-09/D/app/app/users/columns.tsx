'use client';

import { numberFormatter, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
import { PLANS, ROLES, STATUSES, type User } from '@/lib/types';

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const toOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: titleCase(v) }));

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const columns: GridColumn<User>[] = [
  { key: 'id', title: 'ID', width: 80, pinned: 'left', editable: false, align: 'right', filterType: 'number' },
  {
    key: 'name',
    title: 'Name',
    width: 180,
    pinned: 'left',
    filterType: 'text',
    validationMode: 'reject',
    validate: ({ value }) => (String(value ?? '').trim() ? true : 'Name is required'),
  },
  {
    key: 'email',
    title: 'Email',
    width: 260,
    filterType: 'text',
    validationMode: 'reject',
    validate: ({ value }) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '')) ? true : 'Enter a valid email address'),
  },
  {
    key: 'role',
    title: 'Role',
    width: 110,
    editor: { type: 'select', options: toOptions(ROLES) },
    filterType: 'set',
    filterOptions: toOptions(ROLES),
    valueFormatter: ({ value }) => titleCase(String(value ?? '')),
  },
  {
    key: 'plan',
    title: 'Plan',
    width: 120,
    editor: { type: 'select', options: toOptions(PLANS) },
    filterType: 'set',
    filterOptions: toOptions(PLANS),
    valueFormatter: ({ value }) => titleCase(String(value ?? '')),
  },
  {
    key: 'status',
    title: 'Status',
    width: 120,
    editor: { type: 'select', options: toOptions(STATUSES) },
    filterType: 'set',
    filterOptions: toOptions(STATUSES),
    valueFormatter: ({ value }) => titleCase(String(value ?? '')),
    conditionalFormat: { chips: { active: 'good', invited: 'info', suspended: 'critical' } },
  },
  { key: 'country', title: 'Country', width: 100, filterType: 'set' },
  {
    key: 'seats',
    title: 'Seats',
    width: 90,
    align: 'right',
    editor: { type: 'number', min: 1, integer: true },
    filterType: 'number',
    valueFormatter: numberFormatter({ locale: 'en-US' }),
  },
  {
    key: 'mrr',
    title: 'MRR',
    width: 110,
    align: 'right',
    editor: { type: 'number', min: 0 },
    filterType: 'number',
    valueFormatter: ({ value }) => (value === null || value === undefined || value === '' ? '' : usd.format(Number(value))),
    conditionalFormat: { dataBar: { showValue: true } },
  },
  { key: 'signedUpAt', title: 'Signed up', width: 120, editor: { type: 'date' }, filterType: 'dateSet' },
  { key: 'lastActiveAt', title: 'Last active', width: 120, editor: { type: 'date' }, filterType: 'date' },
  { key: 'notes', title: 'Notes', width: 220, flex: 1, filterType: 'text' },
];
