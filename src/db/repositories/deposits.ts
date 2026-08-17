/** Deposit repository boundary for payment verification and recovery workflows. */
export {
  approveDepositAtomic,
  createDeposit,
  findDepositByReference,
  findDepositByTxHash,
  finishDirectPayFulfillment,
  getDeposit,
  getPaymentMethodById,
  listAllPaymentMethods,
  listPaymentMethods,
  rejectDepositAtomic,
  setDepositNote,
} from '../queries.js';
