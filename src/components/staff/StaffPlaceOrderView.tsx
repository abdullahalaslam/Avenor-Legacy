import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Lock, Search } from 'lucide-react';
import { ordersApi, productsApi } from '../../utils/api';
import {
  calculateOrderTotal,
  formatBDT,
  validateOrderInput,
  type Order,
  type Product,
} from '../../utils/domain';
import { StockStatusLabel } from '../StatusBadge';

interface Props {
  onOrderCreated: (order: Order) => void;
}

export const StaffPlaceOrderView: React.FC<Props> = ({ onOrderCreated }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [isUnlisted, setIsUnlisted] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [customName, setCustomName] = useState('');
  const [size, setSize] = useState('');
  const [colour, setColour] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    productsApi
      .list()
      .then((res) => {
        setProducts(res.products);
        if (res.products.length > 0) {
          const first = res.products[0];
          setSelectedCode(first.productCode);
          const firstVar = first.variants?.[0];
          if (firstVar) {
            setSize(firstVar.size);
            setColour(firstVar.colour);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  const filteredProducts = useMemo(() => {
    const q = catalogSearch.trim().toUpperCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.productCode.toUpperCase().includes(q) ||
        p.productName.toUpperCase().includes(q)
    );
  }, [products, catalogSearch]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.productCode === selectedCode) ?? null,
    [products, selectedCode]
  );

  const availableVariants = useMemo(
    () => selectedProduct?.variants ?? [],
    [selectedProduct]
  );

  const matchedVariant = useMemo(
    () =>
      availableVariants.find(
        (v) =>
          v.size.toLowerCase() === size.trim().toLowerCase() &&
          v.colour.toLowerCase() === colour.trim().toLowerCase()
      ) ?? null,
    [availableVariants, size, colour]
  );

  const effectiveCode = isUnlisted ? customCode.trim().toUpperCase() : selectedCode;
  const effectiveName = isUnlisted
    ? customName.trim()
    : selectedProduct?.productName ?? '';
  const unitPrice = isUnlisted ? 0 : selectedProduct?.sellingPrice ?? 0;
  const totalPrice = isUnlisted ? 0 : calculateOrderTotal(unitPrice, quantity);

  const handleSelectProduct = (code: string) => {
    setSelectedCode(code);
    const prod = products.find((p) => p.productCode === code);
    const firstVar = prod?.variants?.[0];
    setSize(firstVar ? firstVar.size : '');
    setColour(firstVar ? firstVar.colour : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setCreatedOrder(null);

    const errors = validateOrderInput({
      customerName,
      contactNumber,
      deliveryAddress,
      productCode: effectiveCode,
      productName: effectiveName,
      size,
      colour,
      quantity: Number(quantity),
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      const res = await ordersApi.create({
        customerName,
        contactNumber,
        deliveryAddress,
        productCode: effectiveCode,
        productName: effectiveName,
        size,
        colour,
        quantity: Number(quantity),
        note,
        isUnlistedProduct: isUnlisted,
      });
      setCreatedOrder(res.order);
      onOrderCreated(res.order);
      setCustomerName('');
      setContactNumber('');
      setDeliveryAddress('');
      setQuantity(1);
      setNote('');
      if (isUnlisted) {
        setCustomCode('');
        setCustomName('');
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">Place Client Order</h2>
        <p className="mt-1 text-sm text-[#6B655B]">
          Unit selling prices are locked by the Main Admin and snapshotted automatically on submission.
        </p>
      </div>

      {createdOrder && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-[#15803D]/30 bg-[#F0FDF4] p-4 text-xs text-[#166534]"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              Order {createdOrder.orderId} submitted to Admin review
            </p>
            <p className="mt-0.5">
              {createdOrder.productCode} ({createdOrder.size}/{createdOrder.colour}) × {createdOrder.quantity} ·{' '}
              {createdOrder.isUnlistedProduct
                ? 'Unlisted product awaiting Admin catalog creation & pricing'
                : `Total: ${formatBDT(createdOrder.totalPrice)}`}
            </p>
          </div>
        </div>
      )}

      {submitError && (
        <div role="alert" className="rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-xs font-medium text-[#991B1B]">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border border-[#E5DFD3] bg-white p-6 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ord-cust" className="block text-xs font-medium text-[#3A3731]">
              Customer Name
            </label>
            <input
              id="ord-cust"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g., Tanvir Chowdhury"
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/40 px-3 py-2.5 text-sm focus:border-[#B89242] focus:bg-white focus:outline-none"
            />
            {fieldErrors.customerName && (
              <p className="mt-1 text-[11px] text-[#991B1B]">{fieldErrors.customerName}</p>
            )}
          </div>

          <div>
            <label htmlFor="ord-phone" className="block text-xs font-medium text-[#3A3731]">
              Contact Number
            </label>
            <input
              id="ord-phone"
              type="tel"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              placeholder="e.g., 017XXXXXXXX"
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/40 px-3 py-2.5 font-mono-num text-sm focus:border-[#B89242] focus:bg-white focus:outline-none"
            />
            {fieldErrors.contactNumber && (
              <p className="mt-1 text-[11px] text-[#991B1B]">{fieldErrors.contactNumber}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="ord-addr" className="block text-xs font-medium text-[#3A3731]">
              Full Delivery Address
            </label>
            <textarea
              id="ord-addr"
              rows={2}
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="House, Road, Sector/Area, City"
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/40 px-3 py-2 text-sm focus:border-[#B89242] focus:bg-white focus:outline-none"
            />
            {fieldErrors.deliveryAddress && (
              <p className="mt-1 text-[11px] text-[#991B1B]">{fieldErrors.deliveryAddress}</p>
            )}
          </div>
        </div>

        <div className="border-t border-[#EFEAE0] pt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B655B]">
              Garment Selection &amp; Pricing
            </h3>
            <label className="flex items-center gap-2 text-xs text-[#3A3731]">
              <input
                type="checkbox"
                checked={isUnlisted}
                onChange={(e) => {
                  setIsUnlisted(e.target.checked);
                  setFieldErrors({});
                }}
              />
              <span>Submit unlisted Product Code (requires Admin creation)</span>
            </label>
          </div>

          {!isUnlisted ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8B8478]" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Search active catalog by Product Code or Name..."
                  aria-label="Search active catalog by Product Code or Name"
                  className="w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 py-2 pl-8 pr-3 text-xs text-[#141416] focus:border-[#B89242] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ord-prod-code" className="block text-xs font-medium text-[#3A3731]">
                    Product Code
                  </label>
                  <select
                    id="ord-prod-code"
                    disabled={loadingProducts}
                    value={selectedCode}
                    onChange={(e) => handleSelectProduct(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-white px-3 py-2.5 font-mono text-xs"
                  >
                    <option value="">Select active product...</option>
                    {filteredProducts.map((p) => (
                      <option key={p.id} value={p.productCode}>
                        {p.productCode} — {p.productName} ({formatBDT(p.sellingPrice)})
                      </option>
                    ))}
                  </select>
                  {fieldErrors.productCode && (
                    <p className="mt-1 text-[11px] text-[#991B1B]">{fieldErrors.productCode}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="ord-prod-name" className="block text-xs font-medium text-[#3A3731]">
                    Product Name (Auto-Filled)
                  </label>
                  <input
                    id="ord-prod-name"
                    type="text"
                    readOnly
                    value={effectiveName}
                    className="mt-1 w-full rounded-lg border border-[#E5DFD3] bg-[#F5F1E8] px-3 py-2.5 text-sm text-[#4A463F]"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ord-cust-code" className="block text-xs font-medium text-[#3A3731]">
                  Unlisted Product Code
                </label>
                <input
                  id="ord-cust-code"
                  type="text"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  placeholder="e.g., AVL-BESPOKE-99"
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2.5 font-mono text-xs uppercase"
                />
                {fieldErrors.productCode && (
                  <p className="mt-1 text-[11px] text-[#991B1B]">{fieldErrors.productCode}</p>
                )}
              </div>
              <div>
                <label htmlFor="ord-cust-name" className="block text-xs font-medium text-[#3A3731]">
                  Requested Product Name
                </label>
                <input
                  id="ord-cust-name"
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g., Cashmere Bandhgala"
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2.5 text-sm"
                />
                {fieldErrors.productName && (
                  <p className="mt-1 text-[11px] text-[#991B1B]">{fieldErrors.productName}</p>
                )}
              </div>
            </div>
          )}

          {!isUnlisted && availableVariants.length > 0 && (
            <div className="rounded-lg border border-[#EFEAE0] bg-[#FAF7F0]/80 p-3">
              <p className="text-[11px] font-medium text-[#6B655B]">
                Quick-Pick Available Variants (click to select Size &amp; Colour)
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {availableVariants.map((v) => {
                  const selected =
                    v.size.toLowerCase() === size.toLowerCase() &&
                    v.colour.toLowerCase() === colour.toLowerCase();
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSize(v.size);
                        setColour(v.colour);
                      }}
                      className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                        selected
                          ? 'border-[#0D0D0F] bg-[#0D0D0F] text-[#FAF7F0]'
                          : 'border-[#D8CFC0] bg-white text-[#141416] hover:border-[#B89242]'
                      }`}
                    >
                      <span>
                        {v.size} · {v.colour}
                      </span>
                      <span className="font-mono-num text-[11px] opacity-80">
                        ({v.availableQty} avail)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="ord-size" className="block text-xs font-medium text-[#3A3731]">
                Size
              </label>
              <input
                id="ord-size"
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="S, M, L, XL, 42"
                className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 text-sm"
              />
              {fieldErrors.size && <p className="mt-1 text-[11px] text-[#991B1B]">{fieldErrors.size}</p>}
            </div>

            <div>
              <label htmlFor="ord-colour" className="block text-xs font-medium text-[#3A3731]">
                Colour
              </label>
              <input
                id="ord-colour"
                type="text"
                value={colour}
                onChange={(e) => setColour(e.target.value)}
                placeholder="Obsidian, Ivory"
                className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 text-sm"
              />
              {fieldErrors.colour && (
                <p className="mt-1 text-[11px] text-[#991B1B]">{fieldErrors.colour}</p>
              )}
            </div>

            <div>
              <label htmlFor="ord-qty" className="block text-xs font-medium text-[#3A3731]">
                Quantity
              </label>
              <input
                id="ord-qty"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 font-mono-num text-sm"
              />
              {fieldErrors.quantity && (
                <p className="mt-1 text-[11px] text-[#991B1B]">{fieldErrors.quantity}</p>
              )}
            </div>
          </div>

          {!isUnlisted && matchedVariant && (
            <div className="flex items-center justify-between rounded-lg border border-[#EFEAE0] bg-[#FAF7F0] px-3.5 py-2 text-xs">
              <span className="text-[#4A463F]">
                Live Variant Availability: <strong className="font-mono-num">{matchedVariant.availableQty}</strong> units available
              </span>
              <StockStatusLabel status={matchedVariant.status} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl border border-[#E5DFD3] bg-[#FAF7F0] p-4">
            <div>
              <label htmlFor="ord-unit-price" className="flex items-center gap-1.5 text-xs font-medium text-[#3A3731]">
                <Lock className="h-3.5 w-3.5 text-[#8A6820]" />
                <span>Admin Fixed Selling Price (Read-Only)</span>
              </label>
              <input
                id="ord-unit-price"
                type="text"
                readOnly
                value={isUnlisted ? 'Pending Admin Pricing' : formatBDT(unitPrice)}
                className="mt-1.5 w-full rounded-lg border border-[#D8CFC0] bg-white px-3 py-2 font-mono-num text-sm font-semibold text-[#0D0D0F]"
              />
            </div>

            <div>
              <label htmlFor="ord-total-price" className="block text-xs font-medium text-[#3A3731]">
                Total Price (Auto-Calculated)
              </label>
              <input
                id="ord-total-price"
                type="text"
                readOnly
                value={isUnlisted ? 'Pending Admin Pricing' : formatBDT(totalPrice)}
                className="mt-1.5 w-full rounded-lg border border-[#C5A059]/60 bg-[#0D0D0F] px-3 py-2 font-mono-num text-sm font-semibold text-[#C5A059]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ord-note" className="block text-xs font-medium text-[#3A3731]">
              Optional Note
            </label>
            <input
              id="ord-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tailoring preferences, urgent dispatch, or client requests"
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-[#0D0D0F] py-3 text-sm font-medium text-[#FAF7F0] hover:bg-[#1E1E24] disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Submitting Order...' : 'Submit Order to Admin'}
        </button>
      </form>
    </div>
  );
};
