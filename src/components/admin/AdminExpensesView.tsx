import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { expensesApi } from '../../utils/api';
import { formatBDT, type Expense } from '../../utils/domain';

export const AdminExpensesView: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Courier & Logistics');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await expensesApi.list();
      setExpenses(res.expenses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expenses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await expensesApi.create({
        title,
        category,
        amount: Number(amount),
        expenseDate,
        note,
      });
      setTitle('');
      setAmount('');
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record expense.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await expensesApi.remove(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove expense.');
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">Expenses Ledger</h2>
          <p className="mt-1 text-sm text-[#6B655B]">
            Record operational, atelier, packaging, and marketing costs deducted from Gross Profit in Reports.
          </p>
        </div>
        <div className="rounded-xl border border-[#E5DFD3] bg-white px-4 py-2.5 text-right">
          <p className="text-[11px] text-[#6B655B]">Cumulative Recorded Expenses</p>
          <p className="font-mono-num text-lg font-semibold text-[#0D0D0F]">{formatBDT(totalExpenses)}</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">
          {error}
        </div>
      )}

      <form onSubmit={handleAdd} className="rounded-xl border border-[#E5DFD3] bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[#0D0D0F]">Log Operational Expense</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label htmlFor="exp-title" className="block text-xs font-medium text-[#3A3731]">
              Expense Title
            </label>
            <input
              id="exp-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Luxury Garment Boxes Batch 4"
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label htmlFor="exp-cat" className="block text-xs font-medium text-[#3A3731]">
              Category
            </label>
            <select
              id="exp-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3 py-2 text-xs"
            >
              <option value="Courier & Logistics">Courier &amp; Logistics</option>
              <option value="Packaging & Trims">Packaging &amp; Trims</option>
              <option value="Atelier & Tailoring">Atelier &amp; Tailoring</option>
              <option value="Marketing">Marketing</option>
              <option value="Showroom & Utilities">Showroom &amp; Utilities</option>
              <option value="Other Operations">Other Operations</option>
            </select>
          </div>
          <div>
            <label htmlFor="exp-amt" className="block text-xs font-medium text-[#3A3731]">
              Amount (BDT)
            </label>
            <input
              id="exp-amt"
              type="number"
              min={1}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3 py-2 font-mono-num text-xs"
            />
          </div>
          <div>
            <label htmlFor="exp-date" className="block text-xs font-medium text-[#3A3731]">
              Date
            </label>
            <input
              id="exp-date"
              type="date"
              required
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3 py-2 text-xs"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note or invoice reference"
            aria-label="Expense note"
            className="min-w-[220px] flex-1 rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 px-3 py-2 text-xs"
          />
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D0D0F] px-4 py-2 text-xs font-medium text-[#FAF7F0]"
          >
            <Plus className="h-3.5 w-3.5 text-[#C5A059]" />
            <span>{saving ? 'Recording...' : 'Record Expense'}</span>
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-[#E5DFD3] bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#6B655B]">Loading expenses...</div>
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#6B655B]">No expenses recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DFD3] bg-[#FAF7F0] text-[#6B655B]">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Recorded By</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amount (BDT)</th>
                  <th className="px-4 py-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EAE0]">
                {expenses.map((exp) => (
                  <tr key={exp.id}>
                    <td className="px-4 py-2.5 font-mono-num text-[#6B655B]">{exp.expenseDate}</td>
                    <td className="px-4 py-2.5 font-medium text-[#0D0D0F]">
                      {exp.title}
                      {exp.note && <p className="text-[11px] font-normal text-[#6B655B]">{exp.note}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-[#4A463F]">{exp.category}</td>
                    <td className="px-4 py-2.5 text-[#4A463F]">{exp.createdByName}</td>
                    <td className="px-4 py-2.5 text-right font-mono-num font-semibold text-[#0D0D0F]">
                      {formatBDT(exp.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(exp.id)}
                        aria-label={`Delete expense ${exp.title}`}
                        className="rounded border border-[#B91C1C]/30 p-1 text-[#991B1B] hover:bg-[#FEF2F2]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
