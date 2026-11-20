import React, { useEffect, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { dashboardApi } from '../../utils/api';
import { formatBDT, type AdminDashboardMetrics, type Order, type StockVariant } from '../../utils/domain';
import { OrderStatusLabel, StockStatusLabel } from '../StatusBadge';

interface Props {
  onNavigate: (tab: string) => void;
}

export const AdminDashboardView: React.FC<Props> = ({ onNavigate }) => {
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [lowStockVariants, setLowStockVariants] = useState<StockVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.admin();
      setMetrics(res.metrics);
      setRecentOrders(res.recentOrders);
      setLowStockVariants(res.lowStockVariants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-xl border border-[#E5DFD3] bg-white" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[#B91C1C]/30 bg-[#FEF2F2] p-5 text-sm text-[#991B1B]">
        <p className="font-medium">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-3 rounded-lg bg-[#0D0D0F] px-3.5 py-2 text-xs font-medium text-[#FAF7F0]"
        >
          Retry
        </button>
      </div>
    );
  }

  const m = metrics!;
  const kpis: { label: string; value: string | number; note: string; target?: string }[] = [
    { label: 'Total Orders', value: m.totalOrders, note: 'All-time recorded', target: 'orders' },
    { label: 'New Orders', value: m.newOrders, note: 'Awaiting review', target: 'orders' },
    { label: 'Stock Checking Orders', value: m.stockCheckingOrders, note: 'Verifying inventory', target: 'orders' },
    { label: 'Processing Orders', value: m.processingOrders, note: 'In active fulfillment', target: 'orders' },
    { label: 'Processing Value (BDT)', value: formatBDT(m.processingValue), note: 'Active pipeline value', target: 'reports' },
    { label: 'Completed Orders', value: m.completedOrders, note: 'Delivered & settled', target: 'orders' },
    { label: 'Rejected Orders', value: m.rejectedOrders, note: 'Declined / stock released', target: 'orders' },
    { label: 'Total Completed Sales', value: formatBDT(m.totalCompletedSales), note: 'Gross completed revenue', target: 'reports' },
    { label: 'Pending Staff Approvals', value: m.pendingStaffApprovals, note: 'Awaiting access review', target: 'staff' },
    { label: 'Low Stock Products', value: m.lowStockProducts, note: 'Requires replenishment', target: 'stock' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">
            Executive Overview
          </h2>
          <p className="mt-1 text-sm text-[#6B655B]">
            Live operational figures separated strictly between active processing value and completed sales revenue.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-[#D8CFC0] bg-white px-3.5 py-2 text-xs font-medium text-[#141416] hover:border-[#B89242] transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Live Stats</span>
        </button>
      </div>

      {/* 10 Requested KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => item.target && onNavigate(item.target)}
            className="rounded-xl border border-[#E5DFD3] bg-white p-4 text-left transition-colors hover:border-[#C5A059]/70"
          >
            <p className="text-xs font-medium text-[#6B655B]">{item.label}</p>
            <p className="mt-2 font-mono-num text-2xl font-semibold text-[#0D0D0F]">
              {item.value}
            </p>
            <p className="mt-1 text-[11px] text-[#8B8478]">{item.note}</p>
          </button>
        ))}
      </div>

      {/* Action Queues */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-[#E5DFD3] bg-white p-5 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#EFEAE0] pb-3.5">
            <div>
              <h3 className="text-base font-semibold text-[#0D0D0F]">Recent Orders</h3>
              <p className="text-xs text-[#6B655B]">Latest submissions across all staff advisors</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8A6820] hover:underline whitespace-nowrap"
            >
              <span>Manage All Orders</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {recentOrders.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#6B655B]">
              No orders have been submitted yet.
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#EFEAE0] text-[#6B655B]">
                    <th className="py-2.5 pr-3 font-medium">Order ID</th>
                    <th className="py-2.5 pr-3 font-medium">Product</th>
                    <th className="py-2.5 pr-3 font-medium">Staff</th>
                    <th className="py-2.5 pr-3 font-medium text-right">Total</th>
                    <th className="py-2.5 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4EFE6]">
                  {recentOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-[#FAF7F0]/60">
                      <td className="py-2.5 pr-3 font-mono-num font-medium text-[#0D0D0F] whitespace-nowrap">
                        {o.orderId}
                      </td>
                      <td className="py-2.5 pr-3 text-[#2D2A26]">
                        <span className="font-mono-num text-[#8A6820]">{o.productCode}</span>
                        <span className="mx-1.5 text-[#C0B8AA]">·</span>
                        <span>{o.size}/{o.colour} × {o.quantity}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-[#4A463F] whitespace-nowrap">{o.staffName}</td>
                      <td className="py-2.5 pr-3 font-mono-num text-right font-medium text-[#0D0D0F] whitespace-nowrap">
                        {o.isUnlistedProduct && o.totalPrice === 0 ? 'Unpriced' : formatBDT(o.totalPrice)}
                      </td>
                      <td className="py-2.5 text-right">
                        <OrderStatusLabel status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#E5DFD3] bg-white p-5 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[#EFEAE0] pb-3.5">
            <div>
              <h3 className="text-base font-semibold text-[#0D0D0F]">Stock Watchlist</h3>
              <p className="text-xs text-[#6B655B]">Low stock &amp; unavailable product variants</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('stock')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8A6820] hover:underline whitespace-nowrap"
            >
              <span>Open Stock Ledger</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {lowStockVariants.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#6B655B]">
              All tracked product variants are currently well stocked, or no variants added yet.
            </div>
          ) : (
            <div className="mt-3 divide-y divide-[#F4EFE6]">
              {lowStockVariants.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                  <div>
                    <p className="font-medium text-[#0D0D0F]">
                      <span className="font-mono-num text-[#8A6820]">{v.productCode}</span>
                      <span className="mx-1.5 text-[#C0B8AA]">·</span>
                      <span>{v.size} / {v.colour}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#6B655B] font-mono-num">
                      Available: {v.availableQty} · Reserved: {v.reservedQty} · Total: {v.totalQty}
                    </p>
                  </div>
                  <StockStatusLabel status={v.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
