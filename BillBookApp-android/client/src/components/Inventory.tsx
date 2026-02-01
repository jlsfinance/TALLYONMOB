
import React, { useState, useEffect } from 'react';
import { Product } from '../types';
import { StorageService } from '../services/storageService';
import { Plus, Search, Package, Trash2, Edit2, TrendingUp, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Inventory: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: '', price: 0, stock: 0, category: 'General'
  });
  const [originalId, setOriginalId] = useState<string | null>(null);

  useEffect(() => {
    setProducts(StorageService.getProducts());
  }, []);

  const handleEdit = (product: Product) => {
    setNewProduct(product);
    setOriginalId(product.id);
    setIsAdding(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || newProduct.price === undefined) return;

    // Use entered ID or preserve existing ID or generate new
    const finalId = newProduct.id?.trim() || crypto.randomUUID();

    // Check for duplicate ID
    const existingProduct = products.find(p => p.id === finalId);
    if (existingProduct && originalId !== finalId) {
      alert("Error: This Product ID already exists. Please use a unique ID.");
      return;
    }

    // Check for duplicate Name
    const duplicateName = products.find(p => p.name.toLowerCase() === newProduct.name!.toLowerCase() && p.id !== finalId);
    if (duplicateName) {
      alert("Error: A product with this name already exists.");
      return;
    }

    const product: Product = {
      id: finalId,
      name: newProduct.name!,
      price: Number(newProduct.price),
      stock: Number(newProduct.stock) || 0,
      category: newProduct.category || 'General',
      gstRate: newProduct.gstRate,
      hsn: newProduct.hsn
    };

    // Handle ID Renaming
    if (originalId && originalId !== finalId) {
      // ID changed, delete old one to prevent duplicates (effectively a rename)
      // Warning: This breaks history links if not handled carefully, but user requested edit capability.
      StorageService.deleteProduct(originalId);
    }

    StorageService.saveProduct(product);

    setProducts(StorageService.getProducts());
    setIsAdding(false);
    setNewProduct({ name: '', price: 0, stock: 0, category: 'General' });
    setOriginalId(null);
  };


  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const handleBulkDelete = () => {
    if (window.confirm(`Delete ${selectedIds.size} selected items?`)) {
      let updated = [...products];
      selectedIds.forEach(id => {
        updated = updated.filter(p => p.id !== id);
        StorageService.deleteProduct(id);
      });
      setProducts(updated);
      setSelectedIds(new Set());
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalStockValue = products.reduce((acc, p) => acc + (p.price * p.stock), 0);
  const lowStockCount = products.filter(p => p.stock <= 10).length;

  return (
    <div className="bg-surface-container-low min-h-screen pb-32 font-sans">
      {/* Material 3 Large Top Bar */}
      <div className="pt-safe pb-8 px-6 md:px-12 bg-surface-container-low sticky top-0 z-30 transition-all">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col">
            <span className="text-[11px] font-black text-google-blue uppercase tracking-[0.3em] mb-2 px-1">Management</span>
            <h1 className="text-4xl md:text-5xl font-black font-heading text-foreground tracking-tight leading-none">Inventory</h1>
          </div>

          <div className="flex gap-4">
            {selectedIds.size > 0 && (
              <motion.button
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleBulkDelete}
                className="bg-google-red text-white px-6 py-4 rounded-full flex items-center justify-center gap-2 font-black text-sm uppercase tracking-widest shadow-lg hover:shadow-google-red/30 transition-all"
              >
                <Trash2 className="w-5 h-5" /> Delete ({selectedIds.size})
              </motion.button>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setIsAdding(true);
                setOriginalId(null);
                setNewProduct({ name: '', price: 0, stock: 0, category: 'General' });
              }}
              className="bg-primary text-white px-8 py-4 rounded-full flex items-center justify-center gap-3 font-black text-sm uppercase tracking-widest shadow-google hover:shadow-google-lg transition-all"
            >
              <Plus className="w-5 h-5" strokeWidth={3} /> Add New Item
            </motion.button>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto p-4 md:p-8 space-y-8"
      >
        {/* Expressive Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-container-high p-6 rounded-[32px] border border-border shadow-sm group hover:bg-surface-container-highest transition-all">
            <div className="w-12 h-12 rounded-2xl bg-google-blue/10 flex items-center justify-center text-google-blue mb-4 group-hover:scale-110 transition-transform">
              <Package className="w-6 h-6" />
            </div>
            <p className="text-3xl font-black text-foreground font-heading">{products.length}</p>
            <p className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] mt-1">Total Products</p>
          </div>

          <div className="bg-surface-container-high p-6 rounded-[32px] border border-border shadow-sm group hover:bg-surface-container-highest transition-all">
            <div className="w-12 h-12 rounded-2xl bg-google-green/10 flex items-center justify-center text-google-green mb-4 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-6 h-6" />
            </div>
            <p className="text-3xl font-black text-foreground font-heading">₹{Math.round(totalStockValue).toLocaleString('en-IN')}</p>
            <p className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] mt-1">Inventory Value</p>
          </div>

          <div className={`p-6 rounded-[32px] border transition-all h-full ${lowStockCount > 0
            ? 'bg-google-red/5 border-google-red/10 text-google-red'
            : 'bg-surface-container-high border-border text-foreground'
            }`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${lowStockCount > 0 ? 'bg-google-red/10' : 'bg-surface-container-highest'
              }`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <p className="text-3xl font-black font-heading">{lowStockCount}</p>
            <p className={`text-[10px] uppercase font-black tracking-[0.2em] mt-1 ${lowStockCount > 0 ? 'text-google-red' : 'text-muted-foreground'
              }`}>Low Stock Alerts</p>
          </div>
        </div>

        {/* M3 Search Bar & Select All */}
        <div className="flex gap-4 items-center">
          <div className="relative group flex-1">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-google-blue transition-colors">
              <Search className="w-6 h-6" />
            </div>
            <input
              type="text"
              placeholder="Search items by name or category..."
              className="w-full pl-16 pr-8 py-6 bg-surface-container-high border-2 border-transparent focus:border-google-blue/20 rounded-[32px] shadow-sm focus:ring-4 focus:ring-google-blue/5 outline-none font-bold text-foreground transition-all placeholder:text-muted-foreground/40"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {products.length > 0 && (
            <button
              onClick={handleSelectAll}
              className={`px-6 py-6 rounded-[32px] border-2 font-black text-sm uppercase tracking-widest transition-all ${selectedIds.size === filteredProducts.length && filteredProducts.length > 0
                ? 'bg-google-blue text-white border-google-blue'
                : 'bg-surface-container-high border-transparent text-muted-foreground hover:bg-surface-container-highest'
                }`}
            >
              {selectedIds.size === filteredProducts.length && filteredProducts.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredProducts.map((product) => (
              <motion.div
                key={product.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`bg-surface border p-6 rounded-[32px] shadow-sm hover:shadow-google-lg transition-all group relative overflow-hidden active:scale-[0.98] ${selectedIds.has(product.id) ? 'border-google-blue ring-2 ring-google-blue/20 bg-google-blue/5' : 'border-border hover:border-google-blue/20'
                  }`}
                onClick={() => toggleSelection(product.id)}
              >
                <div className="absolute top-4 left-4 z-10">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.has(product.id) ? 'bg-google-blue border-google-blue' : 'border-muted-foreground/30 bg-surface group-hover:border-google-blue/50'
                    }`}>
                    {selectedIds.has(product.id) && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                  </div>
                </div>

                <div className="absolute top-0 right-0 w-32 h-32 bg-google-blue/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-google-blue/10 transition-colors" />

                <div className="flex justify-between items-start mb-6 relative pl-8">
                  <div className="w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center text-google-blue shadow-inner group-hover:scale-110 transition-transform">
                    <Package className="w-7 h-7" />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(product); }} className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-google-blue hover:bg-google-blue/5 rounded-full"><Edit2 className="w-4 h-4" /></button>
                  </div>
                </div>

                <div className="relative">
                  <h3 className="text-xl font-black text-foreground line-clamp-1 font-heading mb-1">{product.name}</h3>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{product.category}</p>
                </div>

                <div className="mt-8 pt-6 border-t border-border flex items-end justify-between relative">
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Unit Price</p>
                    <p className="text-2xl font-black text-google-blue tracking-tighter">₹{product.price.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2">Stock Level</p>
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${product.stock > 10
                      ? 'bg-google-green text-white shadow-lg shadow-google-green/20'
                      : 'bg-google-red text-white shadow-lg shadow-google-red/20 animate-pulse'
                      }`}>
                      {product.stock} Units
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-24 bg-surface-container-high/50 rounded-[40px] border-2 border-dashed border-border mt-8">
            <div className="w-24 h-24 bg-surface-container-highest rounded-full flex items-center justify-center mx-auto mb-6">
              <Package className="w-12 h-12 text-muted-foreground/30" strokeWidth={1.5} />
            </div>
            <h3 className="text-2xl font-black text-foreground mb-2 font-heading">Empty Warehouse</h3>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Add your first item to get started</p>
          </div>
        )}
      </motion.div>

      {/* Expressive M3 Side Sheet Modal for Adding Product */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              layoutId="product-modal"
              initial={{ y: 50, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 50, opacity: 0, scale: 0.95 }}
              className="relative bg-surface w-full max-w-xl rounded-[40px] overflow-hidden shadow-google-lg border border-border"
            >
              <div className="p-10 pb-4 flex justify-between items-start">
                <div>
                  <h2 className="text-4xl font-black font-heading text-foreground tracking-tight">{newProduct.id ? 'Edit item' : 'New item'}</h2>
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-2">{newProduct.id ? 'Refining stock details' : 'Expansion mode active'}</p>
                </div>
                <button
                  onClick={() => setIsAdding(false)}
                  className="w-12 h-12 bg-surface-container-high rounded-full flex items-center justify-center text-foreground hover:bg-surface-container-highest transition-colors"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSave} className="p-10 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Identification Code</label>
                    <input
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none font-mono transition-all"
                      placeholder="SMART_CALC_ID"
                      value={newProduct.id || ''}
                      onChange={e => setNewProduct({ ...newProduct, id: e.target.value })}
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Category</label>
                    <input
                      className="w-full p-4 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-base font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      placeholder="General"
                      value={newProduct.category || ''}
                      onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Product Label</label>
                  <input
                    required
                    autoFocus
                    className="w-full p-5 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-2xl font-black text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all placeholder:text-muted-foreground/30 font-heading"
                    placeholder="Premium Product Name"
                    value={newProduct.name}
                    onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Sale Price (₹)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-google-blue">₹</span>
                      <input
                        required
                        type="number"
                        className="w-full p-5 pl-10 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-xl font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                        placeholder="0.00"
                        value={newProduct.price || ''}
                        onChange={e => setNewProduct({ ...newProduct, price: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-2">Initial Stock</label>
                    <input
                      required
                      type="number"
                      className="w-full p-5 bg-surface-container-high border-2 border-transparent focus:border-google-blue/30 rounded-[24px] text-xl font-bold text-foreground focus:ring-4 focus:ring-google-blue/5 outline-none transition-all"
                      placeholder="0"
                      value={newProduct.stock || ''}
                      onChange={e => setNewProduct({ ...newProduct, stock: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  type="submit"
                  className="w-full bg-google-blue text-white py-6 rounded-full font-black text-lg uppercase tracking-widest shadow-lg shadow-google-blue/20 hover:shadow-google-lg active:shadow-inner transition-all mt-4"
                >
                  Confirm & Sync
                </motion.button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Inventory;

