/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Package,
  PlusCircle,
  Receipt,
  Settings,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { AuthPortal } from './components/AuthPortal';
import { OfflineBanner } from './components/OfflineBanner';
import { PWAInstallButton } from './components/PWAInstallButton';
import { AdminDashboardView } from './components/admin/AdminDashboardView';
import { AdminExpensesView } from './components/admin/AdminExpensesView';
import { AdminNotificationsView } from './components/admin/AdminNotificationsView';
import { AdminOrdersView } from './components/admin/AdminOrdersView';
import { AdminProductsView } from './components/admin/AdminProductsView';
import { AdminReadyTextView } from './components/admin/AdminReadyTextView';
import { AdminReportsView } from './components/admin/AdminReportsView';
import { AdminSettingsView } from './components/admin/AdminSettingsView';
import { AdminStaffView } from './components/admin/AdminStaffView';
import { AdminStockView } from './components/admin/AdminStockView';
import { StaffDashboardView } from './components/staff/StaffDashboardView';
import { StaffOrdersView } from './components/staff/StaffOrdersView';
import { StaffPlaceOrderView } from './components/staff/StaffPlaceOrderView';
import { StaffProfileView } from './components/staff/StaffProfileView';
import { StaffReadyTextView } from './components/staff/StaffReadyTextView';
import {
  authApi,
  getStoredToken,
  notificationsApi,
  setStoredToken,
} from './utils/api';
import type { AccountStatus, NotificationItem, UserProfile } from './utils/domain';
import {
  buildAuthPath,
  buildTabPath,
  resolveAppRoute,
  type AuthModeType,
  type AuthPortalType,
} from './utils/routing';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [pathname, setPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const [guardBanner, setGuardBanner] = useState<string | null>(null);
  const [revokedStatus, setRevokedStatus] = useState<AccountStatus | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const navigate = useCallback((nextPath: string, replace = false) => {
    if (typeof window !== 'undefined' && window.location.pathname !== nextPath) {
      if (replace) {
        window.history.replaceState({}, '', nextPath);
      } else {
        window.history.pushState({}, '', nextPath);
      }
    }
    setPathname(nextPath);
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationsApi.list();
      setNotifications(res.notifications);
    } catch {
      // ignore if session invalidated
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
      setGuardBanner(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onAuthRevoked = (event: Event) => {
      const custom = event as CustomEvent<{
        status: number;
        accountStatus?: AccountStatus;
        message?: string;
      }>;
      setStoredToken(null);
      setUser(null);
      setNotifications([]);
      setRevokedStatus(custom.detail?.accountStatus ?? null);
      setGuardBanner(custom.detail?.message || 'Session expired or access revoked. Please sign in again.');
      navigate('/login', true);
    };
    window.addEventListener('avenor:auth-revoked', onAuthRevoked);
    return () => window.removeEventListener('avenor:auth-revoked', onAuthRevoked);
  }, [navigate]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    authApi
      .me()
      .then((res) => {
        setUser(res.user);
      })
      .catch(() => {
        setStoredToken(null);
        setUser(null);
      })
      .finally(() => setAuthChecking(false));
  }, []);

  // Real-time SSE notifications subscription when authenticated
  useEffect(() => {
    if (!user) return;
    loadNotifications();
    const token = getStoredToken();
    if (!token) return;

    const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = (event) => {
      try {
        const item = JSON.parse(event.data) as NotificationItem;
        if (item && item.id) {
          setNotifications((prev) =>
            prev.some((p) => p.id === item.id) ? prev : [item, ...prev]
          );
        }
      } catch {
        // ignore non-JSON messages
      }
    };
    return () => {
      es.close();
    };
  }, [user, loadNotifications]);

  const route = resolveAppRoute(pathname, user);
  const activeTab = route.tab;

  useEffect(() => {
    if (authChecking) return;
    if (typeof window !== 'undefined' && window.location.pathname !== route.canonicalPath) {
      window.history.replaceState({}, '', route.canonicalPath);
      setPathname(route.canonicalPath);
    }
    if (route.guardNotice) {
      setGuardBanner(route.guardNotice);
    }
  }, [authChecking, route.canonicalPath, route.guardNotice]);

  const handleAuthenticated = (loggedUser: UserProfile) => {
    setRevokedStatus(null);
    setGuardBanner(null);
    setUser(loggedUser);
    setMobileMenuOpen(false);
    navigate(buildTabPath(loggedUser.role, 'dashboard'));
  };

  const handleLogout = async () => {
    const prevRole = user?.role ?? 'staff';
    try {
      await authApi.logout();
    } catch {
      // always clear local session on logout
    }
    setStoredToken(null);
    setUser(null);
    setNotifications([]);
    setRevokedStatus(null);
    setGuardBanner(null);
    navigate(buildAuthPath(prevRole, 'login'));
  };

  const handleAuthRouteSync = useCallback(
    (portal: AuthPortalType, mode: AuthModeType) => {
      setGuardBanner(null);
      setRevokedStatus(null);
      navigate(buildAuthPath(portal, mode));
    },
    [navigate]
  );

  const handleMarkRead = async (id: string) => {
    await notificationsApi.markRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  if (authChecking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0D0D0F] text-[#FAF7F0]">
        <img
          src="/assets/aistudio/LOGO_5a702867.png"
          alt="AVENOR LEGACY"
          referrerPolicy="no-referrer"
          className="h-24 w-24 rounded-xl object-contain"
        />
        <p className="mt-4 text-xs tracking-[0.25em] text-[#C5A059] uppercase">
          Verifying Session...
        </p>
      </div>
    );
  }

  if (route.kind === 'auth' || !user || user.status !== 'approved') {
    return (
      <>
        <AuthPortal
          onAuthenticated={handleAuthenticated}
          initialPortal={route.portal}
          initialMode={route.authMode}
          guardNotice={guardBanner ?? route.guardNotice}
          externalBlockedStatus={revokedStatus}
          onRouteSync={handleAuthRouteSync}
        />
        <OfflineBanner />
      </>
    );
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const adminNav: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'orders', label: 'All Orders', icon: ClipboardList },
    { id: 'stock', label: 'Stock Management', icon: Boxes },
    { id: 'products', label: 'Product Management', icon: Package },
    { id: 'staff', label: 'Staff Management', icon: Users },
    { id: 'ready-text', label: 'Ready Text Management', icon: MessageSquareText },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const staffNav: NavItem[] = [
    { id: 'dashboard', label: 'My Dashboard', icon: LayoutDashboard, badge: unreadCount },
    { id: 'place-order', label: 'Place Order', icon: PlusCircle },
    { id: 'stock-checking', label: 'My Stock Checking', icon: Clock },
    { id: 'processing', label: 'My Processing', icon: Package },
    { id: 'completed', label: 'My Completed', icon: CheckCircle2 },
    { id: 'rejected', label: 'My Rejected', icon: XCircle },
    { id: 'history', label: 'My Order History', icon: History },
    { id: 'ready-text', label: 'Ready Text', icon: FileText },
    { id: 'profile', label: 'My Profile', icon: Settings },
  ];

  const navItems = user.role === 'admin' ? adminNav : staffNav;

  const selectTab = (id: string) => {
    setGuardBanner(null);
    setMobileMenuOpen(false);
    navigate(buildTabPath(user.role, id));
  };

  return (
    <div className="min-h-screen bg-[#FAF7F0] text-[#141416] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-68 lg:shrink-0 lg:flex-col lg:justify-between border-r border-[#222227] bg-[#0D0D0F] text-[#FAF7F0]">
        <div>
          <div className="flex items-center gap-3 border-b border-[#222227] px-5 py-5">
            <img
              src="/assets/aistudio/LOGO_5a702867.png"
              alt="AVENOR LEGACY logo"
              referrerPolicy="no-referrer"
              className="h-11 w-11 rounded-lg border border-[#C5A059]/30 object-cover"
            />
            <div className="min-w-0">
              <h1 className="font-display text-xl font-semibold tracking-tight text-[#FAF7F0] truncate">
                AVENOR LEGACY
              </h1>
              <p className="text-[10px] tracking-[0.2em] text-[#C5A059] uppercase">
                {user.role === 'admin' ? 'Admin Portal' : 'Staff Portal'}
              </p>
            </div>
          </div>

          <nav aria-label="Primary navigation" className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#1D1D22] text-[#FAF7F0] border border-[#C5A059]/40'
                      : 'text-[#B8B1A6] hover:bg-[#17171B] hover:text-[#FAF7F0]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#C5A059]' : 'text-[#8C857B]'}`} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-2 rounded bg-[#C5A059] px-1.5 py-0.5 font-mono-num text-[10px] font-semibold text-[#0D0D0F]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-[#222227] p-4 space-y-3">
          <div className="text-xs">
            <p className="font-medium text-[#FAF7F0] truncate">{user.fullName}</p>
            <p className="text-[11px] text-[#8E877C] truncate">{user.email}</p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <PWAInstallButton variant="dark" />
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sign out"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2C2C33] px-3 py-2 text-xs text-[#D6CFC3] hover:border-[#C5A059]/50 hover:text-white transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[#222227] bg-[#0D0D0F] px-3.5 py-3 text-[#FAF7F0] lg:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="/assets/aistudio/LOGO_5a702867.png"
            alt="AVENOR LEGACY logo"
            referrerPolicy="no-referrer"
            className="h-8 w-8 shrink-0 rounded object-cover"
          />
          <span className="font-display text-base font-semibold tracking-tight whitespace-nowrap">
            AVENOR LEGACY
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton variant="dark" />
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2C2C33] text-[#FAF7F0]"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Slide-Down Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-x-0 top-[61px] bottom-0 z-40 overflow-y-auto bg-[#0D0D0F] p-4 text-[#FAF7F0] lg:hidden">
          <nav aria-label="Mobile navigation" className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTab(item.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-medium ${
                    active
                      ? 'bg-[#1D1D22] text-[#FAF7F0] border border-[#C5A059]/40'
                      : 'text-[#B8B1A6]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-[#C5A059]" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="rounded bg-[#C5A059] px-2 py-0.5 font-mono-num text-xs font-semibold text-[#0D0D0F]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-6 border-t border-[#222227] pt-4 flex items-center justify-between">
            <div className="text-xs">
              <p className="font-medium text-[#FAF7F0]">{user.fullName}</p>
              <p className="text-[#8E877C]">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-[#B91C1C]/40 px-3.5 py-2 text-xs font-medium text-[#FCA5A5]"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8 pb-24 lg:pb-10">
        <div className="mx-auto max-w-7xl">
          {guardBanner && (
            <div
              role="alert"
              className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-[#B45309]/40 bg-[#FFFBEB] px-4 py-3 text-xs font-medium text-[#78350F]"
            >
              <span>{guardBanner}</span>
              <button
                type="button"
                onClick={() => setGuardBanner(null)}
                className="shrink-0 rounded border border-[#D97706]/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#78350F]"
              >
                Dismiss
              </button>
            </div>
          )}
          {user.role === 'admin' ? (
            <>
              {activeTab === 'dashboard' && <AdminDashboardView onNavigate={selectTab} />}
              {activeTab === 'orders' && <AdminOrdersView />}
              {activeTab === 'stock' && <AdminStockView />}
              {activeTab === 'products' && <AdminProductsView />}
              {activeTab === 'staff' && <AdminStaffView />}
              {activeTab === 'ready-text' && <AdminReadyTextView />}
              {activeTab === 'expenses' && <AdminExpensesView />}
              {activeTab === 'reports' && <AdminReportsView />}
              {activeTab === 'notifications' && (
                <AdminNotificationsView
                  notifications={notifications}
                  onMarkRead={handleMarkRead}
                  onMarkAllRead={handleMarkAllRead}
                />
              )}
              {activeTab === 'settings' && <AdminSettingsView user={user} />}
            </>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <StaffDashboardView
                  notifications={notifications}
                  onMarkRead={handleMarkRead}
                  onMarkAllRead={handleMarkAllRead}
                  onNavigate={selectTab}
                />
              )}
              {activeTab === 'place-order' && (
                <StaffPlaceOrderView
                  onOrderCreated={() => {
                    loadNotifications();
                  }}
                />
              )}
              {activeTab === 'stock-checking' && (
                <StaffOrdersView
                  title="My Stock Checking"
                  subtitle="Orders awaiting inventory verification by the Main Admin."
                  fixedStatus="Stock Checking"
                />
              )}
              {activeTab === 'processing' && (
                <StaffOrdersView
                  title="My Processing Orders"
                  subtitle="Orders with reserved stock currently in atelier finishing & dispatch."
                  fixedStatus="Processing"
                />
              )}
              {activeTab === 'completed' && (
                <StaffOrdersView
                  title="My Completed Orders"
                  subtitle="Delivered and settled AVENOR LEGACY client orders."
                  fixedStatus="Completed"
                />
              )}
              {activeTab === 'rejected' && (
                <StaffOrdersView
                  title="My Rejected Orders"
                  subtitle="Orders declined with administrator feedback."
                  fixedStatus="Rejected"
                />
              )}
              {activeTab === 'history' && (
                <StaffOrdersView
                  title="My Order History"
                  subtitle="Complete chronological ledger of orders submitted under your account."
                />
              )}
              {activeTab === 'ready-text' && <StaffReadyTextView />}
              {activeTab === 'profile' && <StaffProfileView user={user} onLogout={handleLogout} />}
            </>
          )}
        </div>
      </main>

      {/* Mobile Bottom Quick Nav for Staff */}
      {user.role === 'staff' && (
        <nav
          aria-label="Mobile quick navigation"
          className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-4 border-t border-[#E5DFD3] bg-white/95 backdrop-blur-md lg:hidden"
        >
          {[
            { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
            { id: 'place-order', label: 'Order', icon: PlusCircle },
            { id: 'history', label: 'History', icon: History },
            { id: 'ready-text', label: 'Templates', icon: FileText },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                  active ? 'text-[#0D0D0F]' : 'text-[#6B655B]'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-[#B89242]' : ''}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <OfflineBanner />
    </div>
  );
}
