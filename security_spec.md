# AVENOR LEGACY — Firestore Security Specification (Phase 0)

## 1. Core Data Invariants
1. **Strict Role Isolation**:
   - Public users can ONLY create `users/{uid}` with `role == 'staff'` and `status == 'pending'`. They can NEVER self-assign `role == 'admin'` or `status == 'approved'`.
   - `product_costs/{productId}` (unit COGS) is isolated from `products/{productId}` and readable/writable ONLY by verified Admins.
   - `orders/{orderId}` contains customer PII (`customerName`, `contactNumber`, `deliveryAddress`) and is readable ONLY by verified Admins or the owning Staff member (`resource.data.staffId == request.auth.uid`).
2. **Inventory Conservation Law**:
   - For every `stock_variants/{variantId}` document:
     - `availableQty >= 0` (integer)
     - `reservedQty >= 0` (integer)
     - `totalQty == availableQty + reservedQty`
     - `lowStockThreshold >= 1`
     - `status == 'Not Available'` when `availableQty == 0`, `'Low Stock'` when `0 < availableQty <= lowStockThreshold`, and `'Available'` when `availableQty > lowStockThreshold`.
3. **Immutable Stock Movement Audit Ledger**:
   - `stock_movements/{movementId}` records are strictly append-only (`allow update, delete: if false;`).
   - Every movement creation requires `existsAfter(/databases/$(database)/documents/stock_variants/$(incoming().variantId))` to guarantee atomic pairing with a variant document.
4. **Duplicate Submission Protection**:
   - `stock_idempotency/{requestId}` locks each adjustment request ID inside the Firestore transaction (`allow update, delete: if false;`).
5. **Terminal Order State Locking**:
   - Once an order reaches `Completed` or `Rejected`, non-admin updates are blocked and `stockReserved` cannot remain `true`.
6. **Temporal Integrity**:
   - All `createdAt` fields must equal `request.time` on `create` and remain immutable on `update`; all `updatedAt` fields must equal `request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Fail)
1. **Self-Admin Escalation**: Staff creates `users/{uid}` with `{ role: 'admin', status: 'approved' }` -> `PERMISSION_DENIED`.
2. **Pending-to-Approved Bypass**: Staff updates own `users/{uid}` changing `status` from `'pending'` to `'approved'` -> `PERMISSION_DENIED`.
3. **Unverified Email Admin Spoof**: Token has `email: 'admin@avenorlegacy.com'` with `email_verified: false` -> `PERMISSION_DENIED`.
4. **Shadow Ghost Field Injection**: Admin or Staff writes `products/{id}` or `orders/{id}` with extra field `{ isFeatured: true }` -> `PERMISSION_DENIED`.
5. **Negative Available Stock**: Update `stock_variants/{id}` with `{ availableQty: -3, reservedQty: 0, totalQty: -3 }` -> `PERMISSION_DENIED`.
6. **Broken Total Formula**: Update `stock_variants/{id}` with `{ availableQty: 10, reservedQty: 2, totalQty: 10 }` (`10 != 10 + 2`) -> `PERMISSION_DENIED`.
7. **Stale Status Indicator Bypass**: Update `stock_variants/{id}` with `{ availableQty: 0, reservedQty: 0, totalQty: 0, status: 'Available' }` -> `PERMISSION_DENIED`.
8. **Audit Ledger Tampering / Deletion**: Attempt to `update` or `delete` any document in `stock_movements/{id}` -> `PERMISSION_DENIED`.
9. **Orphaned Stock Movement**: Create `stock_movements/{id}` referencing a non-existent `variantId` without an atomic `stock_variants` write -> `PERMISSION_DENIED`.
10. **Staff Price Tampering**: Staff attempts to `update` `products/{id}` `sellingPrice` or read `product_costs/{id}` -> `PERMISSION_DENIED`.
11. **Cross-Staff Order PII Read**: Staff A attempts `get` or `list` on `orders` belonging to Staff B (`staffId != request.auth.uid`) -> `PERMISSION_DENIED`.
12. **Resource / ID Poisoning**: Attempt to write document ID `../../bad_id!` or `string` exceeding schema `maxLength` -> `PERMISSION_DENIED`.
