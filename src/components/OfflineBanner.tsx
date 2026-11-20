import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl border border-[#C5A059]/40 bg-[#0D0D0F] px-4 py-3 text-xs text-[#FAF7F0] shadow-xl md:left-auto md:right-6"
    >
      <div className="flex items-center gap-2.5">
        <WifiOff className="h-4 w-4 shrink-0 text-[#D97706]" />
        <span>
          <strong className="font-semibold text-[#C5A059]">Offline Mode:</strong> Viewing cached shell only. Orders, stock edits, and approvals are disabled until you reconnect.
        </span>
      </div>
    </div>
  );
};
