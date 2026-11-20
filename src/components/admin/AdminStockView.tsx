import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Minus, Plus, Search } from 'lucide-react';
import { productsApi, stockApi } from '../../utils/api';
import type { Product, StockMovement, StockStatus, StockVariant } from '../../utils/domain';
import { StockStatusLabel } from '../StatusBadge';

export const AdminStockView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<StockVariant[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [searchCode, setSearchCode] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | StockStatus>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Adjust form
  const [productId, setProductId] = useState('');
  const [size, setSize] = useState('M');
  const [colour, setColour] = useState('Obsidian');
  const [action, setAction] = useState<'add' | 'reduce'>('add');
  const [quantity, setQuantity] = useState('1');
  const [threshold, setThreshold] = useState('5');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodRes, stkRes] = await Promise.all([productsApi.list(), stockApi.list()]);
      setProducts(prodRes.products);
      setVariants(stkRes.variants);
      setMovements(stkRes.movements);
      if (!productId && prodRes.products.length > 0) {
        const firstProd = prodRes.products[0];
        setProductId(firstProd.id);
        const firstVar = firstProd.variants?.[0];
        if (firstVar) {
          setSize(firstVar.size);
          setColour(firstVar.colour);
          setThreshold(String(firstVar.lowStockThreshold));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stock data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleProductChange = (nextProductId: string) => {
    setProductId(nextProductId);
    const prod = products.find((p) => p.id === nextProductId);
    const firstVar = prod?.variants?.[0];
    if (firstVar) {
      setSize(firstVar.size);
      setColour(firstVar.colour);
      setThreshold(String(firstVar.lowStockThreshold));
    }
  };

  const selectVariantForAdjust = (v: StockVariant) => {
    setProductId(v.productId);
    setSize(v.size);
    setColour(v.colour);
    setThreshold(String(v.lowStockThreshold));
    setFeedback(null);
  };

  const lowStockCount = useMemo(
    () => variants.filter((v) => v.status === 'Low Stock').length,
    [variants]
  );
  const outOfStockCount = useMemo(
    () => variants.filter((v) => v.status === 'Not Available').length,
    [variants]
  );

  const codeMatchedVariants = useMemo(() => {
    const q = searchCode.trim().toUpperCase();
    if (!q) return variants;
    return variants.filter(
      (v) =>
        v.productCode.toUpperCase().includes(q) ||
        (v.productName || '').toUpperCase().includes(q)
    );
  }, [variants, searchCode]);

  const filteredVariants = useMemo(() => {
    if (statusFilter === 'All') return codeMatchedVariants;
    return codeMatchedVariants.filter((v) => v.status === statusFilter);
  }, [codeMatchedVariants, statusFilter]);

  const filteredMovements = useMemo(() => {
    const q = searchCode.trim().toUpperCase();
    if (!q) return movements;
    return movements.filter((m) => m.productCode.toUpperCase().includes(q));
  }, [movements, searchCode]);

  const availabilitySummary = useMemo(() => {
    const totalAvail = codeMatchedVariants.reduce((sum, v) => sum + v.availableQty, 0);
    const totalRes = codeMatchedVariants.reduce((sum, v) => sum + v.reservedQty, 0);
    const totalPhys = codeMatchedVariants.reduce((sum, v) => sum + v.totalQty, 0);
    return {
      variantCount: codeMatchedVariants.length,
      totalAvail,
      totalRes,
      totalPhys,
    };
  }, [codeMatchedVariants]);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      await stockApi.adjust({
        productId,
        size,
        colour,
        action,
        quantity: Number(quantity),
        lowStockThreshold: Number(threshold),
        note,
      });
      setFeedback({
        type: 'ok',
        text: `Stock ${action === 'add' ? 'added' : 'reduced'} successfully.`,
      });
      setNote('');
      await load();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Stock update failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">Stock Management</h2>
        <p className="mt-1 text-sm text-[#6B655B]">
          Track Available, Reserved, and Total units by Product Code, Size, and Colour. Negative stock is strictly prevented.
        </p>
      </div>

      {/* Low Stock & Out-of-Stock Alert Summary */}
      {(lowStockCount > 0 || outOfStockCount > 0) && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#B45309]/35 bg-[#FFFBEB] px-4 py-3 text-xs text-[#78350F]"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#B45309]" />
            <span>
              <strong>Inventory Alerts:</strong> {lowStockCount} variant(s) at Low Stock · {outOfStockCount} variant(s) Not Available.
            </span>
          </div>
          <div className="flex items-center gap-2">
            {lowStockCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('Low Stock')}
                className="rounded border border-[#B45309]/40 bg-white px-2.5 py-1 font-medium text-[#92400E] hover:bg-[#FEF3C7]"
              >
                View Low Stock ({lowStockCount})
              </button>
            )}
            {outOfStockCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('Not Available')}
                className="rounded border border-[#B91C1C]/30 bg-white px-2.5 py-1 font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
              >
                View Out of Stock ({outOfStockCount})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Manual Stock Adjustment Panel */}
      <form
        onSubmit={handleAdjust}
        className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-4"
      >
        <h3 className="text-sm font-semibold text-[#0D0D0F]">Manual Stock Entry / Adjustment</h3>
        {feedback && (
          <div
            role={feedback.type === 'err' ? 'alert' : 'status'}
            className={`rounded-lg border p-3 text-xs font-medium ${
              feedback.type === 'err'
                ? 'border-[#B91C1C]/30 bg-[#FEF2F2] text-[#991B1B]'
                : 'border-[#15803D]/30 bg-[#F0FDF4] text-[#166534]'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label htmlFor="stk-prod" className="block text-xs font-medium text-[#3A3731]">
              Product
            </label>
            <select
              id="stk-prod"
              required
              value={productId}
              onChange={(e) => handleProductChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3 py-2 text-xs text-[#141416]"
            >
              <option value="">Select product...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.productCode} — {p.productName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="stk-size" className="block text-xs font-medium text-[#3A3731]">
              Size
            </label>
            <input
              id="stk-size"
              type="text"
              required
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="S, M, L, XL, 42"
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3 py-2 text-xs"
            />
          </div>

          <div>
            <label htmlFor="stk-colour" className="block text-xs font-medium text-[#3A3731]">
              Colour
            </label>
            <input
              id="stk-colour"
              type="text"
              required
              value={colour}
              onChange={(e) => setColour(e.target.value)}
              placeholder="Obsidian, Ivory"
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3 py-2 text-xs"
            />
          </div>

          <div>
            <label htmlFor="stk-qty" className="block text-xs font-medium text-[#3A3731]">
              Quantity
            </label>
            <input
              id="stk-qty"
              type="number"
              min={1}
              step={1}
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3 py-2 font-mono-num text-xs"
            />
          </div>

          <div>
            <label htmlFor="stk-thresh" className="block text-xs font-medium text-[#3A3731]">
              Low Stock Threshold
            </label>
            <input
              id="stk-thresh"
              type="number"
              min={1}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3 py-2 font-mono-num text-xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="inline-flex rounded-lg border border-[#D8CFC0] bg-[#FAF7F0] p-0.5">
              <button
                type="button"
                onClick={() => setAction('add')}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  action === 'add' ? 'bg-[#0D0D0F] text-[#FAF7F0]' : 'text-[#4A463F]'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Stock</span>
              </button>
              <button
                type="button"
                onClick={() => setAction('reduce')}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  action === 'reduce' ? 'bg-[#991B1B] text-white' : 'text-[#4A463F]'
                }`}
              >
                <Minus className="h-3.5 w-3.5" />
                <span>Reduce Stock</span>
              </button>
            </div>

            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional movement note (e.g., Restock batch #14)"
              aria-label="Movement note"
              className="min-w-[220px] flex-1 rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3 py-1.5 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !productId}
            className="rounded-lg bg-[#0D0D0F] px-5 py-2 text-xs font-medium text-[#FAF7F0] hover:bg-[#1E1E24] disabled:opacity-50"
          >
            {submitting ? 'Updating...' : 'Apply Stock Adjustment'}
          </button>
        </div>
      </form>

      {/* Search, Availability Checker & Variant Inventory Table */}
      <div className="rounded-xl border border-[#E5DFD3] bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEAE0] px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold text-[#0D0D0F]">Availability Check &amp; Inventory by Variant</h3>
            <p className="font-mono-num text-[11px] text-[#6B655B]">
              Matching Variants: {availabilitySummary.variantCount} · Available: {availabilitySummary.totalAvail} · Reserved: {availabilitySummary.totalRes} · Total: {availabilitySummary.totalPhys}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[#E5DFD3] bg-[#FAF7F0] p-0.5 text-[11px]">
              {(['All', 'Available', 'Low Stock', 'Not Available'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === st ? 'bg-[#0D0D0F] text-[#FAF7F0]' : 'text-[#544F47]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8B8478]" />
              <input
                type="text"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                placeholder="Search by Product Code..."
                aria-label="Search inventory by Product Code"
                className="w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 py-1.5 pl-8 pr-3 text-xs uppercase text-[#141416] focus:border-[#B89242] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {error && <div className="p-4 text-xs text-[#991B1B]">{error}</div>}

        {loading ? (
          <div className="p-8 text-center text-xs text-[#6B655B]">Loading inventory...</div>
        ) : filteredVariants.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6B655B]">
            No stock variants match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DFD3] bg-[#FAF7F0] text-[#6B655B]">
                  <th className="px-4 py-2.5 font-medium">Product Code</th>
                  <th className="px-4 py-2.5 font-medium">Product Name</th>
                  <th className="px-4 py-2.5 font-medium">Size</th>
                  <th className="px-4 py-2.5 font-medium">Colour</th>
                  <th className="px-4 py-2.5 font-medium text-right">Available</th>
                  <th className="px-4 py-2.5 font-medium text-right">Reserved</th>
                  <th className="px-4 py-2.5 font-medium text-right">Total</th>
                  <th className="px-4 py-2.5 font-medium text-right">Indicator</th>
                  <th className="px-4 py-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EAE0]">
                {filteredVariants.map((v) => (
                  <tr key={v.id} className="hover:bg-[#FAF7F0]/50">
                    <td className="px-4 py-2.5 font-mono-num font-semibold text-[#8A6820]">
                      {v.productCode}
                    </td>
                    <td className="px-4 py-2.5 text-[#141416]">{v.productName || '—'}</td>
                    <td className="px-4 py-2.5 font-medium">{v.size}</td>
                    <td className="px-4 py-2.5">{v.colour}</td>
                    <td className="px-4 py-2.5 text-right font-mono-num font-semibold text-[#0D0D0F]">
                      {v.availableQty}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-num text-[#6B655B]">
                      {v.reservedQty}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-num font-medium">
                      {v.totalQty}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <StockStatusLabel status={v.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => selectVariantForAdjust(v)}
                        className="rounded border border-[#D8CFC0] px-2.5 py-1 text-[11px] font-medium text-[#3A3731] hover:bg-[#FAF7F0]"
                      >
                        Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock Movement History */}
      <div className="rounded-xl border border-[#E5DFD3] bg-white overflow-hidden">
        <div className="border-b border-[#EFEAE0] px-5 py-3.5">
          <h3 className="text-sm font-semibold text-[#0D0D0F]">
            Stock Movement Audit Ledger {searchCode.trim() ? `(Filtered: ${searchCode.trim().toUpperCase()})` : ''}
          </h3>
          <p className="text-xs text-[#6B655B]">Complete chronological record of additions, reductions, reservations, and releases.</p>
        </div>

        {filteredMovements.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#6B655B]">No stock movements recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DFD3] bg-[#FAF7F0] text-[#6B655B]">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Product &amp; Variant</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium text-right">Delta</th>
                  <th className="px-4 py-2.5 font-medium text-right">Total (Prev → New)</th>
                  <th className="px-4 py-2.5 font-medium">Admin / Actor</th>
                  <th className="px-4 py-2.5 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EAE0]">
                {filteredMovements.slice(0, 50).map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 font-mono-num text-[11px] text-[#6B655B] whitespace-nowrap">
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono-num font-medium text-[#8A6820]">{m.productCode}</span>
                      <span className="mx-1.5 text-[#C0B8AA]">·</span>
                      <span>{m.size}/{m.colour}</span>
                    </td>
                    <td className="px-4 py-2.5 capitalize font-medium text-[#0D0D0F]">{m.movementType}</td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono-num font-semibold ${
                        m.quantityDelta >= 0 ? 'text-[#166534]' : 'text-[#991B1B]'
                      }`}
                    >
                      {m.quantityDelta >= 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-num text-[#4A463F]">
                      {m.previousTotal} → {m.newTotal}
                    </td>
                    <td className="px-4 py-2.5 text-[#2D2A26] whitespace-nowrap">{m.actorName}</td>
                    <td className="px-4 py-2.5 text-[#6B655B]">{m.note}</td>
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
