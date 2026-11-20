import React, { useEffect, useState } from 'react';
import { ArrowRight, Bell, CheckCheck, PlusCircle } from 'lucide-react';
import { dashboardApi } from '../../utils/api';
import { formatBDT, type NotificationItem, type Order } from '../../utils/domain';
import { OrderStatusLabel } from '../StatusBadge';

interface Props {
  notifications: NotificationItem[];
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onNavigate: (tab: string) => void;
}

export const StaffDashboardView: React.FC<Props> = ({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
}) => {
  const [counts, setCounts] = useState({
    totalOrders: 0,
    newOrders: 0,
    stockChecking: 0,
    confirmed: 0,
    processing: 0,
    completed: 0,
    rejected: 0,
    onHold: 0,
    completedSales: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.staff();
      setCounts(res.counts);
      setRecentOrders(res.recentOrders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const unread = notifications.filter((n) => !n.isRead);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">My Dashboard</h2>
          <p className="mt-1 text-sm text-[#6B655B]">
            Your personal order pipeline, live status updates, and completed sales performance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('place-order')}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0D0D0F] px-4 py-2.5 text-xs font-medium text-[#FAF7F0] hover:bg-[#1E1E24] whitespace-nowrap"
        >
          <PlusCircle className="h-4 w-4 text-[#C5A059]" />
          <span>Place New Order</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">
          {error}
        </div>
      )}

      {/* Personal Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-4">
          <p className="text-[11px] font-medium text-[#6B655B]">My Total Orders</p>
          <p className="mt-1.5 font-mono-num text-2xl font-semibold text-[#0D0D0F]">{counts.totalOrders}</p>
        </div>
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-4">
          <p className="text-[11px] font-medium text-[#6B655B]">Stock Checking</p>
          <p className="mt-1.5 font-mono-num text-2xl font-semibold text-[#92400E]">{counts.stockChecking}</p>
        </div>
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-4">
          <p className="text-[11px] font-medium text-[#6B655B]">Processing</p>
          <p className="mt-1.5 font-mono-num text-2xl font-semibold text-[#0D0D0F]">{counts.processing}</p>
        </div>
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-4">
          <p className="text-[11px] font-medium text-[#6B655B]">Completed</p>
          <p className="mt-1.5 font-mono-num text-2xl font-semibold text-[#166534]">{counts.completed}</p>
        </div>
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-4">
          <p className="text-[11px] font-medium text-[#6B655B]">Rejected</p>
          <p className="mt-1.5 font-mono-num text-2xl font-semibold text-[#991B1B]">{counts.rejected}</p>
        </div>
        <div className="rounded-xl border border-[#C5A059]/60 bg-[#0D0D0F] p-4 text-[#FAF7F0]">
          <p className="text-[11px] font-medium text-[#C5A059]">My Completed Sales</p>
          <p className="mt-1.5 font-mono-num text-xl font-semibold">{formatBDT(counts.completedSales)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-[#E5DFD3] bg-white p-5 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#EFEAE0] pb-3">
            <h3 className="text-sm font-semibold text-[#0D0D0F]">My Recent Orders</h3>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#8A6820] hover:underline"
            >
              <span>Full History</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {loading ? (
            <div className="py-8 text-center text-xs text-[#6B655B]">Loading your orders...</div>
          ) : recentOrders.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#6B655B]">
              You have not submitted any orders yet.
            </div>
          ) : (
            <div className="mt-3 divide-y divide-[#F0EAE0]">
              {recentOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                  <div>
                    <p className="font-medium text-[#0D0D0F]">
                      <span className="font-mono-num text-[#8A6820]">{o.orderId}</span>
                      <span className="mx-1.5 text-[#C0B8AA]">·</span>
                      <span>{o.customerName}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#6B655B]">
                      {o.productCode} ({o.size}/{o.colour}) × {o.quantity} ·{' '}
                      <span className="font-mono-num">
                        {o.isUnlistedProduct && o.totalPrice === 0 ? 'Pending Price' : formatBDT(o.totalPrice)}
                      </span>
                    </p>
                  </div>
                  <OrderStatusLabel status={o.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#E5DFD3] bg-white p-5 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[#EFEAE0] pb-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#8A6820]" />
              <h3 className="text-sm font-semibold text-[#0D0D0F]">
                Order Notifications ({unread.length} unread)
              </h3>
            </div>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8A6820] hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Read All</span>
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#6B655B]">
              Status updates on your orders will appear here in real time.
            </div>
          ) : (
            <div className="mt-3 divide-y divide-[#F0EAE0] max-h-72 overflow-y-auto">
              {notifications.slice(0, 12).map((n) => (
                <div
                  key={n.id}
                  className={`py-2.5 text-xs ${n.isRead ? 'opacity-70' : 'font-medium'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[#0D0D0F]">{n.title}</p>
                    {!n.isRead && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(n.id)}
                        className="text-[11px] text-[#8A6820] hover:underline whitespace-nowrap"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] font-normal text-[#544F47]">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
