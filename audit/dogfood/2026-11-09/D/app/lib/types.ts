export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type Plan = 'free' | 'pro' | 'business' | 'enterprise';
export type Status = 'active' | 'invited' | 'suspended';

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  plan: Plan;
  status: Status;
  country: string;
  seats: number;
  mrr: number;
  signedUpAt: string; // YYYY-MM-DD
  lastActiveAt: string | null; // YYYY-MM-DD
  notes: string;
};

export const ROLES: Role[] = ['owner', 'admin', 'member', 'viewer'];
export const PLANS: Plan[] = ['free', 'pro', 'business', 'enterprise'];
export const STATUSES: Status[] = ['active', 'invited', 'suspended'];
