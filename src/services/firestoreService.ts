import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  isFirebaseSdkError,
  OperationType,
} from '../lib/firebase';
import {
  buildDeterministicVariantId,
  buildReportsCsv,
  calculateOrderTotal,
  canTransitionOrderStatus,
  computeAdminMetrics,
  computeFinancialReport,
  computeManualStockAdjustment,
  computeOrderStockTransition,
  getStockAvailability,
  LOW_STOCK_DEFAULT_THRESHOLD,
  normalizeVariantKey,
  normalizeVariantLabel,
  validateOrderInput,
  validateStockAdjustmentInput,
  type AccountStatus,
  type ActivityLog,
  type AdminDashboardMetrics,
  type Expense,
  type FinancialReportSummary,
  type NotificationItem,
  type Order,
  type OrderStatus,
  type Product,
  type ReadyTextCategory,
  type ReadyTextTemplate,
  type ReportPeriod,
  type StockActionLabel,
  type StockMovement,
  type StockMovementType,
  type StockVariant,
  type UserProfile,
  type UserRole,
} from '../utils/domain';

function makeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`.slice(0, 128);
}

function toIsoString(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as Timestamp).toDate === 'function') {
    return (val as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

export class FirebasePortalError extends Error {
  status: number;
  accountStatus?: AccountStatus;
  code?: string;

  constructor(message: string, status = 400, accountStatus?: AccountStatus, code?: string) {
    super(message);
    this.status = status;
    this.accountStatus = accountStatus;
    this.code = code;
  }
}

function requireCurrentUser(): FirebaseUser {
  const user = auth.currentUser;
  if (!user) {
    throw new FirebasePortalError('Authentication required. Please sign in.', 401);
  }
  if (!user.emailVerified) {
    throw new FirebasePortalError(
      'Email verification is required for cloud database access. Please verify your email or sign in with Google.',
      403
    );
  }
  return user;
}

async function getCurrentUserProfile(): Promise<UserProfile> {
  const fbUser = requireCurrentUser();
  try {
    const userSnap = await getDoc(doc(db, 'users', fbUser.uid));
    if (userSnap.exists()) {
      const d = userSnap.data();
      return {
        id: String(d.id || fbUser.uid),
        fullName: String(d.fullName || fbUser.displayName || fbUser.email || 'User'),
        email: String(d.email || fbUser.email || ''),
        role: (d.role === 'admin' ? 'admin' : 'staff') as UserRole,
        status: (d.status || 'pending') as AccountStatus,
        createdAt: toIsoString(d.createdAt),
        updatedAt: toIsoString(d.updatedAt),
      };
    }
  } catch (err) {
    if (isFirebaseSdkError(err)) {
      handleFirestoreError(err, OperationType.GET, `users/${fbUser.uid}`);
    }
    throw err;
  }
  throw new FirebasePortalError('User profile not found in database.', 404);
}

async function isUidAdmin(fbUser: FirebaseUser): Promise<boolean> {
  if (fbUser.emailVerified && fbUser.email?.toLowerCase() === 'admin@avenorlegacy.com') {
    return true;
  }
  try {
    const adminSnap = await getDoc(doc(db, 'admins', fbUser.uid));
    return adminSnap.exists();
  } catch {
    return false;
  }
}

async function writeActivityLog(
  actor: Pick<UserProfile, 'id' | 'fullName' | 'role'>,
  action: string,
  details: string
): Promise<void> {
  const logId = makeId('act');
  try {
    await setDoc(doc(db, 'activity_logs', logId), {
      id: logId,
      actorId: actor.id,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: action.slice(0, 80),
      details: details.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    if (isFirebaseSdkError(err)) {
      handleFirestoreError(err, OperationType.CREATE, `activity_logs/${logId}`);
    }
  }
}

async function createNotification(params: {
  recipientRole: UserRole | 'user';
  recipientUserId: string | null;
  type: NotificationItem['type'];
  title: string;
  message: string;
  referenceId?: string | null;
}): Promise<void> {
  const ntfId = makeId('ntf');
  try {
    await setDoc(doc(db, 'notifications', ntfId), {
      id: ntfId,
      recipientRole: params.recipientRole,
      recipientUserId: params.recipientUserId,
      type: params.type.slice(0, 40),
      title: params.title.slice(0, 160),
      message: params.message.slice(0, 500),
      referenceId: params.referenceId ?? null,
      isRead: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    if (isFirebaseSdkError(err)) {
      handleFirestoreError(err, OperationType.CREATE, `notifications/${ntfId}`);
    }
  }
}

function mapVariantDoc(id: string, d: Record<string, unknown>): StockVariant {
  const availableQty = Math.max(0, Math.floor(Number(d.availableQty ?? 0)));
  const reservedQty = Math.max(0, Math.floor(Number(d.reservedQty ?? 0)));
  const totalQty = availableQty + reservedQty;
  const threshold = Math.max(1, Math.floor(Number(d.lowStockThreshold ?? LOW_STOCK_DEFAULT_THRESHOLD)));
  const avail = getStockAvailability(totalQty, reservedQty, threshold);
  return {
    id,
    productId: String(d.productId),
    productCode: String(d.productCode),
    productName: d.productName != null ? String(d.productName) : undefined,
    size: String(d.size),
    colour: String(d.colour),
    totalQty,
    reservedQty,
    availableQty: avail.availableQty,
    lowStockThreshold: threshold,
    status: avail.status,
    updatedAt: toIsoString(d.updatedAt),
  };
}

function mapMovementDoc(id: string, d: Record<string, unknown>): StockMovement {
  const movementType = String(d.movementType || 'add') as StockMovementType;
  const actionType = (d.actionType ||
    (movementType === 'initial'
      ? 'Initial'
      : movementType === 'add'
        ? 'Add'
        : movementType === 'reduce'
          ? 'Reduce'
          : movementType === 'reserve'
            ? 'Reserve'
            : movementType === 'release'
              ? 'Release'
              : 'Complete')) as StockActionLabel;

  const previousTotal = Number(d.previousTotal ?? 0);
  const newTotal = Number(d.newTotal ?? 0);
  const previousReserved = Number(d.previousReserved ?? 0);
  const newReserved = Number(d.newReserved ?? 0);
  const previousAvailable =
    d.previousAvailable !== undefined
      ? Number(d.previousAvailable)
      : Math.max(0, previousTotal - previousReserved);
  const newAvailable =
    d.newAvailable !== undefined
      ? Number(d.newAvailable)
      : Math.max(0, newTotal - newReserved);

  return {
    id,
    variantId: String(d.variantId),
    productId: d.productId ? String(d.productId) : undefined,
    productCode: String(d.productCode),
    productName: String(d.productName || d.productCode),
    size: String(d.size),
    colour: String(d.colour),
    actionType,
    movementType,
    quantityDelta: Number(d.quantityDelta ?? 0),
    previousAvailable,
    newAvailable,
    previousTotal,
    newTotal,
    previousReserved,
    newReserved,
    note: String(d.note ?? ''),
    actorId: String(d.actorId ?? ''),
    actorName: String(d.actorName ?? 'Admin'),
    orderId: d.orderId ? String(d.orderId) : null,
    clientRequestId: d.clientRequestId ? String(d.clientRequestId) : null,
    createdAt: toIsoString(d.createdAt),
  };
}

function mapProductDoc(id: string, d: Record<string, unknown>, cost?: number): Product {
  const p: Product = {
    id,
    productCode: String(d.productCode),
    productName: String(d.productName),
    category: String(d.category),
    description: String(d.description ?? ''),
    sellingPrice: Number(d.sellingPrice ?? 0),
    isActive: Boolean(d.isActive),
    imageUrl: d.imageUrl ? String(d.imageUrl) : null,
    createdAt: toIsoString(d.createdAt),
    updatedAt: toIsoString(d.updatedAt),
  };
  if (cost !== undefined) {
    p.productCost = cost;
  }
  return p;
}

function mapOrderDoc(id: string, d: Record<string, unknown>, includeCost: boolean): Order {
  return {
    id,
    orderId: String(d.orderId),
    staffId: String(d.staffId),
    staffName: String(d.staffName),
    customerName: String(d.customerName),
    contactNumber: String(d.contactNumber),
    deliveryAddress: String(d.deliveryAddress),
    productId: d.productId ? String(d.productId) : null,
    productCode: String(d.productCode),
    productName: String(d.productName),
    size: String(d.size),
    colour: String(d.colour),
    quantity: Number(d.quantity ?? 1),
    unitCostSnapshot: includeCost ? Number(d.unitCostSnapshot ?? 0) : 0,
    unitPriceSnapshot: Number(d.unitPriceSnapshot ?? 0),
    totalPrice: Number(d.totalPrice ?? 0),
    note: String(d.note ?? ''),
    status: String(d.status) as OrderStatus,
    rejectionReason: d.rejectionReason ? String(d.rejectionReason) : null,
    stockReserved: Boolean(d.stockReserved),
    reservedVariantId: d.reservedVariantId ? String(d.reservedVariantId) : null,
    isUnlistedProduct: Boolean(d.isUnlistedProduct),
    createdAt: toIsoString(d.createdAt),
    updatedAt: toIsoString(d.updatedAt),
  };
}

async function resolveVerifiedSessionUser(
  fbUser: FirebaseUser,
  targetPortal: 'admin' | 'staff'
): Promise<UserProfile> {
  if (!fbUser.emailVerified) {
    try {
      await sendEmailVerification(fbUser);
    } catch {
      // ignore resend throttle
    }
    await signOut(auth);
    throw new FirebasePortalError(
      'Please verify your email address (a verification link has been sent) or use Google Sign-In.',
      403
    );
  }

  const adminCheck = await isUidAdmin(fbUser);
  const userRef = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(userRef);

  if (adminCheck) {
    if (targetPortal === 'staff') {
      await signOut(auth);
      throw new FirebasePortalError(
        'Administrator accounts must sign in through the Admin Portal.',
        403
      );
    }
    if (!snap.exists()) {
      const displayName = (fbUser.displayName || 'Main Admin').trim().slice(0, 120);
      const email = (fbUser.email || 'admin@avenorlegacy.com').toLowerCase();
      await setDoc(doc(db, 'admins', fbUser.uid), {
        uid: fbUser.uid,
        email,
        fullName: displayName,
        createdAt: serverTimestamp(),
      });
      await setDoc(userRef, {
        id: fbUser.uid,
        fullName: displayName,
        email,
        role: 'admin',
        status: 'approved',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    const profile = await getCurrentUserProfile();
    await writeActivityLog(profile, 'USER_LOGIN', 'Signed in via Admin Portal (Firebase).');
    return profile;
  }

  if (targetPortal === 'admin') {
    await signOut(auth);
    throw new FirebasePortalError(
      'This account does not have Administrator portal access. Public admin registration is disabled.',
      403
    );
  }

  if (!snap.exists()) {
    const fullName = (fbUser.displayName || fbUser.email?.split('@')[0] || 'Staff Advisor')
      .trim()
      .slice(0, 120);
    const email = (fbUser.email || '').toLowerCase();
    await setDoc(userRef, {
      id: fbUser.uid,
      fullName: fullName.length >= 2 ? fullName : `${fullName} Advisor`,
      email,
      role: 'staff',
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await writeActivityLog(
      { id: fbUser.uid, fullName, role: 'staff' },
      'STAFF_REGISTERED',
      `Registered staff account (${email}) pending admin approval.`
    );
    await createNotification({
      recipientRole: 'admin',
      recipientUserId: null,
      type: 'staff_signup',
      title: 'New Staff Registration Request',
      message: `${fullName} (${email}) signed up and awaits your approval.`,
      referenceId: fbUser.uid,
    });
    await signOut(auth);
    throw new FirebasePortalError(
      'Your staff registration has been recorded and is pending Main Admin approval.',
      403,
      'pending'
    );
  }

  const profile = await getCurrentUserProfile();
  if (profile.role === 'admin') {
    await signOut(auth);
    throw new FirebasePortalError(
      'Administrator accounts must sign in through the Admin Portal.',
      403
    );
  }

  if (profile.status !== 'approved') {
    await signOut(auth);
    throw new FirebasePortalError(
      profile.status === 'pending'
        ? 'Your staff account is pending administrator approval. Please wait for confirmation.'
        : `Your account has been ${profile.status}. Access to protected portals is disabled.`,
      403,
      profile.status
    );
  }

  await writeActivityLog(profile, 'USER_LOGIN', 'Signed in via Staff Portal (Firebase).');
  return profile;
}

export const firebaseAuthService = {
  async loginWithGoogle(portal: 'admin' | 'staff'): Promise<{ user: UserProfile }> {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = await resolveVerifiedSessionUser(cred.user, portal);
      return { user };
    } catch (err) {
      if (err instanceof FirebasePortalError) throw err;
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user') {
        throw new FirebasePortalError('Google sign-in popup was closed before completion.', 400);
      }
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.GET, 'users');
      }
      throw new FirebasePortalError(
        err instanceof Error ? err.message : 'Google sign-in failed.',
        401
      );
    }
  },

  async loginWithEmail(payload: {
    email: string;
    password: string;
    portal: 'admin' | 'staff';
  }): Promise<{ user: UserProfile }> {
    try {
      const cred = await signInWithEmailAndPassword(auth, payload.email.trim(), payload.password);
      const user = await resolveVerifiedSessionUser(cred.user, payload.portal);
      return { user };
    } catch (err) {
      if (err instanceof FirebasePortalError) throw err;
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed' || String((err as Error)?.message).includes('PASSWORD_LOGIN_DISABLED')) {
        throw new FirebasePortalError(
          'Email/Password sign-in is not enabled yet in your Firebase project (numeric-arena-515301-v1). Enable Email/Password in Firebase Console → Authentication → Sign-in method, or use "Continue with Google" below.',
          400,
          undefined,
          'auth/operation-not-allowed'
        );
      }
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        throw new FirebasePortalError('Invalid email or password.', 401);
      }
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.GET, 'users');
      }
      throw new FirebasePortalError(
        err instanceof Error ? err.message : 'Unable to sign in.',
        401
      );
    }
  },

  async registerStaff(payload: {
    fullName: string;
    email: string;
    password: string;
  }): Promise<{ message: string; status: AccountStatus }> {
    const cleanName = payload.fullName.trim();
    const cleanEmail = payload.email.trim().toLowerCase();
    if (cleanName.length < 2) {
      throw new FirebasePortalError('Full name must be at least 2 characters.', 400);
    }
    if (payload.password.length < 8) {
      throw new FirebasePortalError('Password must be at least 8 characters.', 400);
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, payload.password);
      try {
        await sendEmailVerification(cred.user);
      } catch {
        // ignore if verification email fails
      }
      if (cred.user.emailVerified) {
        await setDoc(doc(db, 'users', cred.user.uid), {
          id: cred.user.uid,
          fullName: cleanName.slice(0, 120),
          email: cleanEmail,
          role: 'staff',
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await createNotification({
          recipientRole: 'admin',
          recipientUserId: null,
          type: 'staff_signup',
          title: 'New Staff Registration Request',
          message: `${cleanName} (${cleanEmail}) registered and awaits your approval.`,
          referenceId: cred.user.uid,
        });
      }
      await signOut(auth);
      return {
        message:
          'Staff registration submitted. Verify your email address and await Main Admin approval before signing in.',
        status: 'pending',
      };
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        throw new FirebasePortalError(
          'Email/Password sign-up is currently disabled in Firebase Auth. Please enable Email/Password in Firebase Console → Authentication → Sign-in method, or register using "Continue with Google".',
          400,
          undefined,
          'auth/operation-not-allowed'
        );
      }
      if (code === 'auth/email-already-in-use') {
        throw new FirebasePortalError('An account with this email already exists.', 409);
      }
      throw new FirebasePortalError(
        err instanceof Error ? err.message : 'Staff registration failed.',
        400
      );
    }
  },

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return {
        message: 'If an account matches this email, a Firebase password reset link has been sent.',
      };
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        throw new FirebasePortalError(
          'Email/Password provider is currently disabled in Firebase Console.',
          400
        );
      }
      throw new FirebasePortalError(
        err instanceof Error ? err.message : 'Failed to send password reset email.',
        400
      );
    }
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const user = auth.currentUser;
    if (!user || !user.email) {
      throw new FirebasePortalError('No password-based Firebase session active.', 400);
    }
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      return { message: 'Password updated successfully.' };
    } catch (err) {
      throw new FirebasePortalError(
        err instanceof Error ? err.message : 'Unable to update password.',
        400
      );
    }
  },

  async logout(): Promise<void> {
    await signOut(auth);
  },

  async getSessionProfile(): Promise<UserProfile | null> {
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) return null;
    try {
      const profile = await getCurrentUserProfile();
      if (profile.status !== 'approved') return null;
      return profile;
    } catch {
      return null;
    }
  },
};

export const firebaseProductsService = {
  async list(): Promise<{ products: Product[] }> {
    const actor = await getCurrentUserProfile();
    const isAdmin = actor.role === 'admin';
    try {
      const prodQuery = isAdmin
        ? query(collection(db, 'products'), orderBy('createdAt', 'desc'))
        : query(collection(db, 'products'), where('isActive', '==', true));

      const [prodSnap, varSnap, costSnap] = await Promise.all([
        getDocs(prodQuery),
        getDocs(collection(db, 'stock_variants')),
        isAdmin ? getDocs(collection(db, 'product_costs')) : Promise.resolve(null),
      ]);

      const costMap = new Map<string, number>();
      if (costSnap) {
        costSnap.forEach((docSnap) => {
          costMap.set(docSnap.id, Number(docSnap.data().productCost ?? 0));
        });
      }

      const variantsByProduct = new Map<string, StockVariant[]>();
      varSnap.forEach((docSnap) => {
        const mapped = mapVariantDoc(docSnap.id, docSnap.data());
        const arr = variantsByProduct.get(mapped.productId) ?? [];
        arr.push(mapped);
        variantsByProduct.set(mapped.productId, arr);
      });

      const products: Product[] = [];
      prodSnap.forEach((docSnap) => {
        const p = mapProductDoc(
          docSnap.id,
          docSnap.data(),
          isAdmin ? (costMap.get(docSnap.id) ?? 0) : undefined
        );
        p.variants = (variantsByProduct.get(p.id) ?? []).sort(
          (a, b) => a.size.localeCompare(b.size) || a.colour.localeCompare(b.colour)
        );
        products.push(p);
      });

      products.sort((a, b) =>
        isAdmin
          ? b.createdAt.localeCompare(a.createdAt)
          : a.productName.localeCompare(b.productName)
      );
      return { products };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'products');
      }
      throw err;
    }
  },

  async create(payload: {
    productCode: string;
    productName: string;
    category: string;
    description: string;
    productCost: number;
    sellingPrice: number;
    isActive: boolean;
    imageUrl?: string | null;
    initialVariants?: { size: string; colour: string; quantity: number; lowStockThreshold?: number }[];
  }): Promise<{ product: Product }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') {
      throw new FirebasePortalError('Administrator privileges required.', 403);
    }

    const code = payload.productCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
    const name = payload.productName.trim();
    const cat = (payload.category || 'Menswear').trim();
    const desc = (payload.description || '').trim();
    const cost = Number(payload.productCost);
    const price = Number(payload.sellingPrice);
    const active = payload.isActive ?? true;
    const img = payload.imageUrl?.trim() ? payload.imageUrl.trim() : null;

    if (code.length < 2 || code.length > 64) {
      throw new FirebasePortalError('Product Code is required (2-64 uppercase alphanumeric characters).', 400);
    }
    if (name.length < 2 || name.length > 160) {
      throw new FirebasePortalError('Product Name is required (2-160 characters).', 400);
    }
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price <= 0) {
      throw new FirebasePortalError('Valid non-negative Product Cost and positive Selling Price (BDT) are required.', 400);
    }

    try {
      const dupSnap = await getDocs(
        query(collection(db, 'products'), where('productCode', '==', code), limit(1))
      );
      if (!dupSnap.empty) {
        throw new FirebasePortalError(`Product Code "${code}" already exists.`, 409);
      }

      const productId = makeId('prd');
      const createdProduct = await runTransaction(db, async (tx) => {
        const prodRef = doc(db, 'products', productId);
        const costRef = doc(db, 'product_costs', productId);
        const prodData: Record<string, unknown> = {
          id: productId,
          productCode: code,
          productName: name,
          category: cat,
          description: desc.slice(0, 1000),
          sellingPrice: price,
          isActive: Boolean(active),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (img) {
          prodData.imageUrl = img;
        }
        tx.set(prodRef, prodData);
        tx.set(costRef, {
          productId,
          productCost: cost,
          updatedAt: serverTimestamp(),
        });

        const seenVariantIds = new Set<string>();
        const initialVars: StockVariant[] = [];
        if (Array.isArray(payload.initialVariants)) {
          for (const rawVar of payload.initialVariants) {
            const size = normalizeVariantLabel(rawVar.size || '');
            const colour = normalizeVariantLabel(rawVar.colour || '');
            const qty = Number(rawVar.quantity ?? 0);
            const threshold = Math.max(1, Math.floor(Number(rawVar.lowStockThreshold ?? LOW_STOCK_DEFAULT_THRESHOLD)));
            if (!size || !colour || !Number.isInteger(qty) || qty < 0) continue;

            const variantId = buildDeterministicVariantId(productId, size, colour);
            if (seenVariantIds.has(variantId)) continue;
            seenVariantIds.add(variantId);

            const avail = getStockAvailability(qty, 0, threshold);
            tx.set(doc(db, 'stock_variants', variantId), {
              id: variantId,
              productId,
              productCode: code,
              productName: name,
              size,
              colour,
              sizeNorm: normalizeVariantKey(size),
              colourNorm: normalizeVariantKey(colour),
              availableQty: qty,
              reservedQty: 0,
              totalQty: qty,
              lowStockThreshold: threshold,
              status: avail.status,
              updatedAt: serverTimestamp(),
            });

            if (qty > 0) {
              const movId = makeId('mov');
              tx.set(doc(db, 'stock_movements', movId), {
                id: movId,
                variantId,
                productId,
                productCode: code,
                productName: name,
                size,
                colour,
                actionType: 'Initial',
                movementType: 'initial',
                quantityDelta: qty,
                previousAvailable: 0,
                newAvailable: qty,
                previousTotal: 0,
                newTotal: qty,
                previousReserved: 0,
                newReserved: 0,
                note: 'Initial product stock',
                actorId: actor.id,
                actorName: actor.fullName,
                createdAt: serverTimestamp(),
              });
            }

            initialVars.push({
              id: variantId,
              productId,
              productCode: code,
              productName: name,
              size,
              colour,
              totalQty: qty,
              reservedQty: 0,
              availableQty: qty,
              lowStockThreshold: threshold,
              status: avail.status,
              updatedAt: new Date().toISOString(),
            });
          }
        }

        return {
          id: productId,
          productCode: code,
          productName: name,
          category: cat,
          description: desc,
          productCost: cost,
          sellingPrice: price,
          isActive: Boolean(active),
          imageUrl: img,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          variants: initialVars,
        } satisfies Product;
      });

      await writeActivityLog(actor, 'PRODUCT_CREATED', `Created product ${code} (${name}) at ৳${price}.`);
      return { product: createdProduct };
    } catch (err) {
      if (err instanceof FirebasePortalError) throw err;
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.WRITE, 'products');
      }
      throw err;
    }
  },

  async update(
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
  ): Promise<{ product: Product }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') {
      throw new FirebasePortalError('Administrator privileges required.', 403);
    }

    try {
      const prodRef = doc(db, 'products', id);
      const costRef = doc(db, 'product_costs', id);
      const updated = await runTransaction(db, async (tx) => {
        const snap = await tx.get(prodRef);
        if (!snap.exists()) {
          throw new FirebasePortalError('Product not found.', 404);
        }
        const costSnap = await tx.get(costRef);
        const cur = snap.data();
        const curCost = costSnap.exists() ? Number(costSnap.data().productCost ?? 0) : 0;

        const nextName = payload.productName !== undefined ? payload.productName.trim() : String(cur.productName);
        const nextCat = payload.category !== undefined ? payload.category.trim() : String(cur.category);
        const nextDesc = payload.description !== undefined ? payload.description.trim() : String(cur.description ?? '');
        const nextPrice = payload.sellingPrice !== undefined ? Number(payload.sellingPrice) : Number(cur.sellingPrice);
        const nextCost = payload.productCost !== undefined ? Number(payload.productCost) : curCost;
        const nextActive = payload.isActive !== undefined ? Boolean(payload.isActive) : Boolean(cur.isActive);
        const nextImg =
          payload.imageUrl !== undefined
            ? payload.imageUrl?.trim()
              ? payload.imageUrl.trim()
              : null
            : (cur.imageUrl ? String(cur.imageUrl) : null);

        if (!nextName || !Number.isFinite(nextCost) || nextCost < 0 || !Number.isFinite(nextPrice) || nextPrice <= 0) {
          throw new FirebasePortalError('Invalid product name, cost, or selling price.', 400);
        }

        const updateData: Record<string, unknown> = {
          productName: nextName,
          category: nextCat,
          description: nextDesc.slice(0, 1000),
          sellingPrice: nextPrice,
          isActive: nextActive,
          imageUrl: nextImg,
          updatedAt: serverTimestamp(),
        };
        tx.update(prodRef, updateData);
        if (costSnap.exists()) {
          tx.update(costRef, { productCost: nextCost, updatedAt: serverTimestamp() });
        } else {
          tx.set(costRef, { productId: id, productCost: nextCost, updatedAt: serverTimestamp() });
        }

        return mapProductDoc(id, { ...cur, ...updateData }, nextCost);
      });

      await writeActivityLog(
        actor,
        'PRODUCT_UPDATED',
        `Updated product ${updated.productCode} (Price: ৳${updated.sellingPrice}, Active: ${updated.isActive}).`
      );
      return { product: updated };
    } catch (err) {
      if (err instanceof FirebasePortalError) throw err;
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `products/${id}`);
      }
      throw err;
    }
  },

  async createFromOrder(
    orderDocId: string,
    payload: {
      productCode: string;
      productName: string;
      category: string;
      description: string;
      productCost: number;
      sellingPrice: number;
      initialStockQty: number;
    }
  ): Promise<{ product: Product; order: Order }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') {
      throw new FirebasePortalError('Administrator privileges required.', 403);
    }

    const code = payload.productCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
    const name = payload.productName.trim();
    const cat = (payload.category || 'Bespoke Menswear').trim();
    const desc = (payload.description || '').trim();
    const cost = Number(payload.productCost);
    const price = Number(payload.sellingPrice);
    const initQty = Math.max(0, Math.floor(Number(payload.initialStockQty || 0)));

    if (!code || code.length < 2 || !name || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price <= 0) {
      throw new FirebasePortalError('Valid product code, name, cost, and positive selling price are required.', 400);
    }

    try {
      const dupSnap = await getDocs(
        query(collection(db, 'products'), where('productCode', '==', code), limit(1))
      );
      if (!dupSnap.empty) {
        throw new FirebasePortalError(`Product code "${code}" already exists in the catalog.`, 409);
      }

      const productId = makeId('prd');
      const result = await runTransaction(db, async (tx) => {
        const orderRef = doc(db, 'orders', orderDocId);
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) {
          throw new FirebasePortalError('Order not found.', 404);
        }
        const orderData = orderSnap.data();
        const size = normalizeVariantLabel(String(orderData.size));
        const colour = normalizeVariantLabel(String(orderData.colour));
        const variantId = buildDeterministicVariantId(productId, size, colour);

        tx.set(doc(db, 'products', productId), {
          id: productId,
          productCode: code,
          productName: name,
          category: cat,
          description: desc.slice(0, 1000),
          sellingPrice: price,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        tx.set(doc(db, 'product_costs', productId), {
          productId,
          productCost: cost,
          updatedAt: serverTimestamp(),
        });

        const avail = getStockAvailability(initQty, 0, LOW_STOCK_DEFAULT_THRESHOLD);
        tx.set(doc(db, 'stock_variants', variantId), {
          id: variantId,
          productId,
          productCode: code,
          productName: name,
          size,
          colour,
          sizeNorm: normalizeVariantKey(size),
          colourNorm: normalizeVariantKey(colour),
          availableQty: initQty,
          reservedQty: 0,
          totalQty: initQty,
          lowStockThreshold: LOW_STOCK_DEFAULT_THRESHOLD,
          status: avail.status,
          updatedAt: serverTimestamp(),
        });

        if (initQty > 0) {
          const movId = makeId('mov');
          tx.set(doc(db, 'stock_movements', movId), {
            id: movId,
            variantId,
            productId,
            productCode: code,
            productName: name,
            size,
            colour,
            actionType: 'Initial',
            movementType: 'initial',
            quantityDelta: initQty,
            previousAvailable: 0,
            newAvailable: initQty,
            previousTotal: 0,
            newTotal: initQty,
            previousReserved: 0,
            newReserved: 0,
            note: `Created from Order ${orderData.orderId}`,
            actorId: actor.id,
            actorName: actor.fullName,
            orderId: String(orderData.orderId),
            createdAt: serverTimestamp(),
          });
        }

        const orderQty = Number(orderData.quantity ?? 1);
        const totalPrice = calculateOrderTotal(price, orderQty);
        tx.update(orderRef, {
          productId,
          productCode: code,
          productName: name,
          unitCostSnapshot: cost,
          unitPriceSnapshot: price,
          totalPrice,
          isUnlistedProduct: false,
          updatedAt: serverTimestamp(),
        });

        const product = mapProductDoc(
          productId,
          {
            productCode: code,
            productName: name,
            category: cat,
            description: desc,
            sellingPrice: price,
            isActive: true,
          },
          cost
        );
        const order = mapOrderDoc(
          orderDocId,
          {
            ...orderData,
            productId,
            productCode: code,
            productName: name,
            unitCostSnapshot: cost,
            unitPriceSnapshot: price,
            totalPrice,
            isUnlistedProduct: false,
          },
          true
        );

        return { product, order };
      });

      await writeActivityLog(
        actor,
        'PRODUCT_CREATED_FROM_ORDER',
        `Created product ${code} from order ${result.order.orderId} with initial stock ${initQty}.`
      );
      return result;
    } catch (err) {
      if (err instanceof FirebasePortalError) throw err;
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.WRITE, 'products');
      }
      throw err;
    }
  },
};

export const firebaseStockService = {
  async list(): Promise<{ variants: StockVariant[]; movements: StockMovement[] }> {
    const actor = await getCurrentUserProfile();
    const isAdmin = actor.role === 'admin';
    try {
      const [varSnap, movSnap] = await Promise.all([
        getDocs(collection(db, 'stock_variants')),
        isAdmin
          ? getDocs(query(collection(db, 'stock_movements'), orderBy('createdAt', 'desc'), limit(200)))
          : Promise.resolve(null),
      ]);

      const variants: StockVariant[] = [];
      varSnap.forEach((docSnap) => {
        variants.push(mapVariantDoc(docSnap.id, docSnap.data()));
      });
      variants.sort(
        (a, b) =>
          a.productCode.localeCompare(b.productCode) ||
          a.size.localeCompare(b.size) ||
          a.colour.localeCompare(b.colour)
      );

      const movements: StockMovement[] = [];
      if (movSnap) {
        movSnap.forEach((docSnap) => {
          movements.push(mapMovementDoc(docSnap.id, docSnap.data()));
        });
      }

      return { variants, movements };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'stock_variants');
      }
      throw err;
    }
  },

  async adjust(payload: {
    productId: string;
    size: string;
    colour: string;
    action: 'add' | 'reduce';
    quantity: number | string;
    lowStockThreshold?: number | string;
    note?: string;
    clientRequestId?: string;
  }): Promise<{ variant: StockVariant; movement: StockMovement; deduplicated: boolean }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') {
      throw new FirebasePortalError('Administrator privileges required.', 403);
    }

    const validation = validateStockAdjustmentInput({
      productId: payload.productId,
      size: payload.size,
      colour: payload.colour,
      action: payload.action,
      quantityRaw: payload.quantity,
      thresholdRaw: payload.lowStockThreshold,
    });

    if (validation.ok === false) {
      throw new FirebasePortalError(validation.error, 400);
    }

    const { productId, size, colour, action, quantity, lowStockThreshold } = validation;
    const variantId = buildDeterministicVariantId(productId, size, colour);
    const requestId =
      payload.clientRequestId && /^[a-zA-Z0-9_-]{8,128}$/.test(payload.clientRequestId)
        ? payload.clientRequestId
        : makeId('req');
    const cleanNote = typeof payload.note === 'string' && payload.note.trim() ? payload.note.trim().slice(0, 500) : `Manual ${action}`;

    try {
      const result = await runTransaction(db, async (tx) => {
        const prodRef = doc(db, 'products', productId);
        const variantRef = doc(db, 'stock_variants', variantId);
        const idemRef = doc(db, 'stock_idempotency', requestId);

        const [prodSnap, variantSnap, idemSnap] = await Promise.all([
          tx.get(prodRef),
          tx.get(variantRef),
          tx.get(idemRef),
        ]);

        if (!prodSnap.exists()) {
          throw new FirebasePortalError('Selected product was not found in Firestore.', 404);
        }

        const prodData = prodSnap.data();
        const productCode = String(prodData.productCode);
        const productName = String(prodData.productName);

        // Idempotency guard against duplicate submissions / network retries
        if (idemSnap.exists()) {
          const existingVariant = variantSnap.exists()
            ? mapVariantDoc(variantId, variantSnap.data())
            : mapVariantDoc(variantId, {
                productId,
                productCode,
                productName,
                size,
                colour,
                availableQty: 0,
                reservedQty: 0,
                lowStockThreshold,
              });
          return {
            variant: existingVariant,
            movement: {
              id: requestId,
              variantId,
              productId,
              productCode,
              productName,
              size,
              colour,
              actionType: action === 'add' ? 'Add' : 'Reduce',
              movementType: action,
              quantityDelta: action === 'add' ? quantity : -quantity,
              previousAvailable: existingVariant.availableQty,
              newAvailable: existingVariant.availableQty,
              previousTotal: existingVariant.totalQty,
              newTotal: existingVariant.totalQty,
              previousReserved: existingVariant.reservedQty,
              newReserved: existingVariant.reservedQty,
              note: cleanNote,
              actorId: actor.id,
              actorName: actor.fullName,
              clientRequestId: requestId,
              createdAt: new Date().toISOString(),
            } satisfies StockMovement,
            deduplicated: true,
          };
        }

        const currentState = variantSnap.exists()
          ? {
              availableQty: Number(variantSnap.data().availableQty ?? 0),
              reservedQty: Number(variantSnap.data().reservedQty ?? 0),
              totalQty: Number(variantSnap.data().totalQty ?? 0),
              lowStockThreshold: Number(variantSnap.data().lowStockThreshold ?? LOW_STOCK_DEFAULT_THRESHOLD),
            }
          : null;

        let outcome;
        try {
          outcome = computeManualStockAdjustment(
            currentState,
            action,
            quantity,
            lowStockThreshold
          );
        } catch (logicErr) {
          throw new FirebasePortalError(
            logicErr instanceof Error ? logicErr.message : 'Invalid stock adjustment.',
            400
          );
        }

        const variantPayload = {
          id: variantId,
          productId,
          productCode,
          productName,
          size: variantSnap.exists() ? String(variantSnap.data().size) : size,
          colour: variantSnap.exists() ? String(variantSnap.data().colour) : colour,
          sizeNorm: normalizeVariantKey(size),
          colourNorm: normalizeVariantKey(colour),
          availableQty: outcome.newAvailable,
          reservedQty: outcome.newReserved,
          totalQty: outcome.newTotal,
          lowStockThreshold: outcome.lowStockThreshold,
          status: outcome.status,
          updatedAt: serverTimestamp(),
        };

        if (variantSnap.exists()) {
          tx.update(variantRef, {
            productName: variantPayload.productName,
            availableQty: variantPayload.availableQty,
            reservedQty: variantPayload.reservedQty,
            totalQty: variantPayload.totalQty,
            lowStockThreshold: variantPayload.lowStockThreshold,
            status: variantPayload.status,
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.set(variantRef, variantPayload);
        }

        const movId = makeId('mov');
        const movPayload = {
          id: movId,
          variantId,
          productId,
          productCode,
          productName,
          size: variantPayload.size,
          colour: variantPayload.colour,
          actionType: outcome.actionType,
          movementType: outcome.movementType,
          quantityDelta: outcome.quantityDelta,
          previousAvailable: outcome.previousAvailable,
          newAvailable: outcome.newAvailable,
          previousTotal: outcome.previousTotal,
          newTotal: outcome.newTotal,
          previousReserved: outcome.previousReserved,
          newReserved: outcome.newReserved,
          note: cleanNote,
          actorId: actor.id,
          actorName: actor.fullName,
          clientRequestId: requestId,
          createdAt: serverTimestamp(),
        };
        tx.set(doc(db, 'stock_movements', movId), movPayload);

        tx.set(idemRef, {
          requestId,
          variantId,
          actorId: actor.id,
          createdAt: serverTimestamp(),
        });

        const updatedVariant = mapVariantDoc(variantId, {
          ...variantPayload,
          updatedAt: new Date().toISOString(),
        });
        const createdMovement = mapMovementDoc(movId, {
          ...movPayload,
          createdAt: new Date().toISOString(),
        });

        return { variant: updatedVariant, movement: createdMovement, deduplicated: false };
      });

      if (!result.deduplicated) {
        await writeActivityLog(
          actor,
          'STOCK_ADJUSTED',
          `${action === 'add' ? 'Added' : 'Reduced'} ${quantity} units for ${result.variant.productCode} (${result.variant.size}/${result.variant.colour}). Available: ${result.movement.previousAvailable} → ${result.movement.newAvailable}.`
        );

        const alertPrefix =
          result.variant.status === 'Not Available'
            ? 'Out of Stock Alert'
            : result.variant.status === 'Low Stock'
              ? 'Low Stock Alert'
              : 'Stock Updated';

        await createNotification({
          recipientRole: 'admin',
          recipientUserId: null,
          type: 'stock_update',
          title: `${alertPrefix}: ${result.variant.productCode}`,
          message: `${result.variant.size} · ${result.variant.colour} now has ${result.variant.availableQty} available (${result.variant.totalQty} total, ${result.variant.reservedQty} reserved).`,
          referenceId: result.variant.id,
        });
      }

      return result;
    } catch (err) {
      if (err instanceof FirebasePortalError) throw err;
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.WRITE, `stock_variants/${variantId}`);
      }
      throw err;
    }
  },
};

export const firebaseOrdersService = {
  async list(filters?: {
    staffId?: string;
    status?: string;
    productCode?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<{ orders: Order[] }> {
    const actor = await getCurrentUserProfile();
    const isAdmin = actor.role === 'admin';
    try {
      const q = isAdmin
        ? query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
        : query(collection(db, 'orders'), where('staffId', '==', actor.id));

      const snap = await getDocs(q);
      let orders: Order[] = [];
      snap.forEach((docSnap) => {
        orders.push(mapOrderDoc(docSnap.id, docSnap.data(), isAdmin));
      });
      orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      if (isAdmin && filters?.staffId) {
        orders = orders.filter((o) => o.staffId === filters.staffId);
      }
      if (filters?.status) {
        orders = orders.filter((o) => o.status === filters.status);
      }
      if (filters?.productCode) {
        const needle = filters.productCode.trim().toUpperCase();
        orders = orders.filter((o) => o.productCode.toUpperCase().includes(needle));
      }
      if (filters?.fromDate) {
        orders = orders.filter((o) => o.createdAt >= filters.fromDate!);
      }
      if (filters?.toDate) {
        orders = orders.filter((o) => o.createdAt <= `${filters.toDate!}T23:59:59.999Z`);
      }
      return { orders };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
      throw err;
    }
  },

  async create(payload: {
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
  }): Promise<{ order: Order }> {
    const actor = await getCurrentUserProfile();
    const customerName = payload.customerName.trim();
    const contactNumber = payload.contactNumber.trim();
    const deliveryAddress = payload.deliveryAddress.trim();
    const productCode = payload.productCode.trim().toUpperCase();
    const size = normalizeVariantLabel(payload.size);
    const colour = normalizeVariantLabel(payload.colour);
    const quantity = Number(payload.quantity);
    const note = (payload.note || '').trim().slice(0, 500);
    const allowUnlisted = Boolean(payload.isUnlistedProduct);

    try {
      let productDoc: { id: string; productName: string; sellingPrice: number; isActive: boolean } | null = null;
      if (!allowUnlisted) {
        const prodSnap = await getDocs(
          query(collection(db, 'products'), where('productCode', '==', productCode), limit(1))
        );
        if (!prodSnap.empty) {
          const d = prodSnap.docs[0].data();
          productDoc = {
            id: prodSnap.docs[0].id,
            productName: String(d.productName),
            sellingPrice: Number(d.sellingPrice),
            isActive: Boolean(d.isActive),
          };
        }
      }

      const effectiveProductName = productDoc ? productDoc.productName : payload.productName.trim();
      const validationErrors = validateOrderInput({
        customerName,
        contactNumber,
        deliveryAddress,
        productCode,
        productName: effectiveProductName,
        size,
        colour,
        quantity,
      });

      if (Object.keys(validationErrors).length > 0) {
        throw new FirebasePortalError(Object.values(validationErrors)[0], 400);
      }

      if (productDoc && !productDoc.isActive) {
        throw new FirebasePortalError(
          `Product "${productCode}" is currently inactive and cannot be ordered.`,
          400
        );
      }
      if (!productDoc && !allowUnlisted) {
        throw new FirebasePortalError(
          `Product Code "${productCode}" was not found in the active catalog.`,
          400
        );
      }

      const datePart = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const randSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
      const orderId = `AVL-${datePart}-${randSuffix}`;
      const id = makeId('ord');
      const unitPrice = productDoc ? productDoc.sellingPrice : 0;
      const totalPrice = productDoc ? calculateOrderTotal(unitPrice, quantity) : 0;
      const isUnlisted = !productDoc;

      await setDoc(doc(db, 'orders', id), {
        id,
        orderId,
        staffId: actor.id,
        staffName: actor.fullName,
        customerName,
        contactNumber,
        deliveryAddress,
        productId: productDoc ? productDoc.id : null,
        productCode,
        productName: effectiveProductName,
        size,
        colour,
        quantity,
        unitCostSnapshot: 0,
        unitPriceSnapshot: unitPrice,
        totalPrice,
        note,
        status: 'New Order',
        rejectionReason: null,
        stockReserved: false,
        reservedVariantId: null,
        isUnlistedProduct: isUnlisted,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await writeActivityLog(
        actor,
        'ORDER_PLACED',
        `Placed order ${orderId} for ${productCode} (${size}/${colour}) × ${quantity}.`
      );
      await createNotification({
        recipientRole: 'admin',
        recipientUserId: null,
        type: 'new_order',
        title: `New Order ${orderId}`,
        message: `${actor.fullName} submitted ${productCode} (${size}/${colour}) × ${quantity} for ${customerName}.`,
        referenceId: id,
      });

      return {
        order: mapOrderDoc(
          id,
          {
            id,
            orderId,
            staffId: actor.id,
            staffName: actor.fullName,
            customerName,
            contactNumber,
            deliveryAddress,
            productId: productDoc ? productDoc.id : null,
            productCode,
            productName: effectiveProductName,
            size,
            colour,
            quantity,
            unitCostSnapshot: 0,
            unitPriceSnapshot: unitPrice,
            totalPrice,
            note,
            status: 'New Order',
            rejectionReason: null,
            stockReserved: false,
            reservedVariantId: null,
            isUnlistedProduct: isUnlisted,
          },
          actor.role === 'admin'
        ),
      };
    } catch (err) {
      if (err instanceof FirebasePortalError) throw err;
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.CREATE, 'orders');
      }
      throw err;
    }
  },

  async updateStatus(
    orderDocId: string,
    targetStatus: OrderStatus,
    rejectionReason?: string
  ): Promise<{ order: Order }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') {
      throw new FirebasePortalError('Administrator privileges required.', 403);
    }

    const cleanReason = typeof rejectionReason === 'string' ? rejectionReason.trim() : '';

    try {
      const updatedOrder = await runTransaction(db, async (tx) => {
        const orderRef = doc(db, 'orders', orderDocId);
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists()) {
          throw new FirebasePortalError('Order not found.', 404);
        }

        const orderData = orderSnap.data();
        const currentStatus = String(orderData.status) as OrderStatus;
        const transition = canTransitionOrderStatus(currentStatus, targetStatus);
        if (!transition.allowed) {
          throw new FirebasePortalError(transition.reason || 'Invalid status transition.', 400);
        }

        const qty = Number(orderData.quantity);
        let stockReserved = Boolean(orderData.stockReserved);
        let reservedVariantId = orderData.reservedVariantId ? String(orderData.reservedVariantId) : null;
        let unitPriceSnapshot = Number(orderData.unitPriceSnapshot ?? 0);
        let unitCostSnapshot = Number(orderData.unitCostSnapshot ?? 0);
        let totalPrice = Number(orderData.totalPrice ?? 0);

        if (targetStatus === 'Rejected') {
          if (cleanReason.length < 3) {
            throw new FirebasePortalError(
              'A rejection reason (at least 3 characters) is required.',
              400
            );
          }

          if (stockReserved && reservedVariantId) {
            const varRef = doc(db, 'stock_variants', reservedVariantId);
            const varSnap = await tx.get(varRef);
            if (varSnap.exists()) {
              const vData = varSnap.data();
              const outcome = computeOrderStockTransition(
                {
                  availableQty: Number(vData.availableQty ?? 0),
                  reservedQty: Number(vData.reservedQty ?? 0),
                  totalQty: Number(vData.totalQty ?? 0),
                  lowStockThreshold: Number(vData.lowStockThreshold ?? LOW_STOCK_DEFAULT_THRESHOLD),
                },
                'release',
                qty
              );

              tx.update(varRef, {
                availableQty: outcome.newAvailable,
                reservedQty: outcome.newReserved,
                totalQty: outcome.newTotal,
                status: outcome.status,
                updatedAt: serverTimestamp(),
              });

              const movId = makeId('mov');
              tx.set(doc(db, 'stock_movements', movId), {
                id: movId,
                variantId: reservedVariantId,
                productId: String(vData.productId),
                productCode: String(orderData.productCode),
                productName: String(vData.productName || orderData.productName),
                size: String(vData.size),
                colour: String(vData.colour),
                actionType: outcome.actionType,
                movementType: outcome.movementType,
                quantityDelta: outcome.quantityDelta,
                previousAvailable: outcome.previousAvailable,
                newAvailable: outcome.newAvailable,
                previousTotal: outcome.previousTotal,
                newTotal: outcome.newTotal,
                previousReserved: outcome.previousReserved,
                newReserved: outcome.newReserved,
                note: `Released stock on rejection of ${orderData.orderId}`,
                actorId: actor.id,
                actorName: actor.fullName,
                orderId: String(orderData.orderId),
                createdAt: serverTimestamp(),
              });
            }
            stockReserved = false;
            reservedVariantId = null;
          }

          tx.update(orderRef, {
            status: 'Rejected',
            rejectionReason: cleanReason.slice(0, 500),
            stockReserved: false,
            reservedVariantId: null,
            updatedAt: serverTimestamp(),
          });

          return mapOrderDoc(
            orderDocId,
            {
              ...orderData,
              status: 'Rejected',
              rejectionReason: cleanReason,
              stockReserved: false,
              reservedVariantId: null,
            },
            true
          );
        }

        if (targetStatus === 'Confirmed') {
          if (!orderData.productId || Boolean(orderData.isUnlistedProduct)) {
            throw new FirebasePortalError(
              'This order contains an unlisted product code. Create the product in catalog before confirming.',
              409
            );
          }
          const productId = String(orderData.productId);
          const prodSnap = await tx.get(doc(db, 'products', productId));
          const costSnap = await tx.get(doc(db, 'product_costs', productId));
          if (!prodSnap.exists() || !prodSnap.data().isActive) {
            throw new FirebasePortalError(
              'Product is missing or inactive and cannot be confirmed.',
              409
            );
          }

          const prodData = prodSnap.data();
          if (unitPriceSnapshot <= 0) {
            unitPriceSnapshot = Number(prodData.sellingPrice ?? 0);
            totalPrice = calculateOrderTotal(unitPriceSnapshot, qty);
          }
          if (unitCostSnapshot <= 0 && costSnap.exists()) {
            unitCostSnapshot = Number(costSnap.data().productCost ?? 0);
          }
          if (unitPriceSnapshot <= 0) {
            throw new FirebasePortalError(
              'Product selling price must be greater than 0 BDT before confirmation.',
              409
            );
          }

          if (!stockReserved) {
            const variantId = buildDeterministicVariantId(
              productId,
              String(orderData.size),
              String(orderData.colour)
            );
            const varRef = doc(db, 'stock_variants', variantId);
            const varSnap = await tx.get(varRef);
            if (!varSnap.exists()) {
              throw new FirebasePortalError(
                `No stock record found for ${orderData.productCode} (${orderData.size} / ${orderData.colour}). Add stock before confirming.`,
                409
              );
            }

            const vData = varSnap.data();
            let outcome;
            try {
              outcome = computeOrderStockTransition(
                {
                  availableQty: Number(vData.availableQty ?? 0),
                  reservedQty: Number(vData.reservedQty ?? 0),
                  totalQty: Number(vData.totalQty ?? 0),
                  lowStockThreshold: Number(vData.lowStockThreshold ?? LOW_STOCK_DEFAULT_THRESHOLD),
                },
                'reserve',
                qty
              );
            } catch (logicErr) {
              throw new FirebasePortalError(
                logicErr instanceof Error ? logicErr.message : 'Insufficient available stock.',
                409
              );
            }

            tx.update(varRef, {
              availableQty: outcome.newAvailable,
              reservedQty: outcome.newReserved,
              totalQty: outcome.newTotal,
              status: outcome.status,
              updatedAt: serverTimestamp(),
            });

            const movId = makeId('mov');
            tx.set(doc(db, 'stock_movements', movId), {
              id: movId,
              variantId,
              productId,
              productCode: String(orderData.productCode),
              productName: String(vData.productName || prodData.productName || orderData.productName),
              size: String(vData.size),
              colour: String(vData.colour),
              actionType: outcome.actionType,
              movementType: outcome.movementType,
              quantityDelta: outcome.quantityDelta,
              previousAvailable: outcome.previousAvailable,
              newAvailable: outcome.newAvailable,
              previousTotal: outcome.previousTotal,
              newTotal: outcome.newTotal,
              previousReserved: outcome.previousReserved,
              newReserved: outcome.newReserved,
              note: `Reserved stock for order ${orderData.orderId}`,
              actorId: actor.id,
              actorName: actor.fullName,
              orderId: String(orderData.orderId),
              createdAt: serverTimestamp(),
            });

            stockReserved = true;
            reservedVariantId = variantId;
          }

          tx.update(orderRef, {
            status: 'Confirmed',
            unitCostSnapshot,
            unitPriceSnapshot,
            totalPrice,
            stockReserved: true,
            reservedVariantId,
            updatedAt: serverTimestamp(),
          });

          return mapOrderDoc(
            orderDocId,
            {
              ...orderData,
              status: 'Confirmed',
              unitCostSnapshot,
              unitPriceSnapshot,
              totalPrice,
              stockReserved: true,
              reservedVariantId,
            },
            true
          );
        }

        if (targetStatus === 'Completed') {
          if (!stockReserved || !reservedVariantId) {
            throw new FirebasePortalError(
              'Order stock must be reserved (Confirmed) before completion.',
              409
            );
          }

          const varRef = doc(db, 'stock_variants', reservedVariantId);
          const varSnap = await tx.get(varRef);
          if (!varSnap.exists()) {
            throw new FirebasePortalError('Reserved stock variant no longer exists.', 409);
          }

          const vData = varSnap.data();
          const outcome = computeOrderStockTransition(
            {
              availableQty: Number(vData.availableQty ?? 0),
              reservedQty: Number(vData.reservedQty ?? 0),
              totalQty: Number(vData.totalQty ?? 0),
              lowStockThreshold: Number(vData.lowStockThreshold ?? LOW_STOCK_DEFAULT_THRESHOLD),
            },
            'complete',
            qty
          );

          tx.update(varRef, {
            availableQty: outcome.newAvailable,
            reservedQty: outcome.newReserved,
            totalQty: outcome.newTotal,
            status: outcome.status,
            updatedAt: serverTimestamp(),
          });

          const movId = makeId('mov');
          tx.set(doc(db, 'stock_movements', movId), {
            id: movId,
            variantId: reservedVariantId,
            productId: String(vData.productId),
            productCode: String(orderData.productCode),
            productName: String(vData.productName || orderData.productName),
            size: String(vData.size),
            colour: String(vData.colour),
            actionType: outcome.actionType,
            movementType: outcome.movementType,
            quantityDelta: outcome.quantityDelta,
            previousAvailable: outcome.previousAvailable,
            newAvailable: outcome.newAvailable,
            previousTotal: outcome.previousTotal,
            newTotal: outcome.newTotal,
            previousReserved: outcome.previousReserved,
            newReserved: outcome.newReserved,
            note: `Fulfilled order ${orderData.orderId}`,
            actorId: actor.id,
            actorName: actor.fullName,
            orderId: String(orderData.orderId),
            createdAt: serverTimestamp(),
          });

          tx.update(orderRef, {
            status: 'Completed',
            stockReserved: false,
            updatedAt: serverTimestamp(),
          });

          return mapOrderDoc(
            orderDocId,
            {
              ...orderData,
              status: 'Completed',
              stockReserved: false,
            },
            true
          );
        }

        // Stock Checking, Processing, On Hold
        tx.update(orderRef, {
          status: targetStatus,
          updatedAt: serverTimestamp(),
        });

        return mapOrderDoc(orderDocId, { ...orderData, status: targetStatus }, true);
      });

      const notifType: NotificationItem['type'] =
        targetStatus === 'Confirmed'
          ? 'order_confirmed'
          : targetStatus === 'Rejected'
            ? 'order_rejected'
            : targetStatus === 'Completed'
              ? 'order_completed'
              : 'order_status';

      await createNotification({
        recipientRole: 'user',
        recipientUserId: updatedOrder.staffId,
        type: notifType,
        title: `Order ${updatedOrder.orderId}: ${targetStatus}`,
        message:
          targetStatus === 'Rejected'
            ? `Order ${updatedOrder.orderId} was rejected. Reason: ${updatedOrder.rejectionReason}`
            : `Your order ${updatedOrder.orderId} (${updatedOrder.productCode}) moved to "${targetStatus}".`,
        referenceId: updatedOrder.id,
      });

      await writeActivityLog(
        actor,
        'ORDER_STATUS_UPDATED',
        `Order ${updatedOrder.orderId} transitioned to ${targetStatus}.`
      );
      return { order: updatedOrder };
    } catch (err) {
      if (err instanceof FirebasePortalError) throw err;
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderDocId}`);
      }
      throw err;
    }
  },
};

export const firebaseStaffService = {
  async list(): Promise<{ staff: UserProfile[]; activityLogs: ActivityLog[] }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') {
      throw new FirebasePortalError('Administrator privileges required.', 403);
    }
    try {
      const [usersSnap, ordersSnap, logsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'orders')),
        getDocs(query(collection(db, 'activity_logs'), orderBy('createdAt', 'desc'), limit(100))),
      ]);

      const statsMap = new Map<string, { count: number; sales: number }>();
      ordersSnap.forEach((docSnap) => {
        const d = docSnap.data();
        const staffId = String(d.staffId);
        const cur = statsMap.get(staffId) ?? { count: 0, sales: 0 };
        cur.count += 1;
        if (d.status === 'Completed') {
          cur.sales += Number(d.totalPrice ?? 0);
        }
        statsMap.set(staffId, cur);
      });

      const staff: UserProfile[] = [];
      usersSnap.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.role === 'staff') {
          const s = statsMap.get(docSnap.id) ?? { count: 0, sales: 0 };
          staff.push({
            id: docSnap.id,
            fullName: String(d.fullName),
            email: String(d.email),
            role: 'staff',
            status: String(d.status) as AccountStatus,
            createdAt: toIsoString(d.createdAt),
            updatedAt: toIsoString(d.updatedAt),
            orderCount: s.count,
            completedSales: s.sales,
          });
        }
      });

      const orderRank: Record<AccountStatus, number> = {
        pending: 0,
        approved: 1,
        suspended: 2,
        rejected: 3,
      };
      staff.sort(
        (a, b) => orderRank[a.status] - orderRank[b.status] || b.createdAt.localeCompare(a.createdAt)
      );

      const activityLogs: ActivityLog[] = [];
      logsSnap.forEach((docSnap) => {
        const d = docSnap.data();
        activityLogs.push({
          id: docSnap.id,
          actorId: String(d.actorId),
          actorName: String(d.actorName),
          actorRole: (d.actorRole === 'admin' ? 'admin' : 'staff') as UserRole,
          action: String(d.action),
          details: String(d.details),
          createdAt: toIsoString(d.createdAt),
        });
      });

      return { staff, activityLogs };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'users');
      }
      throw err;
    }
  },

  async updateStatus(
    id: string,
    status: 'approved' | 'rejected' | 'suspended'
  ): Promise<{ staff: UserProfile }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') {
      throw new FirebasePortalError('Administrator privileges required.', 403);
    }
    try {
      const ref = doc(db, 'users', id);
      const snap = await getDoc(ref);
      if (!snap.exists() || snap.data().role !== 'staff') {
        throw new FirebasePortalError('Staff member not found.', 404);
      }
      const d = snap.data();
      await updateDoc(ref, { status, updatedAt: serverTimestamp() });
      await writeActivityLog(
        actor,
        'STAFF_STATUS_CHANGED',
        `Changed staff "${d.fullName}" (${d.email}) status to ${status}.`
      );
      if (status === 'approved') {
        await createNotification({
          recipientRole: 'staff',
          recipientUserId: id,
          type: 'staff_signup',
          title: 'Staff Account Approved',
          message: `Welcome to AVENOR LEGACY, ${String(d.fullName)}. Your advisor account is now active.`,
          referenceId: id,
        });
      }
      return {
        staff: {
          id,
          fullName: String(d.fullName),
          email: String(d.email),
          role: 'staff',
          status,
          createdAt: toIsoString(d.createdAt),
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      if (err instanceof FirebasePortalError) throw err;
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${id}`);
      }
      throw err;
    }
  },
};

export const firebaseReadyTextsService = {
  async list(): Promise<{ templates: ReadyTextTemplate[] }> {
    const actor = await getCurrentUserProfile();
    const isAdmin = actor.role === 'admin';
    try {
      const q = isAdmin
        ? query(collection(db, 'ready_texts'))
        : query(collection(db, 'ready_texts'), where('isActive', '==', true));
      let snap = await getDocs(q);

      if (isAdmin && snap.empty) {
        const batch = writeBatch(db);
        const defaults: { title: string; category: ReadyTextCategory; body: string }[] = [
          {
            title: 'Initial Order Acknowledgement',
            category: 'Order Received',
            body: 'Dear {customer_name}, thank you for choosing AVENOR LEGACY. We have received your order {order_id} for {product_code} ({total_price}). Our concierge team is verifying atelier availability.',
          },
          {
            title: 'Stock Reserved & Confirmed',
            category: 'Stock Confirmed',
            body: 'Dear {customer_name}, great news — your AVENOR LEGACY piece ({product_code}) for order {order_id} has been verified and reserved. Total payable: {total_price}.',
          },
          {
            title: 'Atelier Tailoring & Dispatch Prep',
            category: 'Processing',
            body: 'Dear {customer_name}, your AVENOR LEGACY order {order_id} ({product_code}) is now in bespoke finishing and packaging. Total amount: {total_price}.',
          },
          {
            title: 'Order Delivered & Completed',
            category: 'Completed',
            body: 'Dear {customer_name}, your AVENOR LEGACY order {order_id} for {product_code} ({total_price}) has been completed. Wear the Legacy.',
          },
          {
            title: 'Order Unavailable / Declined',
            category: 'Rejected',
            body: 'Dear {customer_name}, we regret to inform you that order {order_id} ({product_code}) could not be fulfilled at this time. Please reach out to your AVENOR LEGACY advisor for curated alternatives.',
          },
          {
            title: 'Courier Dispatch Update',
            category: 'Delivery Update',
            body: 'Dear {customer_name}, your order {order_id} ({product_code}) has been handed to our priority courier. Cash/Invoice total: {total_price}.',
          },
          {
            title: 'Post-Purchase Appreciation',
            category: 'Thank You',
            body: 'Thank you, {customer_name}, for wearing AVENOR LEGACY. We appreciate your patronage on order {order_id} ({product_code}, {total_price}).',
          },
        ];
        for (const item of defaults) {
          const rtId = makeId('rt');
          batch.set(doc(db, 'ready_texts', rtId), {
            id: rtId,
            title: item.title,
            category: item.category,
            body: item.body,
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        snap = await getDocs(q);
      }

      const templates: ReadyTextTemplate[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        templates.push({
          id: docSnap.id,
          title: String(d.title),
          category: String(d.category) as ReadyTextCategory,
          body: String(d.body),
          isActive: Boolean(d.isActive),
          createdAt: toIsoString(d.createdAt),
          updatedAt: toIsoString(d.updatedAt),
        });
      });
      templates.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
      return { templates };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'ready_texts');
      }
      throw err;
    }
  },

  async create(payload: {
    title: string;
    category: ReadyTextCategory;
    body: string;
    isActive: boolean;
  }): Promise<{ template: ReadyTextTemplate }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') throw new FirebasePortalError('Administrator privileges required.', 403);
    const id = makeId('rt');
    try {
      await setDoc(doc(db, 'ready_texts', id), {
        id,
        title: payload.title.trim(),
        category: payload.category,
        body: payload.body.trim(),
        isActive: Boolean(payload.isActive),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await writeActivityLog(actor, 'READY_TEXT_CREATED', `Created template "${payload.title.trim()}".`);
      return {
        template: {
          id,
          title: payload.title.trim(),
          category: payload.category,
          body: payload.body.trim(),
          isActive: Boolean(payload.isActive),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.CREATE, `ready_texts/${id}`);
      }
      throw err;
    }
  },

  async update(
    id: string,
    payload: Partial<{ title: string; category: ReadyTextCategory; body: string; isActive: boolean }>
  ): Promise<{ template: ReadyTextTemplate }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') throw new FirebasePortalError('Administrator privileges required.', 403);
    try {
      const ref = doc(db, 'ready_texts', id);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new FirebasePortalError('Template not found.', 404);
      const cur = snap.data();
      const next = {
        title: payload.title !== undefined ? payload.title.trim() : String(cur.title),
        category: (payload.category !== undefined ? payload.category : cur.category) as ReadyTextCategory,
        body: payload.body !== undefined ? payload.body.trim() : String(cur.body),
        isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : Boolean(cur.isActive),
      };
      await updateDoc(ref, { ...next, updatedAt: serverTimestamp() });
      await writeActivityLog(actor, 'READY_TEXT_UPDATED', `Updated template "${next.title}".`);
      return {
        template: {
          id,
          ...next,
          createdAt: toIsoString(cur.createdAt),
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      if (err instanceof FirebasePortalError) throw err;
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `ready_texts/${id}`);
      }
      throw err;
    }
  },

  async remove(id: string): Promise<{ ok: boolean }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') throw new FirebasePortalError('Administrator privileges required.', 403);
    try {
      await deleteDoc(doc(db, 'ready_texts', id));
      return { ok: true };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.DELETE, `ready_texts/${id}`);
      }
      throw err;
    }
  },
};

export const firebaseExpensesService = {
  async list(): Promise<{ expenses: Expense[] }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') throw new FirebasePortalError('Administrator privileges required.', 403);
    try {
      const snap = await getDocs(query(collection(db, 'expenses'), orderBy('expenseDate', 'desc')));
      const expenses: Expense[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        expenses.push({
          id: docSnap.id,
          title: String(d.title),
          category: String(d.category),
          amount: Number(d.amount),
          expenseDate: String(d.expenseDate),
          note: String(d.note ?? ''),
          createdById: String(d.createdById),
          createdByName: String(d.createdByName),
          createdAt: toIsoString(d.createdAt),
        });
      });
      return { expenses };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'expenses');
      }
      throw err;
    }
  },

  async create(payload: {
    title: string;
    category: string;
    amount: number;
    expenseDate: string;
    note?: string;
  }): Promise<{ expense: Expense }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') throw new FirebasePortalError('Administrator privileges required.', 403);
    const id = makeId('exp');
    const title = payload.title.trim();
    const amount = Number(payload.amount);
    if (!title || !Number.isFinite(amount) || amount <= 0) {
      throw new FirebasePortalError('Expense title and positive amount in BDT are required.', 400);
    }
    try {
      await setDoc(doc(db, 'expenses', id), {
        id,
        title,
        category: payload.category || 'Operations',
        amount,
        expenseDate: payload.expenseDate || new Date().toISOString().slice(0, 10),
        note: (payload.note || '').trim().slice(0, 500),
        createdById: actor.id,
        createdByName: actor.fullName,
        createdAt: serverTimestamp(),
      });
      await writeActivityLog(actor, 'EXPENSE_ADDED', `Logged expense "${title}" of ৳${amount}.`);
      return {
        expense: {
          id,
          title,
          category: payload.category || 'Operations',
          amount,
          expenseDate: payload.expenseDate,
          note: payload.note || '',
          createdById: actor.id,
          createdByName: actor.fullName,
          createdAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.CREATE, `expenses/${id}`);
      }
      throw err;
    }
  },

  async remove(id: string): Promise<{ ok: boolean }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') throw new FirebasePortalError('Administrator privileges required.', 403);
    try {
      await deleteDoc(doc(db, 'expenses', id));
      return { ok: true };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.DELETE, `expenses/${id}`);
      }
      throw err;
    }
  },
};

export const firebaseDashboardService = {
  async admin(): Promise<{
    metrics: AdminDashboardMetrics;
    recentOrders: Order[];
    lowStockVariants: StockVariant[];
  }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') throw new FirebasePortalError('Administrator privileges required.', 403);
    try {
      const [ordSnap, usrSnap, varSnap] = await Promise.all([
        getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'stock_variants')),
      ]);
      const orders: Order[] = [];
      ordSnap.forEach((docSnap) => orders.push(mapOrderDoc(docSnap.id, docSnap.data(), true)));
      const users: UserProfile[] = [];
      usrSnap.forEach((docSnap) => {
        const d = docSnap.data();
        users.push({
          id: docSnap.id,
          fullName: String(d.fullName),
          email: String(d.email),
          role: (d.role === 'admin' ? 'admin' : 'staff') as UserRole,
          status: String(d.status) as AccountStatus,
          createdAt: toIsoString(d.createdAt),
          updatedAt: toIsoString(d.updatedAt),
        });
      });
      const variants: StockVariant[] = [];
      varSnap.forEach((docSnap) => variants.push(mapVariantDoc(docSnap.id, docSnap.data())));
      const metrics = computeAdminMetrics(orders, users, variants);
      return {
        metrics,
        recentOrders: orders.slice(0, 8),
        lowStockVariants: variants.filter((v) => v.status !== 'Available').slice(0, 8),
      };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
      throw err;
    }
  },

  async staff() {
    const actor = await getCurrentUserProfile();
    try {
      const snap = await getDocs(
        query(collection(db, 'orders'), where('staffId', '==', actor.id))
      );
      const orders: Order[] = [];
      snap.forEach((docSnap) => orders.push(mapOrderDoc(docSnap.id, docSnap.data(), false)));
      orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const counts = {
        totalOrders: orders.length,
        newOrders: orders.filter((o) => o.status === 'New Order').length,
        stockChecking: orders.filter((o) => o.status === 'Stock Checking').length,
        confirmed: orders.filter((o) => o.status === 'Confirmed').length,
        processing: orders.filter((o) => o.status === 'Processing').length,
        completed: orders.filter((o) => o.status === 'Completed').length,
        rejected: orders.filter((o) => o.status === 'Rejected').length,
        onHold: orders.filter((o) => o.status === 'On Hold').length,
        completedSales: orders
          .filter((o) => o.status === 'Completed')
          .reduce((acc, o) => acc + o.totalPrice, 0),
      };
      return { counts, recentOrders: orders.slice(0, 8) };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
      throw err;
    }
  },

  async reports(period: ReportPeriod): Promise<{ report: FinancialReportSummary }> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') throw new FirebasePortalError('Administrator privileges required.', 403);
    try {
      const [ordSnap, expSnap] = await Promise.all([
        getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'expenses')),
      ]);
      const orders: Order[] = [];
      ordSnap.forEach((docSnap) => orders.push(mapOrderDoc(docSnap.id, docSnap.data(), true)));
      const expenses: Expense[] = [];
      expSnap.forEach((docSnap) => {
        const d = docSnap.data();
        expenses.push({
          id: docSnap.id,
          title: String(d.title),
          category: String(d.category),
          amount: Number(d.amount),
          expenseDate: String(d.expenseDate),
          note: String(d.note ?? ''),
          createdById: String(d.createdById),
          createdByName: String(d.createdByName),
          createdAt: toIsoString(d.createdAt),
        });
      });
      return { report: computeFinancialReport(orders, expenses, period) };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
      throw err;
    }
  },

  async exportCsv(period: ReportPeriod): Promise<string> {
    const actor = await getCurrentUserProfile();
    if (actor.role !== 'admin') throw new FirebasePortalError('Administrator privileges required.', 403);
    try {
      const [ordSnap, expSnap] = await Promise.all([
        getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'expenses')),
      ]);
      const orders: Order[] = [];
      ordSnap.forEach((docSnap) => orders.push(mapOrderDoc(docSnap.id, docSnap.data(), true)));
      const expenses: Expense[] = [];
      expSnap.forEach((docSnap) => {
        const d = docSnap.data();
        expenses.push({
          id: docSnap.id,
          title: String(d.title),
          category: String(d.category),
          amount: Number(d.amount),
          expenseDate: String(d.expenseDate),
          note: String(d.note ?? ''),
          createdById: String(d.createdById),
          createdByName: String(d.createdByName),
          createdAt: toIsoString(d.createdAt),
        });
      });
      const report = computeFinancialReport(orders, expenses, period);
      return buildReportsCsv(report, orders);
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'orders');
      }
      throw err;
    }
  },
};

export const firebaseNotificationsService = {
  async list(): Promise<{ notifications: NotificationItem[] }> {
    const actor = await getCurrentUserProfile();
    try {
      const q =
        actor.role === 'admin'
          ? query(collection(db, 'notifications'), where('recipientRole', '==', 'admin'), limit(100))
          : query(collection(db, 'notifications'), where('recipientUserId', '==', actor.id), limit(100));
      const snap = await getDocs(q);
      const list: NotificationItem[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          recipientRole: (d.recipientRole || 'admin') as UserRole | 'user',
          recipientUserId: d.recipientUserId ? String(d.recipientUserId) : null,
          type: String(d.type) as NotificationItem['type'],
          title: String(d.title),
          message: String(d.message),
          referenceId: d.referenceId ? String(d.referenceId) : null,
          isRead: Boolean(d.isRead),
          createdAt: toIsoString(d.createdAt),
        });
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { notifications: list };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.LIST, 'notifications');
      }
      throw err;
    }
  },

  subscribe(
    user: UserProfile,
    onData: (items: NotificationItem[]) => void
  ): Unsubscribe {
    const q =
      user.role === 'admin'
        ? query(collection(db, 'notifications'), where('recipientRole', '==', 'admin'), limit(100))
        : query(collection(db, 'notifications'), where('recipientUserId', '==', user.id), limit(100));
    return onSnapshot(
      q,
      (snap) => {
        const list: NotificationItem[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            recipientRole: (d.recipientRole || 'admin') as UserRole | 'user',
            recipientUserId: d.recipientUserId ? String(d.recipientUserId) : null,
            type: String(d.type) as NotificationItem['type'],
            title: String(d.title),
            message: String(d.message),
            referenceId: d.referenceId ? String(d.referenceId) : null,
            isRead: Boolean(d.isRead),
            createdAt: toIsoString(d.createdAt),
          });
        });
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        onData(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'notifications');
      }
    );
  },

  async markRead(id: string): Promise<{ ok: boolean }> {
    try {
      await updateDoc(doc(db, 'notifications', id), { isRead: true });
      return { ok: true };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
      }
      throw err;
    }
  },

  async markAllRead(): Promise<{ ok: boolean }> {
    const { notifications } = await firebaseNotificationsService.list();
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0) return { ok: true };
    try {
      const batch = writeBatch(db);
      for (const n of unread) {
        batch.update(doc(db, 'notifications', n.id), { isRead: true });
      }
      await batch.commit();
      return { ok: true };
    } catch (err) {
      if (isFirebaseSdkError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, 'notifications');
      }
      throw err;
    }
  },
};
