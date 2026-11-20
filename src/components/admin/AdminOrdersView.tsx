import React, { useEffect, useState } from 'react';
import { Filter, PlusCircle, X } from 'lucide-react';
import { ordersApi, productsApi, staffApi } from '../../utils/api';
import {
  formatBDT,
  ORDER_STATUSES,
  type Order,
  type OrderStatus,
  type UserProfile,
} from '../../utils/domain';
import { OrderStatusLabel } from '../StatusBadge';

export const AdminOrdersView: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filters
  const [staffId, setStaffId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [productCodeFilter, setProductCodeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Active modals
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Order | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [createProdTarget, setCreateProdTarget] = useState<Order | null>(null);
  const [newProdForm, setNewProdForm] = useState({
    productCode: '',
    productName: '',
    category: 'Bespoke Menswear',
    description: '',
    productCost: '',
    sellingPrice: '',
    initialStockQty: '0',
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordRes, stfRes] = await Promise.all([
        ordersApi.list({
          staffId: staffId || undefined,
          status: statusFilter || undefined,
          productCode: productCodeFilter || undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
        staffApi.list(),
      ]);
      setOrders(ordRes.orders);
      setStaffList(stfRes.staff);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [staffId, statusFilter, fromDate, toDate]);

  const handleStatusChange = async (order: Order, nextStatus: OrderStatus) => {
    if (nextStatus === 'Rejected') {
      setRejectTarget(order);
      setRejectionReason('');
      setActionError(null);
      return;
    }
    setBusyId(order.id);
    setActionError(null);
    try {
      const res = await ordersApi.updateStatus(order.id, nextStatus);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? res.order : o)));
      if (selectedOrder?.id === order.id) setSelectedOrder(res.order);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Order transition failed.');
    } finally {
      setBusyId(null);
    }
  };

  const submitRejection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    setActionError(null);
    try {
      const res = await ordersApi.updateStatus(rejectTarget.id, 'Rejected', rejectionReason);
      setOrders((prev) => prev.map((o) => (o.id === rejectTarget.id ? res.order : o)));
      if (selectedOrder?.id === rejectTarget.id) setSelectedOrder(res.order);
      setRejectTarget(null);
      setRejectionReason('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject order.');
    } finally {
      setBusyId(null);
    }
  };

  const openCreateFromOrder = (order: Order) => {
    setCreateProdTarget(order);
    setNewProdForm({
      productCode: order.productCode,
      productName: order.productName,
      category: 'Bespoke Menswear',
      description: `Created from order ${order.orderId}`,
      productCost: '',
      sellingPrice: '',
      initialStockQty: '0',
    });
    setActionError(null);
  };

  const submitCreateProductFromOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createProdTarget) return;
    setBusyId(createProdTarget.id);
    setActionError(null);
    try {
      const res = await productsApi.createFromOrder(createProdTarget.id, {
        productCode: newProdForm.productCode,
        productName: newProdForm.productName,
        category: newProdForm.category,
        description: newProdForm.description,
        productCost: Number(newProdForm.productCost),
        sellingPrice: Number(newProdForm.sellingPrice),
        initialStockQty: Number(newProdForm.initialStockQty || 0),
      });
      setOrders((prev) => prev.map((o) => (o.id === createProdTarget.id ? res.order : o)));
      if (selectedOrder?.id === createProdTarget.id) setSelectedOrder(res.order);
      setCreateProdTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create product from order.');
    } finally {
      setBusyId(null);
    }
  };

  const getNextActions = (status: OrderStatus): OrderStatus[] => {
    switch (status) {
      case 'New Order':
        return ['Stock Checking', 'Confirmed', 'On Hold', 'Rejected'];
      case 'Stock Checking':
        return ['Confirmed', 'On Hold', 'Rejected'];
      case 'On Hold':
        return ['Stock Checking', 'Confirmed', 'Processing', 'Rejected'];
      case 'Confirmed':
        return ['Processing', 'On Hold', 'Rejected'];
      case 'Processing':
        return ['Completed', 'On Hold', 'Rejected'];
      default:
        return [];
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">All Orders</h2>
        <p className="mt-1 text-sm text-[#6B655B]">
          Verify inventory, reserve stock atomically on confirmation, and manage fulfillment across staff.
        </p>
      </div>

      {/* Filters */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          loadData();
        }}
        className="grid grid-cols-1 gap-3 rounded-xl border border-[#E5DFD3] bg-white p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <div>
          <label htmlFor="flt-staff" className="block text-[11px] font-medium text-[#6B655B]">
            Staff Advisor
          </label>
          <select
            id="flt-staff"
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-2.5 py-2 text-xs text-[#141416]"
          >
            <option value="">All Staff</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="flt-status" className="block text-[11px] font-medium text-[#6B655B]">
            Order Status
          </label>
          <select
            id="flt-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-2.5 py-2 text-xs text-[#141416]"
          >
            <option value="">All Statuses</option>
            {ORDER_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="flt-code" className="block text-[11px] font-medium text-[#6B655B]">
            Product Code
          </label>
          <input
            id="flt-code"
            type="text"
            value={productCodeFilter}
            onChange={(e) => setProductCodeFilter(e.target.value)}
            placeholder="Search code..."
            className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-2.5 py-2 font-mono text-xs uppercase text-[#141416]"
          />
        </div>

        <div>
          <label htmlFor="flt-from" className="block text-[11px] font-medium text-[#6B655B]">
            From Date
          </label>
          <input
            id="flt-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-2.5 py-2 text-xs text-[#141416]"
          />
        </div>

        <div>
          <label htmlFor="flt-to" className="block text-[11px] font-medium text-[#6B655B]">
            To Date
          </label>
          <input
            id="flt-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-2.5 py-2 text-xs text-[#141416]"
          />
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0D0D0F] px-3 py-2 text-xs font-medium text-[#FAF7F0] hover:bg-[#1E1E24]"
          >
            <Filter className="h-3.5 w-3.5 text-[#C5A059]" />
            <span>Apply</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStaffId('');
              setStatusFilter('');
              setProductCodeFilter('');
              setFromDate('');
              setToDate('');
            }}
            className="rounded-lg border border-[#D8CFC0] px-3 py-2 text-xs text-[#4A463F] hover:bg-[#FAF7F0]"
          >
            Reset
          </button>
        </div>
      </form>

      {actionError && (
        <div role="alert" className="rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-xs font-medium text-[#991B1B]">
          {actionError}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-4 text-sm text-[#991B1B]">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-[#E5DFD3] bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#6B655B]">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#6B655B]">
            No orders match the active filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DFD3] bg-[#FAF7F0] text-[#6B655B]">
                  <th className="px-4 py-3 font-medium">Order ID</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Product &amp; Variant</th>
                  <th className="px-4 py-3 font-medium">Staff</th>
                  <th className="px-4 py-3 font-medium text-right">Qty</th>
                  <th className="px-4 py-3 font-medium text-right">Total (BDT)</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Workflow Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EAE0]">
                {orders.map((order) => {
                  const nextActions = getNextActions(order.status);
                  return (
                    <tr key={order.id} className="hover:bg-[#FAF7F0]/50">
                      <td className="px-4 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(order)}
                          className="font-mono-num font-semibold text-[#0D0D0F] underline decoration-[#C5A059]/60 underline-offset-2 hover:text-[#8A6820]"
                        >
                          {order.orderId}
                        </button>
                        <div className="mt-0.5 text-[11px] text-[#8B8478]">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-[#141416]">{order.customerName}</p>
                        <p className="font-mono-num text-[11px] text-[#6B655B]">{order.contactNumber}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-[#0D0D0F]">
                          <span className="font-mono-num text-[#8A6820]">{order.productCode}</span>
                          <span className="mx-1.5 text-[#C0B8AA]">·</span>
                          <span>{order.productName}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#6B655B]">
                          Size {order.size} · {order.colour}
                          {order.stockReserved ? ' · Stock Reserved' : ''}
                        </p>
                        {order.isUnlistedProduct && (
                          <button
                            type="button"
                            onClick={() => openCreateFromOrder(order)}
                            className="mt-1.5 inline-flex items-center gap-1 rounded border border-[#C5A059]/60 bg-[#FAF7F0] px-2 py-0.5 text-[11px] font-medium text-[#8A6820] hover:bg-[#F3ECE0]"
                          >
                            <PlusCircle className="h-3 w-3" />
                            <span>Create Product in Catalog</span>
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-[#3A3731] whitespace-nowrap">
                        {order.staffName}
                      </td>
                      <td className="px-4 py-3 align-top text-right font-mono-num font-medium">
                        {order.quantity}
                      </td>
                      <td className="px-4 py-3 align-top text-right font-mono-num font-semibold text-[#0D0D0F] whitespace-nowrap">
                        {order.isUnlistedProduct && order.totalPrice === 0
                          ? 'Pending Price'
                          : formatBDT(order.totalPrice)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <OrderStatusLabel status={order.status} />
                        {order.rejectionReason && (
                          <p className="mt-1 max-w-[180px] text-[11px] text-[#991B1B]">
                            {order.rejectionReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {nextActions.map((st) => (
                            <button
                              key={st}
                              type="button"
                              disabled={busyId === order.id}
                              onClick={() => handleStatusChange(order, st)}
                              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap disabled:opacity-50 ${
                                st === 'Confirmed' || st === 'Completed'
                                  ? 'bg-[#0D0D0F] text-[#FAF7F0] hover:bg-[#232329]'
                                  : st === 'Rejected'
                                    ? 'border border-[#B91C1C]/30 text-[#991B1B] hover:bg-[#FEF2F2]'
                                    : 'border border-[#D8CFC0] text-[#2D2A26] hover:bg-[#FAF7F0]'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl border border-[#E5DFD3] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#EFEAE0] pb-4">
              <div>
                <p className="font-mono-num text-xs font-medium text-[#8A6820]">{selectedOrder.orderId}</p>
                <h3 className="font-display text-2xl font-semibold text-[#0D0D0F]">Order Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                aria-label="Close order details"
                className="rounded-lg border border-[#E5DFD3] p-1.5 text-[#4A463F] hover:bg-[#FAF7F0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-[#6B655B]">Customer</dt>
                <dd className="mt-0.5 font-medium text-[#0D0D0F]">{selectedOrder.customerName}</dd>
              </div>
              <div>
                <dt className="text-[#6B655B]">Contact</dt>
                <dd className="mt-0.5 font-mono-num font-medium text-[#0D0D0F]">{selectedOrder.contactNumber}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[#6B655B]">Delivery Address</dt>
                <dd className="mt-0.5 text-[#141416]">{selectedOrder.deliveryAddress}</dd>
              </div>
              <div>
                <dt className="text-[#6B655B]">Product</dt>
                <dd className="mt-0.5 font-medium text-[#0D0D0F]">
                  {selectedOrder.productCode} · {selectedOrder.productName}
                </dd>
              </div>
              <div>
                <dt className="text-[#6B655B]">Variant &amp; Quantity</dt>
                <dd className="mt-0.5 font-medium text-[#0D0D0F]">
                  {selectedOrder.size} / {selectedOrder.colour} × {selectedOrder.quantity}
                </dd>
              </div>
              <div>
                <dt className="text-[#6B655B]">Unit Price Snapshot</dt>
                <dd className="mt-0.5 font-mono-num font-medium text-[#0D0D0F]">{formatBDT(selectedOrder.unitPriceSnapshot)}</dd>
              </div>
              <div>
                <dt className="text-[#6B655B]">Total Order Value</dt>
                <dd className="mt-0.5 font-mono-num font-semibold text-[#0D0D0F]">{formatBDT(selectedOrder.totalPrice)}</dd>
              </div>
              {selectedOrder.note && (
                <div className="col-span-2">
                  <dt className="text-[#6B655B]">Advisor Note</dt>
                  <dd className="mt-0.5 text-[#2D2A26]">{selectedOrder.note}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}

      {/* Reject Order Reason Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
          <form onSubmit={submitRejection} className="w-full max-w-md rounded-xl border border-[#E5DFD3] bg-white p-6 shadow-2xl">
            <h3 className="font-display text-2xl font-semibold text-[#0D0D0F]">
              Reject Order {rejectTarget.orderId}
            </h3>
            <p className="mt-1 text-xs text-[#6B655B]">
              A rejection reason is mandatory and will be sent to {rejectTarget.staffName}. Any reserved stock will be released automatically.
            </p>
            <div className="mt-4">
              <label htmlFor="reject-reason" className="block text-xs font-medium text-[#3A3731]">
                Rejection Reason
              </label>
              <textarea
                id="reject-reason"
                required
                minLength={3}
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Requested size L in Obsidian is out of atelier stock."
                className="mt-1.5 w-full rounded-lg border border-[#D8CFC0] p-3 text-sm text-[#141416] focus:border-[#B89242] focus:outline-none"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="rounded-lg border border-[#D8CFC0] px-4 py-2 text-xs font-medium text-[#3A3731]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyId === rejectTarget.id}
                className="rounded-lg bg-[#991B1B] px-4 py-2 text-xs font-medium text-white hover:bg-[#7F1D1D]"
              >
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Product From Order Modal */}
      {createProdTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
          <form onSubmit={submitCreateProductFromOrder} className="w-full max-w-lg rounded-xl border border-[#E5DFD3] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-2xl font-semibold text-[#0D0D0F]">
                  Register Product from Order
                </h3>
                <p className="mt-1 text-xs text-[#6B655B]">
                  Newly registered products default to 0 stock unless verified quantity is entered.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateProdTarget(null)}
                aria-label="Close modal"
                className="rounded border border-[#E5DFD3] p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#3A3731]">Product Code</label>
                <input
                  type="text"
                  required
                  value={newProdForm.productCode}
                  onChange={(e) => setNewProdForm((f) => ({ ...f, productCode: e.target.value.toUpperCase() }))}
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 font-mono text-xs uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#3A3731]">Category</label>
                <input
                  type="text"
                  required
                  value={newProdForm.category}
                  onChange={(e) => setNewProdForm((f) => ({ ...f, category: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[#3A3731]">Product Name</label>
                <input
                  type="text"
                  required
                  value={newProdForm.productName}
                  onChange={(e) => setNewProdForm((f) => ({ ...f, productName: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#3A3731]">Product Cost (BDT)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={newProdForm.productCost}
                  onChange={(e) => setNewProdForm((f) => ({ ...f, productCost: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 font-mono-num text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#3A3731]">Selling Price (BDT)</label>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  required
                  value={newProdForm.sellingPrice}
                  onChange={(e) => setNewProdForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 font-mono-num text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[#3A3731]">
                  Verified Initial Stock ({createProdTarget.size} / {createProdTarget.colour})
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={newProdForm.initialStockQty}
                  onChange={(e) => setNewProdForm((f) => ({ ...f, initialStockQty: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 font-mono-num text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateProdTarget(null)}
                className="rounded-lg border border-[#D8CFC0] px-4 py-2 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyId === createProdTarget.id}
                className="rounded-lg bg-[#0D0D0F] px-4 py-2 text-xs font-medium text-[#FAF7F0]"
              >
                Save &amp; Link Order
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
