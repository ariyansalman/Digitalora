/** Product repository boundary. Product/stock reads and mutations used by services. */
export {
  claimProductItems,
  countAvailableProductItems,
  decrementProductStock,
  releaseProductItemsForOrder,
  restoreProductStock,
  getProduct,
  listActiveProducts,
  // Inventory integrity (0061): reservation-based stock taking,
  // delivery guards and 📦 / 🔒 / ✅ reporting.
  reserveProductStock,
  commitStockReservation,
  releaseStockReservation,
  expireStockReservations,
  expireProductItems,
  beginOrderDelivery,
  finishOrderDelivery,
  getProductInventoryStats,
  listLowStockProducts,
  setProductLowStockThreshold,
} from '../queries.js';
export type { StockReservation, InventoryStats } from '../queries.js';
