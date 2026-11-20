import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Package, Plus, Search, Trash2, X } from 'lucide-react';
import { productsApi } from '../../utils/api';
import { formatBDT, type Product } from '../../utils/domain';

interface InitialVariantDraft {
  size: string;
  colour: string;
  quantity: string;
}

export const AdminProductsView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const [form, setForm] = useState({
    productCode: '',
    productName: '',
    category: 'Sherwani & Panjabi',
    description: '',
    productCost: '',
    sellingPrice: '',
    isActive: true,
    imageUrl: '',
  });
  const [initialVariants, setInitialVariants] = useState<InitialVariantDraft[]>([
    { size: 'M', colour: 'Obsidian', quantity: '0' },
  ]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await productsApi.list();
      setProducts(res.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    return products.filter((p) => {
      if (activeFilter === 'active' && !p.isActive) return false;
      if (activeFilter === 'inactive' && p.isActive) return false;
      if (!q) return true;
      return (
        p.productCode.toUpperCase().includes(q) ||
        p.productName.toUpperCase().includes(q) ||
        p.category.toUpperCase().includes(q)
      );
    });
  }, [products, searchQuery, activeFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      productCode: '',
      productName: '',
      category: 'Sherwani & Panjabi',
      description: '',
      productCost: '',
      sellingPrice: '',
      isActive: true,
      imageUrl: '',
    });
    setInitialVariants([{ size: 'M', colour: 'Obsidian', quantity: '0' }]);
    setShowForm(true);
    setError(null);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      productCode: p.productCode,
      productName: p.productName,
      category: p.category,
      description: p.description,
      productCost: String(p.productCost ?? 0),
      sellingPrice: String(p.sellingPrice),
      isActive: p.isActive,
      imageUrl: p.imageUrl || '',
    });
    setShowForm(true);
    setError(null);
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      setError('Image must be smaller than 1.5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((f) => ({ ...f, imageUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const addVariantRow = () => {
    setInitialVariants((prev) => [...prev, { size: 'L', colour: 'Obsidian', quantity: '0' }]);
  };

  const updateVariantRow = (idx: number, key: keyof InitialVariantDraft, value: string) => {
    setInitialVariants((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [key]: value } : row))
    );
  };

  const removeVariantRow = (idx: number) => {
    setInitialVariants((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await productsApi.update(editing.id, {
          productName: form.productName,
          category: form.category,
          description: form.description,
          productCost: Number(form.productCost),
          sellingPrice: Number(form.sellingPrice),
          isActive: form.isActive,
          imageUrl: form.imageUrl || null,
        });
      } else {
        const cleanedVariants = initialVariants
          .map((v) => ({
            size: v.size.trim(),
            colour: v.colour.trim(),
            quantity: Math.max(0, Math.floor(Number(v.quantity || 0))),
          }))
          .filter((v) => v.size.length > 0 && v.colour.length > 0);

        await productsApi.create({
          productCode: form.productCode,
          productName: form.productName,
          category: form.category,
          description: form.description,
          productCost: Number(form.productCost),
          sellingPrice: Number(form.sellingPrice),
          isActive: form.isActive,
          imageUrl: form.imageUrl || null,
          initialVariants: cleanedVariants,
        });
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Product) => {
    try {
      await productsApi.update(p.id, { isActive: !p.isActive });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update product status.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-[#0D0D0F]">Product Management</h2>
          <p className="mt-1 text-sm text-[#6B655B]">
            Define catalog items, internal costs, and Admin-fixed selling prices in BDT. Staff cannot alter prices.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0D0D0F] px-4 py-2.5 text-xs font-medium text-[#FAF7F0] hover:bg-[#1E1E24] transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4 text-[#C5A059]" />
          <span>Add New Product</span>
        </button>
      </div>

      {/* Search & Status Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5DFD3] bg-white p-3.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8B8478]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Product Code, Name, or Category..."
            aria-label="Search products by code or name"
            className="w-full rounded-lg border border-[#D8CFC0] bg-[#FAF7F0]/50 py-1.5 pl-8 pr-3 text-xs text-[#141416] focus:border-[#B89242] focus:outline-none"
          />
        </div>
        <div className="inline-flex rounded-lg border border-[#E5DFD3] bg-[#FAF7F0] p-0.5 text-xs">
          {(['all', 'active', 'inactive'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setActiveFilter(st)}
              className={`rounded-md px-3 py-1.5 capitalize font-medium transition-colors ${
                activeFilter === st ? 'bg-[#0D0D0F] text-[#FAF7F0]' : 'text-[#544F47]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-xs font-medium text-[#991B1B]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm text-[#6B655B]">Loading products...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-xl border border-[#E5DFD3] bg-white p-12 text-center">
          <Package className="mx-auto h-8 w-8 text-[#C5A059]" />
          <h3 className="mt-3 text-base font-semibold text-[#0D0D0F]">
            {products.length === 0 ? 'No Products in Catalog' : 'No Matching Products'}
          </h3>
          <p className="mt-1 text-xs text-[#6B655B]">
            {products.length === 0
              ? 'Create your first AVENOR LEGACY product with its fixed BDT selling price.'
              : 'Adjust your search query or status filter to view catalog products.'}
          </p>
          {products.length === 0 && (
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 rounded-lg bg-[#0D0D0F] px-4 py-2 text-xs font-medium text-[#FAF7F0]"
            >
              Create First Product
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((p) => {
            const totalAvailable = (p.variants || []).reduce((acc, v) => acc + v.availableQty, 0);
            return (
              <div
                key={p.id}
                className="flex flex-col justify-between rounded-xl border border-[#E5DFD3] bg-white p-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono-num text-xs font-semibold text-[#8A6820]">
                        {p.productCode}
                        <span className="mx-1.5 text-[#C0B8AA]">·</span>
                        <span className="font-sans font-normal text-[#6B655B]">{p.category}</span>
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-[#0D0D0F]">{p.productName}</h3>
                    </div>
                    <span
                      className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                        p.isActive
                          ? 'border-[#15803D]/25 bg-[#15803D]/8 text-[#166534]'
                          : 'border-[#B91C1C]/25 bg-[#DC2626]/10 text-[#991B1B]'
                      }`}
                    >
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {p.imageUrl && (
                    <div className="mt-3 h-36 w-full overflow-hidden rounded-lg border border-[#EFEAE0] bg-[#FAF7F0]">
                      <img
                        src={p.imageUrl}
                        alt={p.productName}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  {p.description && (
                    <p className="mt-3 text-xs leading-relaxed text-[#544F47]">{p.description}</p>
                  )}

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#EFEAE0] pt-3 text-xs">
                    <div>
                      <p className="text-[11px] text-[#6B655B]">Unit Cost</p>
                      <p className="mt-0.5 font-mono-num font-medium text-[#3A3731]">
                        {formatBDT(p.productCost ?? 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#6B655B]">Fixed Price</p>
                      <p className="mt-0.5 font-mono-num font-semibold text-[#0D0D0F]">
                        {formatBDT(p.sellingPrice)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#6B655B]">Available Stock</p>
                      <p className="mt-0.5 font-mono-num font-medium text-[#0D0D0F]">
                        {totalAvailable} units
                      </p>
                    </div>
                  </div>

                  {p.variants && p.variants.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#F4EFE6] pt-2.5">
                      {p.variants.map((v) => (
                        <span
                          key={v.id}
                          className={`rounded border px-2 py-0.5 font-mono-num text-[10px] font-medium ${
                            v.status === 'Not Available'
                              ? 'border-[#B91C1C]/30 bg-[#FEF2F2] text-[#991B1B]'
                              : v.status === 'Low Stock'
                                ? 'border-[#B45309]/30 bg-[#FFFBEB] text-[#92400E]'
                                : 'border-[#E5DFD3] bg-[#FAF7F0] text-[#3A3731]'
                          }`}
                        >
                          {v.size}/{v.colour}: {v.availableQty}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#EFEAE0] pt-3">
                  <button
                    type="button"
                    onClick={() => toggleActive(p)}
                    className="rounded-lg border border-[#D8CFC0] px-3 py-1.5 text-xs font-medium text-[#3A3731] hover:bg-[#FAF7F0]"
                  >
                    {p.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D0D0F] px-3 py-1.5 text-xs font-medium text-[#FAF7F0] hover:bg-[#1E1E24]"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-[#C5A059]" />
                    <span>Edit</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-[#E5DFD3] bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between border-b border-[#EFEAE0] pb-3">
              <h3 className="font-display text-2xl font-semibold text-[#0D0D0F]">
                {editing ? `Edit ${editing.productCode}` : 'Create New Product'}
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Close product modal"
                className="rounded border border-[#E5DFD3] p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="prd-code" className="block text-xs font-medium text-[#3A3731]">
                  Product Code
                </label>
                <input
                  id="prd-code"
                  type="text"
                  required
                  disabled={!!editing}
                  value={form.productCode}
                  onChange={(e) => setForm((f) => ({ ...f, productCode: e.target.value.toUpperCase() }))}
                  placeholder="AVL-SHW-001"
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 font-mono text-xs uppercase disabled:bg-[#F5F1E8]"
                />
              </div>

              <div>
                <label htmlFor="prd-cat" className="block text-xs font-medium text-[#3A3731]">
                  Category
                </label>
                <input
                  id="prd-cat"
                  type="text"
                  required
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="prd-name" className="block text-xs font-medium text-[#3A3731]">
                  Product Name
                </label>
                <input
                  id="prd-name"
                  type="text"
                  required
                  value={form.productName}
                  onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                  placeholder="e.g., Sovereign Silk Sherwani"
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label htmlFor="prd-cost" className="block text-xs font-medium text-[#3A3731]">
                  Product Cost (BDT)
                </label>
                <input
                  id="prd-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={form.productCost}
                  onChange={(e) => setForm((f) => ({ ...f, productCost: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 font-mono-num text-xs"
                />
              </div>

              <div>
                <label htmlFor="prd-price" className="block text-xs font-medium text-[#3A3731]">
                  Admin Fixed Selling Price (BDT)
                </label>
                <input
                  id="prd-price"
                  type="number"
                  min={1}
                  step="0.01"
                  required
                  value={form.sellingPrice}
                  onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 font-mono-num text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="prd-desc" className="block text-xs font-medium text-[#3A3731]">
                  Description
                </label>
                <textarea
                  id="prd-desc"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[#D8CFC0] px-3 py-2 text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="prd-img" className="block text-xs font-medium text-[#3A3731]">
                  Optional Product Image (URL or Upload)
                </label>
                <div className="mt-1 flex flex-wrap gap-2">
                  <input
                    id="prd-img"
                    type="text"
                    value={form.imageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    placeholder="https://... or upload an image file"
                    className="flex-1 rounded-lg border border-[#D8CFC0] px-3 py-2 text-xs"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFile}
                    className="text-xs text-[#4A463F]"
                  />
                </div>
              </div>

              {!editing && (
                <div className="sm:col-span-2 rounded-lg border border-[#EFEAE0] bg-[#FAF7F0] p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[#0D0D0F]">
                      Initial Size &amp; Colour Stock Variants (Optional)
                    </p>
                    <button
                      type="button"
                      onClick={addVariantRow}
                      className="inline-flex items-center gap-1 rounded border border-[#C5A059]/60 bg-white px-2.5 py-1 text-[11px] font-medium text-[#8A6820] hover:bg-[#FAF7F0]"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Variant</span>
                    </button>
                  </div>
                  <div className="space-y-2">
                    {initialVariants.map((variant, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <input
                          type="text"
                          value={variant.size}
                          onChange={(e) => updateVariantRow(idx, 'size', e.target.value)}
                          placeholder="Size (e.g. M)"
                          aria-label={`Initial variant ${idx + 1} size`}
                          className="col-span-4 rounded border border-[#D8CFC0] bg-white px-2.5 py-1.5 text-xs"
                        />
                        <input
                          type="text"
                          value={variant.colour}
                          onChange={(e) => updateVariantRow(idx, 'colour', e.target.value)}
                          placeholder="Colour (e.g. Obsidian)"
                          aria-label={`Initial variant ${idx + 1} colour`}
                          className="col-span-4 rounded border border-[#D8CFC0] bg-white px-2.5 py-1.5 text-xs"
                        />
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={variant.quantity}
                          onChange={(e) => updateVariantRow(idx, 'quantity', e.target.value)}
                          placeholder="Qty"
                          aria-label={`Initial variant ${idx + 1} quantity`}
                          className="col-span-3 rounded border border-[#D8CFC0] bg-white px-2.5 py-1.5 font-mono-num text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => removeVariantRow(idx)}
                          aria-label={`Remove variant row ${idx + 1}`}
                          className="col-span-1 flex items-center justify-center rounded border border-[#E5DFD3] bg-white py-1.5 text-[#6B655B] hover:text-[#991B1B]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label className="sm:col-span-2 flex items-center gap-2 text-xs text-[#141416]">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="rounded border-[#D8CFC0]"
                />
                <span>Product is Active (visible to Staff in Place Order form)</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-[#D8CFC0] px-4 py-2 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#0D0D0F] px-5 py-2 text-xs font-medium text-[#FAF7F0]"
              >
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Product'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
