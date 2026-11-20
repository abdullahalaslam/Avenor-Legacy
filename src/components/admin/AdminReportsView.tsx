import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { dashboardApi } from '../../utils/api';
import {
  formatBDT,
  type FinancialReportSummary,
  type ReportPeriod,
} from '../../utils/domain';

export const AdminReportsView: React.FC = () => {
  const [period, setPeriod] = useState<ReportPeriod>('monthly');
  const [report, setReport] = useState<FinancialReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (selectedPeriod: ReportPeriod) => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.reports(selectedPeriod);
      setReport(res.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load financial reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(period);
  }, [period]);

  const handleExportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const csv = await dashboardApi.exportCsv(period);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `avenor-legacy-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV export failed.');
    } finally {
      setExporting(false);
    }
  };

  const periods: { id: ReportPeriod; label: string }[] = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly (7d)' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'all', label: 'All Time' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">
            Financial &amp; Performance Reports
          </h2>
          <p className="mt-1 text-sm text-[#6B655B]">
            Clear separation of Processing Value, Completed Sales Revenue, Product Cost (COGS), Gross Profit, Expenses, and Net Profit.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#D8CFC0] bg-white p-1">
            {periods.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  period === p.id
                    ? 'bg-[#0D0D0F] text-[#FAF7F0]'
                    : 'text-[#4A463F] hover:text-[#0D0D0F]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0D0D0F] px-4 py-2 text-xs font-medium text-[#FAF7F0] hover:bg-[#1E1E24] disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 text-[#C5A059]" />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">
          {error}
        </div>
      )}

      {loading || !report ? (
        <div className="p-8 text-center text-xs text-[#6B655B]">Calculating financial report...</div>
      ) : (
        <>
          {/* Financial Breakdown Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-[#E5DFD3] bg-white p-5">
              <p className="text-xs font-medium text-[#6B655B]">Processing Value (In Pipeline)</p>
              <p className="mt-2 font-mono-num text-2xl font-semibold text-[#92400E]">
                {formatBDT(report.processingValue)}
              </p>
              <p className="mt-1 text-[11px] text-[#8B8478]">
                {report.processingOrders} active processing orders · Excluded from realized sales
              </p>
            </div>

            <div className="rounded-xl border border-[#E5DFD3] bg-white p-5">
              <p className="text-xs font-medium text-[#6B655B]">Completed Sales Revenue</p>
              <p className="mt-2 font-mono-num text-2xl font-semibold text-[#0D0D0F]">
                {formatBDT(report.completedSales)}
              </p>
              <p className="mt-1 text-[11px] text-[#8B8478]">
                {report.completedOrders} completed orders ({report.totalOrders} total orders in period)
              </p>
            </div>

            <div className="rounded-xl border border-[#E5DFD3] bg-white p-5">
              <p className="text-xs font-medium text-[#6B655B]">Product Cost (COGS)</p>
              <p className="mt-2 font-mono-num text-2xl font-semibold text-[#3A3731]">
                {formatBDT(report.productCost)}
              </p>
              <p className="mt-1 text-[11px] text-[#8B8478]">
                Snapshot unit cost × completed quantity
              </p>
            </div>

            <div className="rounded-xl border border-[#E5DFD3] bg-white p-5">
              <p className="text-xs font-medium text-[#6B655B]">Gross Profit</p>
              <p className="mt-2 font-mono-num text-2xl font-semibold text-[#166534]">
                {formatBDT(report.grossProfit)}
              </p>
              <p className="mt-1 text-[11px] text-[#8B8478]">
                Completed Sales − Product Cost
              </p>
            </div>

            <div className="rounded-xl border border-[#E5DFD3] bg-white p-5">
              <p className="text-xs font-medium text-[#6B655B]">Operational Expenses</p>
              <p className="mt-2 font-mono-num text-2xl font-semibold text-[#991B1B]">
                {formatBDT(report.expensesTotal)}
              </p>
              <p className="mt-1 text-[11px] text-[#8B8478]">
                Recorded overhead for {report.period} period
              </p>
            </div>

            <div className="rounded-xl border border-[#C5A059]/60 bg-[#0D0D0F] p-5 text-[#FAF7F0]">
              <p className="text-xs font-medium text-[#C5A059]">Net Profit</p>
              <p className="mt-2 font-mono-num text-2xl font-semibold text-[#FAF7F0]">
                {formatBDT(report.netProfit)}
              </p>
              <p className="mt-1 text-[11px] text-[#A8A298]">
                Gross Profit − Operational Expenses
              </p>
            </div>
          </div>

          {/* Staff Performance Table */}
          <div className="rounded-xl border border-[#E5DFD3] bg-white overflow-hidden">
            <div className="border-b border-[#EFEAE0] px-5 py-3.5">
              <h3 className="text-sm font-semibold text-[#0D0D0F]">Staff Performance Breakdown</h3>
            </div>
            {report.staffPerformance.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#6B655B]">
                No staff order activity recorded for this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E5DFD3] bg-[#FAF7F0] text-[#6B655B]">
                      <th className="px-4 py-2.5 font-medium">Staff Advisor</th>
                      <th className="px-4 py-2.5 font-medium text-right">Total Orders</th>
                      <th className="px-4 py-2.5 font-medium text-right">Completed</th>
                      <th className="px-4 py-2.5 font-medium text-right">Processing</th>
                      <th className="px-4 py-2.5 font-medium text-right">Rejected</th>
                      <th className="px-4 py-2.5 font-medium text-right">Processing Value</th>
                      <th className="px-4 py-2.5 font-medium text-right">Completed Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0EAE0]">
                    {report.staffPerformance.map((s) => (
                      <tr key={s.staffId}>
                        <td className="px-4 py-2.5 font-medium text-[#0D0D0F]">{s.staffName}</td>
                        <td className="px-4 py-2.5 text-right font-mono-num">{s.totalOrders}</td>
                        <td className="px-4 py-2.5 text-right font-mono-num text-[#166534]">{s.completedOrders}</td>
                        <td className="px-4 py-2.5 text-right font-mono-num text-[#92400E]">{s.processingOrders}</td>
                        <td className="px-4 py-2.5 text-right font-mono-num text-[#991B1B]">{s.rejectedOrders}</td>
                        <td className="px-4 py-2.5 text-right font-mono-num">{formatBDT(s.processingValue)}</td>
                        <td className="px-4 py-2.5 text-right font-mono-num font-semibold text-[#0D0D0F]">
                          {formatBDT(s.completedSales)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
