import React, { useEffect, useState } from 'react';
import { Check, KeyRound, ShieldAlert, UserCheck, UserX } from 'lucide-react';
import { staffApi } from '../../utils/api';
import { formatBDT, type ActivityLog, type UserProfile } from '../../utils/domain';
import { AccountStatusLabel } from '../StatusBadge';

export const AdminStaffView: React.FC = () => {
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issuedCode, setIssuedCode] = useState<{
    staffName: string;
    email: string;
    code: string;
    expiresAt: string;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await staffApi.list();
      setStaff(res.staff);
      setActivityLogs(res.activityLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load staff roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleStatus = async (id: string, status: 'approved' | 'rejected' | 'suspended') => {
    setError(null);
    try {
      await staffApi.updateStatus(id, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update staff status.');
    }
  };

  const handleIssueReset = async (member: UserProfile) => {
    setError(null);
    try {
      const res = await staffApi.issueResetToken(member.id);
      setIssuedCode({
        staffName: member.fullName,
        email: member.email,
        code: res.resetCode,
        expiresAt: res.expiresAt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate reset code.');
    }
  };

  const pending = staff.filter((s) => s.status === 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">Staff Management</h2>
        <p className="mt-1 text-sm text-[#6B655B]">
          Review new staff registration requests, manage active advisors, and inspect activity history.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-xs font-medium text-[#991B1B]">
          {error}
        </div>
      )}

      {issuedCode && (
        <div className="rounded-xl border border-[#C5A059]/60 bg-[#FAF7F0] p-4 text-xs text-[#141416]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-[#0D0D0F]">
                Single-Use Password Reset Code Issued for {issuedCode.staffName}
              </p>
              <p className="mt-1 text-[#544F47]">
                Share this code securely with <span className="font-medium">{issuedCode.email}</span>. Expires at{' '}
                {new Date(issuedCode.expiresAt).toLocaleTimeString()}.
              </p>
              <p className="mt-2 inline-block rounded bg-[#0D0D0F] px-3 py-1.5 font-mono text-sm font-semibold tracking-widest text-[#C5A059]">
                {issuedCode.code}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIssuedCode(null)}
              className="rounded border border-[#D8CFC0] bg-white px-3 py-1 text-xs font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Pending Signup Requests */}
      <section className="rounded-xl border border-[#E5DFD3] bg-white p-5">
        <div className="border-b border-[#EFEAE0] pb-3">
          <h3 className="text-sm font-semibold text-[#0D0D0F]">
            Pending Signup Requests ({pending.length})
          </h3>
        </div>
        {pending.length === 0 ? (
          <p className="py-6 text-center text-xs text-[#6B655B]">
            No pending staff registration requests.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-[#F0EAE0]">
            {pending.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-3 text-xs">
                <div>
                  <p className="font-semibold text-[#0D0D0F]">{s.fullName}</p>
                  <p className="text-[#6B655B]">
                    {s.email} · Registered {new Date(s.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleStatus(s.id, 'approved')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D0D0F] px-3 py-1.5 text-xs font-medium text-[#FAF7F0] hover:bg-[#1E1E24]"
                  >
                    <Check className="h-3.5 w-3.5 text-[#C5A059]" />
                    <span>Approve</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatus(s.id, 'rejected')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#B91C1C]/30 px-3 py-1.5 text-xs font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
                  >
                    <UserX className="h-3.5 w-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Staff Directory */}
      <section className="rounded-xl border border-[#E5DFD3] bg-white overflow-hidden">
        <div className="border-b border-[#EFEAE0] px-5 py-3.5">
          <h3 className="text-sm font-semibold text-[#0D0D0F]">Staff Roster &amp; Order Counts</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-xs text-[#6B655B]">Loading staff roster...</div>
        ) : staff.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#6B655B]">No staff accounts registered yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5DFD3] bg-[#FAF7F0] text-[#6B655B]">
                  <th className="px-4 py-2.5 font-medium">Advisor Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium text-right">Orders</th>
                  <th className="px-4 py-2.5 font-medium text-right">Completed Sales</th>
                  <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EAE0]">
                {staff.map((s) => (
                  <tr key={s.id} className="hover:bg-[#FAF7F0]/50">
                    <td className="px-4 py-3 font-medium text-[#0D0D0F]">{s.fullName}</td>
                    <td className="px-4 py-3 text-[#4A463F]">{s.email}</td>
                    <td className="px-4 py-3">
                      <AccountStatusLabel status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num font-medium">
                      {s.orderCount ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num font-semibold text-[#0D0D0F]">
                      {formatBDT(s.completedSales ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {s.status === 'approved' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleIssueReset(s)}
                              className="inline-flex items-center gap-1 rounded border border-[#D8CFC0] px-2.5 py-1 text-[11px] font-medium text-[#3A3731] hover:bg-[#FAF7F0]"
                            >
                              <KeyRound className="h-3 w-3 text-[#8A6820]" />
                              <span>Reset Code</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatus(s.id, 'suspended')}
                              className="inline-flex items-center gap-1 rounded border border-[#B91C1C]/30 px-2.5 py-1 text-[11px] font-medium text-[#991B1B] hover:bg-[#FEF2F2]"
                            >
                              <ShieldAlert className="h-3 w-3" />
                              <span>Suspend</span>
                            </button>
                          </>
                        )}
                        {(s.status === 'suspended' || s.status === 'rejected') && (
                          <button
                            type="button"
                            onClick={() => handleStatus(s.id, 'approved')}
                            className="inline-flex items-center gap-1 rounded bg-[#0D0D0F] px-2.5 py-1 text-[11px] font-medium text-[#FAF7F0]"
                          >
                            <UserCheck className="h-3 w-3 text-[#C5A059]" />
                            <span>Reactivate</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Activity History */}
      <section className="rounded-xl border border-[#E5DFD3] bg-white overflow-hidden">
        <div className="border-b border-[#EFEAE0] px-5 py-3.5">
          <h3 className="text-sm font-semibold text-[#0D0D0F]">Staff &amp; System Activity History</h3>
        </div>
        {activityLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#6B655B]">No activity recorded yet.</div>
        ) : (
          <div className="divide-y divide-[#F0EAE0] max-h-96 overflow-y-auto">
            {activityLogs.map((log) => (
              <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-xs">
                <div>
                  <span className="font-semibold text-[#0D0D0F]">{log.actorName}</span>
                  <span className="mx-1.5 text-[#C0B8AA]">·</span>
                  <span className="font-mono text-[11px] text-[#8A6820]">{log.action}</span>
                  <p className="mt-0.5 text-[#544F47]">{log.details}</p>
                </div>
                <span className="font-mono-num text-[11px] text-[#8B8478] whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
