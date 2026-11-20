import type { UserProfile } from './domain';

export type AuthPortalType = 'staff' | 'admin';
export type AuthModeType = 'login' | 'register' | 'reset-request' | 'reset-confirm';

export const ADMIN_TABS = [
  'dashboard',
  'orders',
  'stock',
  'products',
  'staff',
  'ready-text',
  'expenses',
  'reports',
  'notifications',
  'settings',
] as const;

export const STAFF_TABS = [
  'dashboard',
  'place-order',
  'stock-checking',
  'processing',
  'completed',
  'rejected',
  'history',
  'ready-text',
  'profile',
] as const;

export type AdminTabId = (typeof ADMIN_TABS)[number];
export type StaffTabId = (typeof STAFF_TABS)[number];

export interface RouteResolution {
  kind: 'auth' | 'admin' | 'staff';
  canonicalPath: string;
  portal: AuthPortalType;
  authMode: AuthModeType;
  tab: string;
  guardNotice: string | null;
}

export function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  const cleaned = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '');
  return cleaned || '/';
}

export function buildTabPath(role: 'admin' | 'staff', tab: string): string {
  const validTabs: readonly string[] = role === 'admin' ? ADMIN_TABS : STAFF_TABS;
  const safeTab = validTabs.includes(tab) ? tab : 'dashboard';
  return `/${role}/${safeTab}`;
}

export function buildAuthPath(portal: AuthPortalType, mode: AuthModeType): string {
  if (mode === 'register') return '/register';
  if (mode === 'reset-request' || mode === 'reset-confirm') return '/reset-password';
  return portal === 'admin' ? '/admin/login' : '/login';
}

export function resolveAppRoute(
  pathname: string,
  user: UserProfile | null
): RouteResolution {
  const path = normalizePathname(pathname);

  // Unauthenticated or non-approved user: strictly lock out protected dashboards
  if (!user || user.status !== 'approved') {
    if (path === '/admin/register') {
      return {
        kind: 'auth',
        canonicalPath: '/admin/login',
        portal: 'admin',
        authMode: 'login',
        tab: 'dashboard',
        guardNotice: 'Public administrator registration is disabled. Only server-side owner provisioning can create Main Admin accounts.',
      };
    }

    if (path === '/register' || path === '/staff/register') {
      return {
        kind: 'auth',
        canonicalPath: '/register',
        portal: 'staff',
        authMode: 'register',
        tab: 'dashboard',
        guardNotice: null,
      };
    }

    if (path === '/reset-password') {
      return {
        kind: 'auth',
        canonicalPath: '/reset-password',
        portal: 'staff',
        authMode: 'reset-request',
        tab: 'dashboard',
        guardNotice: null,
      };
    }

    if (path === '/admin/login') {
      return {
        kind: 'auth',
        canonicalPath: '/admin/login',
        portal: 'admin',
        authMode: 'login',
        tab: 'dashboard',
        guardNotice: null,
      };
    }

    if (path === '/admin' || path.startsWith('/admin/')) {
      return {
        kind: 'auth',
        canonicalPath: '/admin/login',
        portal: 'admin',
        authMode: 'login',
        tab: 'dashboard',
        guardNotice: `Authentication required: sign in to the Admin Portal to access ${path}.`,
      };
    }

    if (path === '/staff' || path.startsWith('/staff/')) {
      if (path === '/staff/login') {
        return {
          kind: 'auth',
          canonicalPath: '/login',
          portal: 'staff',
          authMode: 'login',
          tab: 'dashboard',
          guardNotice: null,
        };
      }
      return {
        kind: 'auth',
        canonicalPath: '/login',
        portal: 'staff',
        authMode: 'login',
        tab: 'dashboard',
        guardNotice: `Authentication required: sign in with an approved Staff account to access ${path}.`,
      };
    }

    return {
      kind: 'auth',
      canonicalPath: path === '/pending-approval' ? '/pending-approval' : '/login',
      portal: 'staff',
      authMode: 'login',
      tab: 'dashboard',
      guardNotice: null,
    };
  }

  // Authenticated & approved Admin
  if (user.role === 'admin') {
    if (path === '/staff' || path.startsWith('/staff/')) {
      return {
        kind: 'admin',
        canonicalPath: '/admin/dashboard',
        portal: 'admin',
        authMode: 'login',
        tab: 'dashboard',
        guardNotice: `Role routing applied: Administrator accounts operate in the Admin Portal (redirected from ${path}).`,
      };
    }

    const segment = path.startsWith('/admin/') ? path.slice('/admin/'.length).split('/')[0] : '';
    const isAuthOrRoot =
      path === '/' ||
      path === '/login' ||
      path === '/register' ||
      path === '/reset-password' ||
      path === '/pending-approval' ||
      path === '/admin' ||
      path === '/admin/login' ||
      path === '/admin/register';

    if (isAuthOrRoot) {
      return {
        kind: 'admin',
        canonicalPath: '/admin/dashboard',
        portal: 'admin',
        authMode: 'login',
        tab: 'dashboard',
        guardNotice: null,
      };
    }

    const matchedTab = (ADMIN_TABS as readonly string[]).includes(segment) ? segment : 'dashboard';
    return {
      kind: 'admin',
      canonicalPath: `/admin/${matchedTab}`,
      portal: 'admin',
      authMode: 'login',
      tab: matchedTab,
      guardNotice:
        matchedTab !== segment
          ? `Unknown admin route ${path}; redirected to Admin Dashboard.`
          : null,
    };
  }

  // Authenticated & approved Staff
  if (path === '/admin' || path.startsWith('/admin/')) {
    return {
      kind: 'staff',
      canonicalPath: '/staff/dashboard',
      portal: 'staff',
      authMode: 'login',
      tab: 'dashboard',
      guardNotice: `Access denied: Administrator privileges are required for ${path}. Redirected to Staff Dashboard.`,
    };
  }

  const segment = path.startsWith('/staff/') ? path.slice('/staff/'.length).split('/')[0] : '';
  const isAuthOrRoot =
    path === '/' ||
    path === '/login' ||
    path === '/register' ||
    path === '/reset-password' ||
    path === '/pending-approval' ||
    path === '/staff' ||
    path === '/staff/login' ||
    path === '/staff/register';

  if (isAuthOrRoot) {
    return {
      kind: 'staff',
      canonicalPath: '/staff/dashboard',
      portal: 'staff',
      authMode: 'login',
      tab: 'dashboard',
      guardNotice: null,
    };
  }

  const matchedTab = (STAFF_TABS as readonly string[]).includes(segment) ? segment : 'dashboard';
  return {
    kind: 'staff',
    canonicalPath: `/staff/${matchedTab}`,
    portal: 'staff',
    authMode: 'login',
    tab: matchedTab,
    guardNotice:
      matchedTab !== segment
        ? `Unknown staff route ${path}; redirected to Staff Dashboard.`
        : null,
  };
}
