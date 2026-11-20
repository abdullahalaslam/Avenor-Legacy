import React from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import type { NotificationItem } from '../../utils/domain';

interface Props {
  notifications: NotificationItem[];
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
}

export const AdminNotificationsView: React.FC<Props> = ({
  notifications,
  onMarkRead,
  onMarkAllRead,
}) => {
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">Notifications</h2>
          <p className="mt-1 text-sm text-[#6B655B]">
            Real-time alerts for new staff signups, incoming orders, and inventory updates.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-2 rounded-lg border border-[#D8CFC0] bg-white px-3.5 py-2 text-xs font-medium text-[#0D0D0F] hover:border-[#B89242]"
          >
            <CheckCheck className="h-3.5 w-3.5 text-[#C5A059]" />
            <span>Mark All Read ({unreadCount})</span>
          </button>
        )}
      </div>

      <div className="rounded-xl border border-[#E5DFD3] bg-white overflow-hidden">
        {notifications.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="mx-auto h-7 w-7 text-[#C5A059]" />
            <p className="mt-3 text-sm font-medium text-[#0D0D0F]">All Caught Up</p>
            <p className="mt-1 text-xs text-[#6B655B]">Real-time system events will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#F0EAE0]">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 transition-colors ${
                  n.isRead ? 'bg-white' : 'bg-[#FAF7F0]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-[#0D0D0F]">{n.title}</span>
                    {!n.isRead && (
                      <span className="rounded border border-[#C5A059]/60 bg-[#C5A059]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#8A6820]">
                        Unread
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[#4A463F]">{n.message}</p>
                  <p className="mt-1 font-mono-num text-[11px] text-[#8B8478]">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
                {!n.isRead && (
                  <button
                    type="button"
                    onClick={() => onMarkRead(n.id)}
                    className="rounded-lg border border-[#D8CFC0] bg-white px-3 py-1 text-xs font-medium text-[#141416] hover:border-[#B89242]"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
