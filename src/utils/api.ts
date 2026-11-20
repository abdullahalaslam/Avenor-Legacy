import type {
  AccountStatus,
  ActivityLog,
  AdminDashboardMetrics,
  Expense,
  FinancialReportSummary,
  NotificationItem,
  Order,
  OrderStatus,
  Product,
  ReadyTextCategory,
  ReadyTextTemplate,
  ReportPeriod,
  StockMovement,
  StockVariant,
  UserProfile,
} from './domain';

const TOKEN_KEY = 'avenor_session_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

export class ApiError extends Error {
  status: number;
  accountStatus?: AccountStatus;

  constructor(message: string, status: number, accountStatus?: AccountStatus) {
    super(message);
    this.status = status;
    this.accountStatus = accountStatus;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { isMutation?: boolean } = {}
): Promise<T> {
  const { isMutation = false, ...fetchOptions } = options;

  if (isMutation && typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new ApiError(
      'You are currently offline. Changes cannot be saved until connectivity is restored.',
      0
    );
  }

  const token = getStoredToken();
  const headers = new Headers(fetchOptions.headers || {});
  if (!headers.has('Content-Type') && fetchOptions.body && typeof fetchOptions.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...fetchOptions,
      headers,
    });
  } catch {
    throw new ApiError(
      'Network connection failed. Please verify your connection and try again.',
      0
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    if (!response.ok) {
      throw new ApiError('Failed to export CSV report.', response.status);
    }
    return (await response.text()) as unknown as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMsg = data.error || `Request failed with status ${response.status}`;
    if (
      typeof window !== 'undefined' &&
      !path.startsWith('/api/auth/login') &&
      !path.startsWith('/api/auth/register') &&
      !path.startsWith('/api/auth/reset-password') &&
      !path.startsWith('/api/auth/request-password-reset') &&
      (response.status === 401 || (response.status === 403 && data.accountStatus))
    ) {
      window.dispatchEvent(
        new CustomEvent('avenor:auth-revoked', {
          detail: {
            status: response.status,
            accountStatus: data.accountStatus as AccountStatus | undefined,
            message: errMsg,
          },
        })
      );
    }
    throw new ApiError(errMsg, response.status, data.accountStatus);
  }
  return data as T;
}

export const authApi = {
  bootstrapStatus: () => request<{ hasAdmin: boolean }>('/api/auth/bootstrap-status'),
  registerStaff: (payload: { fullName: string; email: string; password: string }) =>
    request<{ message: string; status: AccountStatus }>('/api/auth/register', {
      method: 'POST',
      isMutation: true,
      body: JSON.stringify(payload),
    }),
  login: (payload: { email: string; password: string; portal: 'admin' | 'staff' }) =>
    request<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      isMutation: true,
      body: JSON.stringify(payload),
    }),
  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
      isMutation: true,
    }),
  me: () => request<{ user: UserProfile }>('/api/auth/me'),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      isMutation: true,
      body: JSON.stringify(payload),
    }),
  requestPasswordReset: (email: string) =>
    request<{ message: string }>('/api/auth/request-password-reset', {
      method: 'POST',
      isMutation: true,
      body: JSON.stringify({ email }),
    }),
  resetPassword: (payload: { email: string; resetCode: string; newPassword: string }) =>
    request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      isMutation: true,
      body: JSON.stringify(payload),
    }),
};

export const productsApi = {
  list: () => request<{ products: Product[] }>('/api/products'),
  create: (payload: {
    productCode: string;
    productName: string;
    category: string;
    description: string;
    productCost: number;
    sellingPrice: number;
    isActive: boolean;
    imageUrl?: string | null;
    initialVariants?: { size: string; colour: string; quantity: number }[];
  }) =>
    request<{ product: Product }>('/api/products', {
      method: 'POST',
      isMutation: true,
      body: JSON.stringify(payload),
    }),
  update: (
    id: string,
    payload: Partial<{
      productName: string;
      category: string;
      description: string;
      productCost: number;
      sellingPrice: number;
      isActive: boolean;
      imageUrl: string | null;
    }>
  ) =>
    request<{ product: Product }>(`/api/products/${id}`, {
      method: 'PATCH',
      isMutation: true,
      body: JSON.stringify(payload),
    }),
  createFromOrder: (
    orderId: string,
    payload: {
      productCode: string;
      productName: string;
      category: string;
      description: string;
      productCost: number;
      sellingPrice: number;
      initialStockQty: number;
    }
  ) =>
    request<{ product: Product; order: Order }>(`/api/products/from-order/${orderId}`, {
      method: 'POST',
      isMutation: true,
      body: JSON.stringify(payload),
    }),
};

export const stockApi = {
  list: () => request<{ variants: StockVariant[]; movements: StockMovement[] }>('/api/stock'),
  adjust: (payload: {
    productId: string;
    size: string;
    colour: string;
    action: 'add' | 'reduce';
    quantity: number;
    lowStockThreshold?: number;
    note?: string;
  }) =>
    request<{ variant: StockVariant }>('/api/stock/adjust', {
      method: 'POST',
      isMutation: true,
      body: JSON.stringify(payload),
    }),
};

export const ordersApi = {
  list: (filters?: {
    staffId?: string;
    status?: string;
    productCode?: string;
    fromDate?: string;
    toDate?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.staffId) params.set('staffId', filters.staffId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.productCode) params.set('productCode', filters.productCode);
    if (filters?.fromDate) params.set('fromDate', filters.fromDate);
    if (filters?.toDate) params.set('toDate', filters.toDate);
    const qs = params.toString();
    return request<{ orders: Order[] }>(`/api/orders${qs ? `?${qs}` : ''}`);
  },
  create: (payload: {
    customerName: string;
    contactNumber: string;
    deliveryAddress: string;
    productCode: string;
    productName: string;
    size: string;
    colour: string;
    quantity: number;
    note?: string;
    isUnlistedProduct?: boolean;
  }) =>
    request<{ order: Order }>('/api/orders', {
      method: 'POST',
      isMutation: true,
      body: JSON.stringify(payload),
    }),
  updateStatus: (id: string, status: OrderStatus, rejectionReason?: string) =>
    request<{ order: Order }>(`/api/orders/${id}/status`, {
      method: 'PATCH',
      isMutation: true,
      body: JSON.stringify({ status, rejectionReason }),
    }),
};

export const staffApi = {
  list: () => request<{ staff: UserProfile[]; activityLogs: ActivityLog[] }>('/api/staff'),
  updateStatus: (id: string, status: 'approved' | 'rejected' | 'suspended') =>
    request<{ staff: UserProfile }>(`/api/staff/${id}/status`, {
      method: 'PATCH',
      isMutation: true,
      body: JSON.stringify({ status }),
    }),
  issueResetToken: (id: string) =>
    request<{ resetCode: string; expiresAt: string }>(`/api/staff/${id}/reset-token`, {
      method: 'POST',
      isMutation: true,
    }),
};

export const readyTextsApi = {
  list: () => request<{ templates: ReadyTextTemplate[] }>('/api/ready-texts'),
  create: (payload: {
    title: string;
    category: ReadyTextCategory;
    body: string;
    isActive: boolean;
  }) =>
    request<{ template: ReadyTextTemplate }>('/api/ready-texts', {
      method: 'POST',
      isMutation: true,
      body: JSON.stringify(payload),
    }),
  update: (
    id: string,
    payload: Partial<{
      title: string;
      category: ReadyTextCategory;
      body: string;
      isActive: boolean;
    }>
  ) =>
    request<{ template: ReadyTextTemplate }>(`/api/ready-texts/${id}`, {
      method: 'PATCH',
      isMutation: true,
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(`/api/ready-texts/${id}`, {
      method: 'DELETE',
      isMutation: true,
    }),
};

export const expensesApi = {
  list: () => request<{ expenses: Expense[] }>('/api/expenses'),
  create: (payload: {
    title: string;
    category: string;
    amount: number;
    expenseDate: string;
    note?: string;
  }) =>
    request<{ expense: Expense }>('/api/expenses', {
      method: 'POST',
      isMutation: true,
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(`/api/expenses/${id}`, {
      method: 'DELETE',
      isMutation: true,
    }),
};

export const dashboardApi = {
  admin: () =>
    request<{
      metrics: AdminDashboardMetrics;
      recentOrders: Order[];
      lowStockVariants: StockVariant[];
    }>('/api/admin/dashboard'),
  staff: () =>
    request<{
      counts: {
        totalOrders: number;
        newOrders: number;
        stockChecking: number;
        confirmed: number;
        processing: number;
        completed: number;
        rejected: number;
        onHold: number;
        completedSales: number;
      };
      recentOrders: Order[];
    }>('/api/staff/dashboard'),
  reports: (period: ReportPeriod) =>
    request<{ report: FinancialReportSummary }>(`/api/admin/reports?period=${period}`),
  exportCsv: (period: ReportPeriod) =>
    request<string>(`/api/admin/reports/export?period=${period}`),
};

export const notificationsApi = {
  list: () => request<{ notifications: NotificationItem[] }>('/api/notifications'),
  markRead: (id: string) =>
    request<{ ok: boolean }>(`/api/notifications/${id}/read`, {
      method: 'PATCH',
      isMutation: true,
    }),
  markAllRead: () =>
    request<{ ok: boolean }>('/api/notifications/read-all', {
      method: 'POST',
      isMutation: true,
    }),
};
