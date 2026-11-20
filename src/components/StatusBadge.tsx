import React from 'react';
import type { AccountStatus, OrderStatus, StockStatus } from '../utils/domain';

type Tone = 'neutral' | 'gold' | 'green' | 'amber' | 'red' | 'slate';

const TONE_MAP: Record<Tone, string> = {
  neutral: 'border-[#E5DFD3] bg-[#F5F1E8] text-[#3A3731]',
  gold: 'border-[#C5A059]/50 bg-[#C5A059]/10 text-[#8A6820]',
  green: 'border-[#15803D]/25 bg-[#15803D]/8 text-[#166534]',
  amber: 'border-[#B45309]/25 bg-[#D97706]/10 text-[#92400E]',
  red: 'border-[#B91C1C]/25 bg-[#DC2626]/10 text-[#991B1B]',
  slate: 'border-[#CBD5E1] bg-[#F1F5F9] text-[#334155]',
};

function getOrderTone(status: OrderStatus): Tone {
  switch (status) {
    case 'New Order':
      return 'gold';
    case 'Stock Checking':
      return 'amber';
    case 'Confirmed':
      return 'slate';
    case 'Processing':
      return 'amber';
    case 'Completed':
      return 'green';
    case 'On Hold':
      return 'neutral';
    case 'Rejected':
      return 'red';
  }
}

function getStockTone(status: StockStatus): Tone {
  if (status === 'Available') return 'green';
  if (status === 'Low Stock') return 'amber';
  return 'red';
}

function getAccountTone(status: AccountStatus): Tone {
  if (status === 'approved') return 'green';
  if (status === 'pending') return 'amber';
  return 'red';
}

export const OrderStatusLabel: React.FC<{ status: OrderStatus }> = ({ status }) => (
  <span
    className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 ${TONE_MAP[getOrderTone(status)]}`}
  >
    {status}
  </span>
);

export const StockStatusLabel: React.FC<{ status: StockStatus }> = ({ status }) => (
  <span
    className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 ${TONE_MAP[getStockTone(status)]}`}
  >
    {status}
  </span>
);

export const AccountStatusLabel: React.FC<{ status: AccountStatus }> = ({ status }) => (
  <span
    className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize whitespace-nowrap shrink-0 ${TONE_MAP[getAccountTone(status)]}`}
  >
    {status}
  </span>
);
