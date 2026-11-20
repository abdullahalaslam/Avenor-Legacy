import React, { useEffect, useState } from 'react';
import { Edit3, Plus, Trash2, X } from 'lucide-react';
import { readyTextsApi } from '../../utils/api';
import {
  READY_TEXT_CATEGORIES,
  type ReadyTextCategory,
  type ReadyTextTemplate,
} from '../../utils/domain';

export const AdminReadyTextView: React.FC = () => {
  const [templates, setTemplates] = useState<ReadyTextTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ReadyTextTemplate | null>(null);

  const [form, setForm] = useState({
    title: '',
    category: 'Order Received' as ReadyTextCategory,
    body: '',
    isActive: true,
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await readyTextsApi.list();
      setTemplates(res.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      title: '',
      category: 'Order Received',
      body: 'Dear {customer_name}, your order {order_id} for {product_code} ({total_price}) is updated.',
      isActive: true,
    });
    setShowForm(true);
  };

  const openEdit = (t: ReadyTextTemplate) => {
    setEditing(t);
    setForm({
      title: t.title,
      category: t.category,
      body: t.body,
      isActive: t.isActive,
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await readyTextsApi.update(editing.id, form);
      } else {
        await readyTextsApi.create(form);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template.');
    }
  };

  const toggleActive = async (t: ReadyTextTemplate) => {
    try {
      await readyTextsApi.update(t.id, { isActive: !t.isActive });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle template.');
    }
  };

  const handleDelete = async (t: ReadyTextTemplate) => {
    try {
      await readyTextsApi.remove(t.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">
            Ready Text Management
          </h2>
          <p className="mt-1 text-sm text-[#6B655B]">
            Curate client communication templates. Supported placeholders:{' '}
            <code className="font-mono text-xs text-[#8A6820]">
              {'{customer_name} {order_id} {product_code} {total_price}'}
            </code>
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0D0D0F] px-4 py-2.5 text-xs font-medium text-[#FAF7F0] hover:bg-[#1E1E24] whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4 text-[#C5A059]" />
          <span>New Template</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-[#6B655B]">Loading templates...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="flex flex-col justify-between rounded-xl border border-[#E5DFD3] bg-white p-5">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-[#8A6820]">{t.category}</p>
                    <h3 className="mt-0.5 text-base font-semibold text-[#0D0D0F]">{t.title}</h3>
                  </div>
                  <span
                    className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                      t.isActive
                        ? 'border-[#15803D]/25 bg-[#15803D]/8 text-[#166534]'
                        : 'border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]'
                    }`}
                  >
                    {t.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="mt-3 rounded-lg border border-[#EFEAE0] bg-[#FAF7F0]/70 p-3 text-xs leading-relaxed text-[#2D2A26]">
                  {t.body}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#EFEAE0] pt-3">
                <button
                  type="button"
                  onClick={() => toggleActive(t)}
                  className="rounded-lg border border-[#D8CFC0] px-3 py-1.5 text-xs font-medium text-[#3A3731] hover:bg-[#FAF7F0]"
                >
                  {t.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(t)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#D8CFC0] px-3 py-1.5 text-xs font-medium text-[#0D0D0F] hover:bg-[#FAF7F0]"
                >
                  <Edit3 className="h-3.5 w-3.5 text-[#8A6820]" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(t)}
                  aria-label={`Delete template ${t.title}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#B91C1C]/30 px-2.5 py-1.5 text-xs font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
          <form onSubmit={handleSave} className="w-full max-w-lg rounded-xl border border-[#E5DFD3] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-[#EFEAE0] pb-3">
              <h3 className="font-display text-2xl font-semibold text-[#0D0D0F]">
                {editing ? 'Edit Ready Text' : 'Create Ready Text'}
              </h3>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Close modal" className="rounded border border-[#E5DFD3] p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#3A3731]">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ReadyTextCategory }))}
                className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 text-xs"
              >
                {READY_TEXT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#3A3731]">Template Title</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#3A3731]">Message Body</label>
              <textarea
                required
                rows={4}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[#D8CFC0] p-3 text-xs"
              />
              <p className="mt-1 text-[11px] text-[#6B655B]">
                Variables: {'{customer_name}'}, {'{order_id}'}, {'{product_code}'}, {'{total_price}'}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              <span>Active (visible to Staff advisors)</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-[#D8CFC0] px-4 py-2 text-xs">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-[#0D0D0F] px-5 py-2 text-xs font-medium text-[#FAF7F0]">
                Save Template
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
