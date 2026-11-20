import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { ordersApi, readyTextsApi } from '../../utils/api';
import {
  interpolateReadyText,
  type Order,
  type ReadyTextTemplate,
} from '../../utils/domain';

export const StaffReadyTextView: React.FC = () => {
  const [templates, setTemplates] = useState<ReadyTextTemplate[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([readyTextsApi.list(), ordersApi.list()])
      .then(([rtRes, ordRes]) => {
        setTemplates(rtRes.templates);
        setOrders(ordRes.orders);
        if (ordRes.orders.length > 0) {
          setSelectedOrderId(ordRes.orders[0].id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load ready texts.'))
      .finally(() => setLoading(false));
  }, []);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  const renderMessage = (body: string) => {
    if (!selectedOrder) return body;
    return interpolateReadyText(body, {
      customer_name: selectedOrder.customerName,
      order_id: selectedOrder.orderId,
      product_code: selectedOrder.productCode,
      total_price: selectedOrder.totalPrice,
    });
  };

  const handleCopy = async (template: ReadyTextTemplate) => {
    const text = renderMessage(template.body);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(template.id);
      setTimeout(() => setCopiedId((curr) => (curr === template.id ? null : curr)), 2000);
    } catch {
      setError('Clipboard copy failed. Please copy the text manually.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">Ready Text</h2>
          <p className="mt-1 text-sm text-[#6B655B]">
            Select one of your orders to personalize active client templates before copying.
          </p>
        </div>

        <div className="w-full sm:w-80">
          <label htmlFor="rt-order-select" className="block text-[11px] font-medium text-[#6B655B]">
            Populate Variables Using Order
          </label>
          <select
            id="rt-order-select"
            value={selectedOrderId}
            onChange={(e) => setSelectedOrderId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-white px-3 py-2 text-xs"
          >
            <option value="">No order selected (show placeholders)</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderId} — {o.customerName} ({o.productCode})
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-[#6B655B]">Loading active templates...</div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-10 text-center text-sm text-[#6B655B]">
          No active Ready Text templates are currently published by the Admin.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {templates.map((t) => {
            const populated = renderMessage(t.body);
            const isCopied = copiedId === t.id;
            return (
              <div key={t.id} className="flex flex-col justify-between rounded-xl border border-[#E5DFD3] bg-white p-5">
                <div>
                  <p className="text-xs font-medium text-[#8A6820]">{t.category}</p>
                  <h3 className="mt-0.5 text-base font-semibold text-[#0D0D0F]">{t.title}</h3>
                  <p className="mt-3 rounded-lg border border-[#EFEAE0] bg-[#FAF7F0] p-3 text-xs leading-relaxed text-[#2D2A26]">
                    {populated}
                  </p>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleCopy(t)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D0D0F] px-3.5 py-2 text-xs font-medium text-[#FAF7F0] hover:bg-[#1E1E24]"
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#C5A059]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-[#C5A059]" />
                        <span>Copy Message</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
