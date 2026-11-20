import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ordersApi } from '../../utils/api';
import { formatBDT, type Order, type OrderStatus } from '../../utils/domain';
import { OrderStatusLabel } from '../StatusBadge';

interface Props {
  title: string;
  subtitle: string;
  fixedStatus?: OrderStatus;
}

export const StaffOrdersView: React.FC<Props> = ({ title, subtitle, fixedStatus }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    ordersApi
      .list(fixedStatus ? { status: fixedStatus } : undefined)
      .then((res) => setOrders(res.orders))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your orders.'))
      .finally(() => setLoading(false));
  }, [fixedStatus]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.orderId.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.productCode.toLowerCase().includes(q) ||
        o.productName.toLowerCase().includes(q)
    );
  }, [orders, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">{title}</h2>
          <p className="mt-1 text-sm text-[#6B655B]">{subtitle}</p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8B8478]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order ID, client, code..."
            aria-label="Search my orders"
            className="w-full rounded-lg border border-[#D8CFC0] bg-white py-2 pl-8 pr-3 text-xs focus:border-[#B89242] focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-[#E5DFD3] bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#6B655B]">Loading your orders...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#6B655B]">
            No orders found in this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DFD3] bg-[#FAF7F0] text-[#6B655B]">
                  <th className="px-4 py-3 font-medium">Order ID</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Product &amp; Variant</th>
                  <th className="px-4 py-3 font-medium text-right">Qty</th>
                  <th className="px-4 py-3 font-medium text-right">Total (BDT)</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EAE0]">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-[#FAF7F0]/50">
                    <td className="px-4 py-3 align-top">
                      <p className="font-mono-num font-semibold text-[#0D0D0F]">{o.orderId}</p>
                      <p className="mt-0.5 text-[11px] text-[#8B8478]">
                        {new Date(o.createdAt).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium text-[#141416]">{o.customerName}</p>
                      <p className="font-mono-num text-[11px] text-[#6B655B]">{o.contactNumber}</p>
                      <p className="mt-0.5 max-w-xs text-[11px] text-[#6B655B]">{o.deliveryAddress}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium text-[#0D0D0F]">
                        <span className="font-mono-num text-[#8A6820]">{o.productCode}</span>
                        <span className="mx-1.5 text-[#C0B8AA]">·</span>
                        <span>{o.productName}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#6B655B]">
                        Size {o.size} · {o.colour}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top text-right font-mono-num font-medium">
                      {o.quantity}
                    </td>
                    <td className="px-4 py-3 align-top text-right font-mono-num font-semibold text-[#0D0D0F] whitespace-nowrap">
                      {o.isUnlistedProduct && o.totalPrice === 0
                        ? 'Pending Price'
                        : formatBDT(o.totalPrice)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <OrderStatusLabel status={o.status} />
                      {o.rejectionReason && (
                        <p className="mt-1 max-w-xs text-[11px] text-[#991B1B]">
                          Reason: {o.rejectionReason}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
