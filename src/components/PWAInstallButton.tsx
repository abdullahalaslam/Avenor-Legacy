import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface Props {
  variant?: 'dark' | 'light';
}

export const PWAInstallButton: React.FC<Props> = ({ variant = 'dark' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const buttonClass =
    variant === 'dark'
      ? 'inline-flex items-center gap-1.5 rounded-lg border border-[#C5A059]/40 bg-[#18181C] px-2.5 sm:px-3.5 py-2 text-xs font-medium text-[#F5EFE2] hover:border-[#C5A059] hover:bg-[#222227] transition-colors whitespace-nowrap shrink-0'
      : 'inline-flex items-center gap-1.5 rounded-lg border border-[#D8CFC0] bg-white px-2.5 sm:px-3.5 py-2 text-xs font-medium text-[#141416] hover:border-[#B89242] hover:bg-[#FAF7F0] transition-colors whitespace-nowrap shrink-0';

  if (isInstallable) {
    return (
      <button type="button" onClick={install} className={buttonClass}>
        <Download className="h-3.5 w-3.5 text-[#C5A059]" />
        <span>Install</span>
      </button>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setShowGuide(true)} className={buttonClass}>
        <Smartphone className="h-3.5 w-3.5 text-[#C5A059]" />
        <span>{isIOS ? 'iOS App' : 'Install'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-md rounded-xl border border-[#E5DFD3] bg-[#FAF7F0] p-6 text-[#141416] shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="pwa-guide-title" className="font-display text-2xl font-semibold text-[#0D0D0F]">
                  Install AVENOR LEGACY
                </h3>
                <p className="mt-1 text-xs text-[#6B655B]">
                  Add the app to your home screen or desktop for instant standalone access.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close installation guide"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5DFD3] text-[#4A463F] hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-2.5 text-sm text-[#2D2A26]">
                <li>1. Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.</li>
                <li>2. Scroll down and select <strong>Add to Home Screen</strong>.</li>
                <li>3. Confirm by tapping <strong>Add</strong> in the top-right corner.</li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2.5 text-sm text-[#2D2A26]">
                <li>1. On <strong>Android Chrome</strong>, open the browser menu (⋮) and tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                <li>2. On <strong>Desktop Chrome / Edge</strong>, click the install icon in the address bar.</li>
                <li>3. Note: Offline mode blocks database writes to prevent unsaved changes from appearing confirmed.</li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-6 w-full rounded-lg bg-[#0D0D0F] py-2.5 text-sm font-medium text-[#FAF7F0] hover:bg-[#1E1E24] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};
