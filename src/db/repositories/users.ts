/** User repository boundary. Keep Telegram/user persistence behind this module. */
export {
  findUserById,
  getOrCreateUser,
  getUserByTelegramId,
  isAdmin,
  listAdminTelegramIds,
} from '../queries.js';
