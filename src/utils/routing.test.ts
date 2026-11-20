import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthPath, buildTabPath, resolveAppRoute } from './routing';
import type { UserProfile } from './domain';

const approvedAdmin: UserProfile = {
  id: 'usr_admin',
  fullName: 'Founder Admin',
  email: 'admin@avenorlegacy.com',
  role: 'admin',
  status: 'approved',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const approvedStaff: UserProfile = {
  id: 'usr_staff',
  fullName: 'Tariq Advisor',
  email: 'tariq@avenorlegacy.com',
  role: 'staff',
  status: 'approved',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const pendingStaff: UserProfile = {
  ...approvedStaff,
  status: 'pending',
};

const suspendedStaff: UserProfile = {
  ...approvedStaff,
  status: 'suspended',
};

test('unauthenticated visitor attempting protected /admin/orders or /staff/place-order is blocked and redirected to login', () => {
  const adminAttempt = resolveAppRoute('/admin/orders', null);
  assert.equal(adminAttempt.kind, 'auth');
  assert.equal(adminAttempt.portal, 'admin');
  assert.equal(adminAttempt.canonicalPath, '/admin/login');
  assert.ok(adminAttempt.guardNotice?.includes('/admin/orders'));

  const staffAttempt = resolveAppRoute('/staff/place-order', null);
  assert.equal(staffAttempt.kind, 'auth');
  assert.equal(staffAttempt.portal, 'staff');
  assert.equal(staffAttempt.canonicalPath, '/login');
  assert.ok(staffAttempt.guardNotice?.includes('/staff/place-order'));
});

test('public visitor trying /admin/register is blocked from admin signup', () => {
  const res = resolveAppRoute('/admin/register', null);
  assert.equal(res.kind, 'auth');
  assert.equal(res.portal, 'admin');
  assert.equal(res.authMode, 'login');
  assert.equal(res.canonicalPath, '/admin/login');
  assert.ok(res.guardNotice?.toLowerCase().includes('disabled'));
});

test('pending or suspended staff cannot access protected staff or admin dashboards', () => {
  const pendingAttempt = resolveAppRoute('/staff/dashboard', pendingStaff);
  assert.equal(pendingAttempt.kind, 'auth');
  assert.equal(pendingAttempt.canonicalPath, '/login');

  const suspendedAttempt = resolveAppRoute('/staff/place-order', suspendedStaff);
  assert.equal(suspendedAttempt.kind, 'auth');
  assert.equal(suspendedAttempt.canonicalPath, '/login');
});

test('approved staff accessing /admin/* is denied and redirected to /staff/dashboard', () => {
  const res = resolveAppRoute('/admin/staff', approvedStaff);
  assert.equal(res.kind, 'staff');
  assert.equal(res.canonicalPath, '/staff/dashboard');
  assert.equal(res.tab, 'dashboard');
  assert.ok(res.guardNotice?.includes('Access denied'));
});

test('approved staff navigating valid staff routes resolves exact tab', () => {
  const res = resolveAppRoute('/staff/place-order', approvedStaff);
  assert.equal(res.kind, 'staff');
  assert.equal(res.canonicalPath, '/staff/place-order');
  assert.equal(res.tab, 'place-order');
  assert.equal(res.guardNotice, null);
});

test('approved admin navigating /admin/staff and /staff/dashboard resolves cleanly', () => {
  const staffMgmt = resolveAppRoute('/admin/staff', approvedAdmin);
  assert.equal(staffMgmt.kind, 'admin');
  assert.equal(staffMgmt.canonicalPath, '/admin/staff');
  assert.equal(staffMgmt.tab, 'staff');
  assert.equal(staffMgmt.guardNotice, null);

  const staffCross = resolveAppRoute('/staff/dashboard', approvedAdmin);
  assert.equal(staffCross.kind, 'admin');
  assert.equal(staffCross.canonicalPath, '/admin/dashboard');
  assert.ok(staffCross.guardNotice?.includes('Admin Portal'));
});

test('buildTabPath and buildAuthPath produce canonical URLs', () => {
  assert.equal(buildTabPath('admin', 'reports'), '/admin/reports');
  assert.equal(buildTabPath('staff', 'unknown-tab'), '/staff/dashboard');
  assert.equal(buildAuthPath('admin', 'login'), '/admin/login');
  assert.equal(buildAuthPath('staff', 'register'), '/register');
  assert.equal(buildAuthPath('staff', 'reset-confirm'), '/reset-password');
});
