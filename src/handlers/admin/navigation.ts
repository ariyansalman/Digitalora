import { InlineKeyboard } from 'grammy';

/** Shared admin navigation labels and root keyboard. Keep callback IDs stable. */
export const ADMIN_NAV = Object.freeze({
  root: '🛠 *Admin Panel*\n\nChoose a section to manage.',
  mainMenu: '🏠 Main Menu',
  back: '⬅️ Back',
});

export function buildAdminRootMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📊 Dashboard', 'adm:dashboard')
    .text('🛍️ Products', 'adm:prod')
    .row()
    .text('📦 Orders', 'adm:ord:0')
    .text('👥 Users', 'adm:usr:0')
    .row()
    .text('💳 Payment Management', 'adm:payments')
    .row()
    .text('🎟️ Promotions', 'adm:promo')
    .text('🎁 Referrals', 'adm:refs:0')
    .row()
    .text('📦 Inventory', 'adm:inventory')
    .text('🔔 Notifications', 'adm:notifications')
    .row()
    .text('📈 Reports', 'adm:analytics')
    .text('🩺 System Health', 'adm:health')
    .row()
    .text('⚙️ Settings', 'adm:settings')
    .text(ADMIN_NAV.mainMenu, 'adm:close');
}

export function addAdminBackRow(kb: InlineKeyboard): InlineKeyboard {
  return kb.row().text(ADMIN_NAV.back, 'adm:root');
}
