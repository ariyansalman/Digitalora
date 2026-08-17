/* English (default) — edit text here. */
export const en: Record<string, string> = {
  // ---------- Welcome / menu ----------
  'welcome': 'Welcome to Digitalora',
  'welcome.title': 'Welcome to Digitalora!',
  'welcome.balance': 'Your balance: *${balance}*',
  'welcome.tap_menu': 'Tap *Main Menu* below to begin.',
   'menu.title': '✨ *Digitalora* — Premium Digital Marketplace',

  // ---------- Buttons ----------
  'btn.main_menu': '⬅️ Back to Menu',
  'btn.shop': '🛍️ Marketplace',
  'btn.topup': '💳 Wallet',
  'btn.profile': '👤 Profile',
  'btn.support': '💬 Support Center',
  'btn.ai_support': '🤖 AI Support',
  // ---- Shopping cart -------------------------------------------
  'btn.cart': '🛒 Cart',
  'btn.cart_add': '🛒 Add to Cart',
  'btn.cart_view': '🛒 View Cart',
  'btn.cart_inc': '➕',
  'btn.cart_dec': '➖',
  'btn.cart_remove': '🗑',
  'btn.cart_checkout': '💳 Checkout',
  'btn.cart_clear': '🧹 Clear Cart',
  'btn.cart_clear_confirm': '🧹 Yes, clear it',
  'btn.continue_shopping': '🛍 Continue Shopping',
  'cart.btn.back_to_product': '⬅️ Back to product',
  'cart.title':
    '🛒 *Your Cart*\n\n{lines}\n\n──────────────\n🧾 *Items:* {items}{discount_line}\n💰 *Total:* {total}\n👛 *Wallet:* {balance}',
  'cart.line':
    '{index}. *{name}*\n   • Quantity: {qty}\n   • Unit Price: {unit_price}\n   • Subtotal: {subtotal}{note}',
  'cart.discount': '🎁 *Discount:* -{discount}',
  'cart.empty':
    '📭 *Your cart is empty*\n\n_Browse the marketplace and tap 🛒 Add to Cart on any product._',
  'cart.line.removed': '   ⚠️ This product is no longer available and will be skipped.',
  'cart.line.inactive': '   ⚠️ This product is currently unavailable and will be skipped.',
  'cart.line.out_of_stock': '   ⚠️ Out of stock — it will be skipped at checkout.',
  'cart.line.adjusted': '   ⚠️ Only {max} left — quantity reduced at checkout.',
  'cart.line.price_changed': '   ℹ️ Price updated since you added this item.',
  'cart.add.toast': '🛒 Added to cart',
  'cart.add.done':
    '🛒 *Added to Cart*\n\n*{name}*\n• Quantity: {qty}\n• Unit Price: {unit_price}\n\nContinue shopping or open your cart to check out.',
  'cart.add.unavailable': 'This product is out of stock right now.',
  'cart.add.too_many': 'Your cart is full. Check out or remove an item first.',
  'cart.item.removed': '🗑 Removed from cart',
  'cart.item.qty': 'Quantity: {qty}',
  'cart.clear.confirm': '🧹 *Clear Cart*\n\nRemove every item from your cart?',
  'cart.clear.done': '🧹 Cart cleared',
  'cart.checkout.nothing': 'Nothing in your cart can be purchased right now.',
  'cart.checkout.in_progress': 'Your checkout is already being processed.',
  'cart.checkout.line': '• *{name}* ×{qty} — {subtotal}',
  'cart.checkout.confirm':
    '💳 *Confirm Checkout*\n\n{lines}\n\n💰 *Total:* {total}\n👛 *Wallet:* {balance}{warning}',
  'cart.checkout.warning': '⚠️ Some items changed and were adjusted or skipped.',
  'cart.checkout.partial':
    '⚠️ These items could not be completed and stayed in your cart: {names}. Any charge for them was refunded.',
  'btn.back': '⬅️ Back',
  'btn.next': 'Next ▶️',
  'btn.prev': '◀️ Prev',
  'btn.refresh': '🔄 Refresh',
  'btn.buy_now': '🛒 Buy Now',
  'btn.pre_order': '🛍 Pre Order',
  'btn.redeem_referral': '🎁 Pay with Referrals',
  'btn.referral_earn_buy': '🔗 Earn Referrals & Buy',
  'btn.convert_refers': '💱 Convert Refers to USDT',
  'btn.topup_wallet': '👛 Top-up Wallet',
  'btn.view_note': '📝 View Note',
  'btn.qty_plus': '➕',
  'btn.qty_minus': '➖',
  // Custom-quantity keypad — opens a numeric keypad in place of
  // the legacy +/- adder.
  'btn.custom_qty': '🔢 Custom Quantity',
  'btn.qty_keypad_back': '⌫',
  'btn.qty_keypad_clear': '🗑 Clear',
  'btn.qty_keypad_confirm': '✅ Confirm',
  // "Max" snaps the quantity buffer to the user's purchasable
  // ceiling (`min(QTY_MAX, available stock)`) in one tap so a buyer
  // who wants the full lot doesn't have to type each digit.
  'btn.qty_keypad_max': '🎯 Max',
  // Buy-now payment-method screen.
  'btn.pay_wallet': '👛 Wallet',
  'btn.pay_referral': '🎁 Referral Pay',
  'btn.pay_direct': '💸 Pay Direct',
  'btn.pay_topup': '🪙 Top-up',
  // Wallet-confirm card (page 2 of the buy flow). The Confirm
  // button shows a green ✅ + premium tick, the Cancel button is
  // red with the same back-arrow as the rest of the bot.
  'btn.confirm_pay': '✅ Confirm',
  'btn.cancel_pay': '❌ Cancel',
  // Payment-methods keyboard rows. Premium subscribers see the
  // animated icon defined in EMOJI.paymethod_others / paymethod_back;
  // everyone else gets the unicode prefix below as the natural
  // fallback. The leading emoji is stripped from the label at render
  // time when the icon is applied so the glyph never doubles up.
  'btn.paymethod_others': '💡 Others',
  'btn.paymethod_back': '◀️ Back',
  'btn.qty.max': '🎯 Max',
  'btn.qty.reset': '🔄 Reset',
  'btn.qty.confirm': '✅ Confirm',
  'btn.contact_admin': '💬 Contact Admin',
  // Inline-counter step buttons. Premium emojis are layered on at
  // render time (per-button icon override) — these unicode glyphs
  // are the fallback for clients without premium.
  'btn.qty.dec_1': '➖ 1',
  'btn.qty.dec_10': '⏪ 10',
  'btn.qty.dec_100': '⏮ 100',
  'btn.qty.inc_1': '➕ 1',
  'btn.qty.inc_10': '⏩ 10',
  'btn.qty.inc_100': '⏭ 100',
  'btn.qty.display': '📦 {qty} / {stock}',
  // Product-page extras.
  'btn.share_product': '🔗 Copy Link',
  // `btn.view_note_file` is kept for backwards compat with /settext
  // overrides. `btn.send_note_txt` is now reused for the Order
  // Delivered "Download TXT" button.
  'btn.view_note_file': '📥 Save Note as TXT',
  'btn.view_order': '📦 View Order',
  'btn.send_note_txt': '📥 Download TXT',
  // Out-of-stock products still show a Buy Now button labelled with
  // a premium ❌ glyph — tapping it surfaces the "contact admin to
  // restock" popup (see `shop.product.out_of_stock_popup`).
  'btn.out_of_stock': '❌ Buy Now',
  // Premium-shop overhaul (post-order tutorial CTA + Settings rows).
  'btn.using_method': '📘 Using Method',
  'btn.tutorial_open_link': '🔗 Open Link',
  'btn.bot_tutorial': '📘 Bot Tutorial',
  // Per-method tutorial CTAs surfaced under every chain / Binance /
  // LTC instruction screen. Shape mirrors the existing
  // `btn.using_method` (book + concise label) so the entry-point
  // pattern reads the same across the bot.
  'btn.where_txid': '📘 Where to find TXID?',
  'btn.where_order_id': '📘 Where to find Order ID?',
  'btn.send_price_list': '📊 Send Price List',
  'btn.send_price_list.mail': '📤 Send on Mail',
  'btn.send_price_list.chat': '📬 Send in Chat',
  'btn.notify.email.on': '🟢 Email Reports: ON',
  'btn.notify.email.off': '🔕 Email Reports: OFF',
  // Post-purchase email follow-up CTAs.
  'btn.set_email_now': '📧 Add Verified Email',
  'btn.view_invoice': '🔗 View Invoice',
  'btn.my_orders': '📦 My Orders',
  'btn.refer': '🎁 Refer & Earn',
  'btn.notifications': '🔔 Notifications',
  'btn.toggle_stock': '📢 Stock Alerts',
  'btn.toggle_announcements': '💬 Info Alerts',
  'btn.toggle_wallet': '💰 Wallet Alerts',
  // Each toggle now sits on its own full-width row — we can show
  // the full alert name and ON/OFF state.
  'btn.notify.stock.on': '🟢 Stock Alerts: ON',
  'btn.notify.stock.off': '🔕 Stock Alerts: OFF',
  'btn.notify.ann.on': '🟢 Info Alerts: ON',
  'btn.notify.ann.off': '🔕 Info Alerts: OFF',
  'btn.notify.wallet.on': '🟢 Wallet Alerts: ON',
  'btn.notify.wallet.off': '🔕 Wallet Alerts: OFF',
  'btn.back_to_settings': '⬅️ Back to Settings',
  // Same word in every locale so the inline keyboard layout stays
  // identical regardless of `lang` — the leading globe gets wrapped
  // as a premium emoji at render time.
  'btn.language': '🌐 Language',
  'btn.language.english': '🇬🇧 English',
  'btn.language.arabic': '🇸🇦 العربية',
  'btn.language.vietnamese': '🇻🇳 Tiếng Việt',
  'btn.region.clear': '🚫 Clear',
  'btn.deposit_history': '💳 My Deposits',
  'btn.channel': '📣 Official Channel',
  'btn.reseller_api': '🔑 Api Key',
  'api.price_alert.up':
    '{notify_bell} Dear API user, *{product}* price is now *up* to {price}. Please update your prices for this product.',
  'api.price_alert.down':
    '{notify_bell} Dear API user, *{product}* price is now *down* to {price}. Please update your prices for this product.',
  'btn.stats': '📊 Stats',
  'btn.stats_refresh': '🔄 Refresh',
  'btn.stats_back': '◀️ Back',
  'btn.set_region': '🗺 Set Region',
  'btn.set_email': '📧 Set Email',

  // ---------- Shop ----------
  // Shop home — single all-products list (categories step removed).
  // Header is a single bold line; pagination lives in the keyboard
  // footer (Prev / Refresh / Next / page indicator).
  'shop.home.header.professional': '🛍️ *Digitalora Marketplace*\n_{total} products • Page {page}/{pages}_',
  'shop.product.button': '{name} • {price} • {stock} left',
  'shop.product.button.unlimited': '{name} • {price} • ∞',
  'shop.product.button.oos': '❌ {name} • {price} • Out of stock',
  'shop.home.header': '*Available Products:*',
  // Legacy key, kept for any callsite still on the old categories
  // flow.
  'shop.choose_category': '*Available Products:*',
  'shop.qty.prompt': '🔢 Type a quantity (1–{max}) and send.',
  'shop.qty.invalid': '❌ Invalid number — please send a value between 1 and {max}.',

  // ---- Custom-quantity keypad ---------------------------------
  // Short usage instruction appended below the product-page body
  // when the keypad is open. {current} is the digits the user has
  // tapped on the keypad so far — `—` until they've started.
  // The `{current}` token is the digit buffer the user has tapped
  // so far. Until they start typing it renders as the literal
  // placeholder text `(Amount)` so the line reads naturally to
  // newcomers ("Current: (Amount)") instead of the cryptic em-dash
  // we used before. Once digits land, the buffer replaces it.
  'shop.qty.keypad.instruction':
    '{qty_prompt_keypad} *How to use:* tap the digits below or send a number, ' +
    'then tap ✅ Confirm.\n' +
    'Current: <code>{current}</code>',
  // Placeholder shown inside `Current: <code>…</code>` while the
  // digit buffer is empty. Reads as a sentence to first-time users
  // ("Current: (Amount)") instead of the cryptic em-dash we used
  // before. Once digits land, the buffer replaces it.
  'shop.qty.keypad.placeholder': '(Amount)',
  // Premium-emoji error shown when the user enters an out-of-range
  // or non-numeric quantity. Auto-deletes a few seconds later so
  // it doesn't clutter the chat.
  'shop.qty.keypad.invalid':
    '{qty_invalid} *Invalid quantity.*\n\n' +
    'Please send a whole number between *1* and *{max}*.',

  // ---- Buy-now → payment method picker -------------------------
  // `{promo_line}` is filled in by the caller — either an empty
  // string (no active promo) or the localized "Promo:" line WITH
  // its own trailing newline so the layout stays tight.
  'shop.pay.title':
    '{pay_summary} *Order summary*\n\n' +
    '{emoji} *{name}*\n' +
    '{prod_qty_selected} Qty: *{qty}*\n' +
    '{promo_line}' +
    '{prod_total_amount} Total: *{total}*\n' +
    '{prod_wallet} Wallet: *{balance}*\n' +
    '{referral_line}' +
    'Choose a pay method:',
  'shop.pay.referral_line':
    '{prod_referral} Referral Pay:\n*{available} available* • *{required} required*\n\n',
  // Wallet-pay confirmation card (page 2). Short labels with
  // premium emojis on every line. `{discount_line}` is filled in
  // by the caller (empty string when there is no active discount).
  'shop.pay.confirm':
    '{prod_wallet} *Confirm Payment*\n\n' +
    '{pay_summary} *Order*\n' +
    '{emoji} *{name}* × *{qty}*\n' +
    '{discount_line}' +
    '{prod_total_amount} *Total:* {total}\n' +
    '{prod_wallet} *Wallet:* {balance}\n\n' +
    '_Charge *{total}* from your wallet?_',
  // Optional discount row inside `shop.pay.confirm` — concatenated
  // by the caller when an active promo applies.
  'shop.pay.confirm.discount_line':
    '{prod_promo} *Discount:* −{discount}\n',
  // Inline qty-editor screen body. Renders as a "big counter" with
  // the current selected qty in monospace, the product name, and
  // the running total cost.
  'shop.qty.editor.title':
    '🔢 *Select quantity*\n\n' +
    '*{name}*\n' +
    'In stock: *{stock}*\n' +
    'Unit price: *{price}*\n\n' +
    'Selected: <code>{qty}</code>\n' +
    'Total: *{total}*',
  'shop.empty_categories': 'No categories yet. Please check back later.',
  'shop.empty_products': 'No products in this category yet.',
  // Product detail page — premium emojis prefix every label per
  // bot-owner UX request. Each `{prod_*}` token resolves to a
  // `<tg-emoji>` tag with the configured custom_emoji_id (animated
  // for premium subs, plain unicode for everyone else).
  'shop.product.line.name': '{emoji} *{name}*',
  'shop.product.line.price': '{prod_price_base} *Price Base:* {price}',
  // `{stock}` may render as either a number or the ∞ glyph (for
  // products with `unlimited_stock = true`).
  'shop.product.line.stock': '{prod_stock} *Available Stock:* {stock}',
  'shop.product.line.warranty': '{prod_warranty} *Warranty:* {warranty}',
  'shop.product.line.preorder_notice':
    '{feed_title} *Order Will automatically sended with in second after restock*',
  'shop.product.line.referral.progress':
    '{prod_referral} *Referral Pay:* Required {required} • Available {total} • Missing {remaining}',
  'shop.product.line.referral.ready':
    '{prod_referral} *Referral Pay:* Required {required} • Available {total} • Ready',
  'shop.product.line.referral.claimed':
    '{prod_referral} *Referral Pay:* Legacy order already used this balance',
  'shop.product.line.qty': '{prod_qty_selected} *Selected Qty:* {qty}',
  'shop.product.line.total': '{prod_total_amount} *Total Amount:* {total}',
  'shop.product.line.balance': '{prod_wallet} *Wallet:* {balance}',
  // Optional bonus line shown above Total Amount when an active
  // promo applies. `label` is either the admin-set promo name or
  // the auto-fallback "qty ≥ N".
  'shop.product.line.promo':
    '{prod_promo} *Promo:* {label} — −{discount}',
  'shop.product.line.promo.fallback_label': 'qty ≥ {min_qty}',
  // Teaser line under Warranty when a promo exists for this product
  // but the buyer hasn't reached the qty threshold yet. Hidden once
  // the threshold is met (the strikethrough Total takes over).
  'shop.product.line.promo.teaser':
    '{prod_promo} *Promo:* Buy {min_qty}+ −${discount} Off',
  'shop.product.line.promo.tier':
    '{prod_promo} *Promo:* {min_qty}+ → ${unit_price} each',
  'shop.product.line.promo.tier_teaser':
    '{prod_promo} *Promo:* Buy {min_qty}+ → ${unit_price} each',
  // Strikethrough Total Amount line shown when an active promo
  // applies — gross (struck) → effective price.
  'shop.product.line.total.discounted':
    '{prod_total_amount} *Total Amount:* ~~{gross}~~ {total}',
  'shop.product.out_of_stock_popup':
    '❌ This product is out of stock right now. Please contact admin to restock or pick a similar item.',
  'shop.note.title': '{note_premium} *Product Note*',
  'shop.note.empty': '_The admin hasn’t added any notes for this product yet._',
  'shop.note.empty_description': '_No description provided._',
  // Premium View Note layout (pic 2 reference). Token names use
  // `note_premium` for the header glyph, `note_desc` for the
  // Description label and `note_text` for the Note label so the
  // admin can swap each premium emoji independently via
  // `/setemoji note_premium / note_desc / note_text`. Variables
  // (`description` / `note`) are substituted by `t()` BEFORE
  // `renderMdHtml` runs the premium-emoji pass — so a `{note}`
  // variable here would collide with the EMOJI key of the same name.
  'shop.note.full': [
    '{note_premium} *View Note — {name}*',
    '',
    '{note_desc} *Description:*',
    '{description}',
    '',
    '{note_text} *Note:*',
    '{note}',
  ].join('\n'),
  // Legacy single-message confirmation — still used by /settext
  // overrides and by the deposit credit reply. The new wallet-pay
  // delivery card uses the two-step `payment_verified` /
  // `order_delivered` keys below.
  'shop.buy.success':
    '✅ Purchase successful!\n\nProduct: *{name}*\nQty: *{qty}*\nTotal: *{total}*\n\nDelivery:\n```\n{delivery}\n```',
  // Step 1 of the premium delivery card (pic 3): Payment Verified!
  // Auto-deletes 15 seconds after being sent (handled in shop.ts).
  'shop.buy.payment_verified': [
    '{order_verified} *Payment Verified!*',
    '',
    '*Order ID:* `{order_id}`',
    '*Amount:* {total}',
    '*Paid via:* {paid_via}',
    '',
    '{delivering} _Preparing your delivery…_',
  ].join('\n'),
  // Step 2 of the premium delivery card (pic 3): Order Delivered!
  // The `{items}` slot is replaced in `shop.ts` with one `> line` per
  // claimed link / account so the renderer turns each into a Telegram
  // blockquote pill (matches the View Note "luli" / "Hey" look).
  'shop.buy.order_delivered': [
    '{order_delivered} *Order Delivered!*',
    '',
    '*Order ID#:* `{order_id}`',
    '*Product:* {name}',
    '*Quantity:* {qty}',
    '*Total Paid:* {total} USDT',
    '',
    '{delivered_items} *Items:*',
    '{items}',
  ].join('\n'),
  'shop.buy.order_preordered': [
    '{feed_title} *Preorder Placed!*',
    '',
    '*Order ID#:* `{order_id}`',
    '*Product:* {name}',
    '*Quantity:* {qty}',
    '*Total Paid:* {total} USDT',
    '',
    '{delivered_items} *Status:*',
    '{items}',
  ].join('\n'),
  'shop.buy.order_auto_delivered': [
    '{order_delivered} *Delivery has been automatically done!*',
    '',
    '*Order ID#:* `{order_id}`',
    '*Product:* {name}',
    '*Quantity:* {qty}',
    '*Total Paid:* {total} USDT',
    '',
    '{delivered_items} *Items:*',
    '{items}',
  ].join('\n'),
  // Email follow-up #1: shown after Order Delivered when the buyer
  // has NO email on file. The `{email_add_l/r}` slots are left/right
  // premium-emoji bookends per the bot-owner spec.
  'shop.buy.add_email_prompt': [
    '{email_add_l} *Please For sending Product Invoices and good experience Add you Verified Email* {email_add_r}',
  ].join('\n'),
  // Email follow-up #2: shown after Order Delivered when the buyer
  // already has an email on file. Single bold line bookended by the
  // configured premium-emoji slots; auto-deletes ~13 s later (handled
  // in `shop.ts`).
  'shop.buy.invoice_sent':
    '{invoice_sent_l} *Product invoice sended to your mail* {invoice_sent_r}',
  // Confirmation shown immediately after a buyer adds their email via
  // the post-purchase `Add Verified Email` CTA. The other Email
  // Settings entries (typed-email message, "User Profile / Has been
  // Saved!" card) are auto-deleted from chat first — only this single
  // bold line remains.
  'shop.buy.email_setup_done':
    '{order_delivered} *Email has been setuped*',
  // Notification shown when an admin tops up a user's wallet via the
  // `/credit` flow. `{credit_emoji}` slots a premium credit-card glyph
  // and `{balance_emoji}` slots a premium wallet glyph so admins can
  // swap the icons via `/setemoji credit_emoji / balance_emoji`.
  'wallet.admin_credit':
    '{credit_emoji} admin credited *${amount}* to your wallet.\n{balance_emoji} New balance: *${balance}*',
  'wallet.admin_debit':
    '{debit_emoji} admin debited *${amount}* from your wallet.\n{balance_emoji} New balance: *${balance}*',
  'shop.buy.delivery_pending':
    'Coming soon — admin will deliver your items manually within 12h.',
  'shop.buy.preorder_pending':
    'Preorder pending — automatically deliver will be done after restock.',
  'shop.buy.insufficient':
    '❌ Insufficient wallet balance. You need *{need}* but only have *{have}*. Please top up first.',
  'shop.buy.no_stock': '❌ Sorry, this item is out of stock.',
  // Generic Wallet-Pay failure popup. Shown when something other
  // than INSUFFICIENT_FUNDS goes wrong (DB error, missing migration,
  // network) so the loading spinner is always dismissed.
  'shop.buy.failed':
    '❌ Payment could not be completed right now. Please try again in a moment, or contact admin if it keeps happening.',
  'shop.referral.disabled': '❌ Referral Pay is not enabled for this product.',
  'shop.referral.already_redeemed': '✅ Referral Pay was already used on this legacy order.',
  'shop.referral.insufficient':
    '❌ Not enough referrals. Required: {required}. Available: {total}. Missing: {remaining}.',
  'shop.referral.insufficient.card': [
    '⚠️ *Referral Balance Is Low*',
    '',
    '{prod_referral} *Required:* {required} referrals',
    '{refer_user} *Available:* {available} referrals',
    '{qty_invalid} *Still Needed:* {remaining} referrals',
    '',
    '{refer_title} Invite users with your referral link, refresh this page, then pay with Referral Pay.',
  ].join('\n'),
  'shop.referral.confirm': [
    '{refer_title} *Confirm Referral Pay*',
    '',
    '{emoji} *{name}* × *{qty}*',
    '{prod_referral} *Required:* {required} referrals',
    '{refer_user} *Available:* {available} referrals',
    '{delivery_check} *After Pay:* {after} referrals',
    '',
    '_Use your active referrals for this order?_',
  ].join('\n'),
  'shop.referral.failed':
    '❌ Referral payment could not be completed right now. Please try again or contact admin.',
  'shop.referral.confirmed': [
    '{refer_title} *Referral Payment Successful!*',
    '',
    '*Product:* {name}',
    '*Qty:* {qty}',
    '*Referrals Used:* {spent}',
    '',
    '{delivering} _Delivering your order…_',
  ].join('\n'),
  'shop.referral.delivery': 'Referral Pay for product #{product_id} (qty: {qty})',
  // Kept for backwards compat with any /settext overrides referencing
  // the old key, even though the email gate is no longer enforced.
  'shop.buy.email_required':
    'Setup email system first — we need your email to send the receipt.',

  // ---------- Post-purchase delivery form ----------
  // Shown after Order Delivered for products where the admin enabled
  // a per-product detail-submission form (e.g. account email +
  // password, gift-card code, recovery key, …). The buyer first sees
  // the admin's free-form `delivery_instruction` text, then a single
  // "submission box" message that walks them through `delivery_fields`
  // one prompt at a time.
  'shop.delivery.instruction.default': [
    '{delivery_box} *Obtaining Details*',
    '',
    '_Please tap *Add Details* and send the required information. Your details go straight to the admin desk and you will be notified when setup is done._',
  ].join('\n'),
  'shop.delivery.box.header': [
    '{delivery_box} *Add Details — {product_name}*',
    '',
    '_Step {current}/{total}_',
  ].join('\n'),
  'shop.delivery.box.prompt': '{delivery_field} Send your *{label}* below {email_arrow}',
  'shop.delivery.box.prompt_optional':
    '{delivery_field} Send your *{label}* below {email_arrow}\n_(optional — type `skip` to leave blank)_',
  'shop.delivery.box.summary_header': '{delivery_box} *Your Details — {product_name}*',
  'shop.delivery.box.summary_row': '• *{label}:* `{value}`',
  'shop.delivery.box.invalid':
    '{qty_invalid} _That doesn\'t look right. Please send your *{label}* again._',
  'shop.delivery.success.default': [
    '{delivery_check} *Your Details Has been Submitted Successfully* {email_saved_check}',
    '',
    '_Thank you — our team is reviewing your submission and will approve it shortly. If you don\'t hear back soon, tap *Admin Help* below._',
  ].join('\n'),
  'shop.delivery.success.resubmitted': [
    '{delivery_resubmit} *Your Details Has been Re submitted as Corrected* {email_saved_check}',
    '',
    '_Thank you — your corrected info has been forwarded to our vendor. They will use this NEW submission instead of the previous one._',
  ].join('\n'),
  'shop.delivery.completed.default': [
    '{delivery_check} *Your Order Is Ready*',
    '',
    '*Product:* {product_name}',
    '*Order:* `{order_id}`',
    '',
    '_Your submitted details were processed successfully. You can use the service now._',
  ].join('\n'),
  // Auto-text pre-filled into the admin DM when the buyer taps the
  // Admin Help button on the success card. Telegram URL-encodes this
  // when we append it to `?text=…` so newlines + emoji are safe.
  'shop.delivery.admin_help.first': [
    'Hey admin i need help about {product_name} —',
    'I have sent {field_summary} but still did not approved, please help me.',
    'Order: {order_tag}',
  ].join('\n'),
  'shop.delivery.admin_help.resubmit': [
    'Hey admin my {field_summary} About {product_name} has been resubmitted,',
    'please don\'t use the old details — this is the correct one. Help me.',
    'Order: {order_tag}',
  ].join('\n'),
  // Buttons that appear under the success card.
  'btn.delivery.edit': 'Edit Details',
  'btn.delivery.admin_help': 'Admin Help',
  'btn.delivery.done': 'Done',
  'btn.delivery.manual_message': 'Custom Message',
  // Shown when the Edit Details button is tapped but the bot can't
  // recover the original submission (deleted, product gone, …).
  'shop.delivery.edit_unavailable':
    '⚠️ _We couldn\'t reopen your previous submission. Please tap *Admin Help* on your order so we can fix this manually._',
  // Vendor DM body — sent to `delivery_vendor_chat_id` whenever the
  // buyer submits OR resubmits the form. `{header}` switches between
  // the new-order and corrected-order banners.
  'shop.delivery.vendor.new': [
    '{delivery_vendor} *Hey my dear vendor — here is a new order to fulfil.*',
    '',
    '*Order Tag:* {order_tag}',
    '*Product:* {product_name}',
    '*Quantity:* {qty}',
    '*Buyer:* {buyer}',
    '',
    '*Submitted Details:*',
    '{details}',
    '',
    '_Please add this buyer to the workspace as fast as possible. (This message is automated — please process this order quickly.)_',
  ].join('\n'),
  'shop.delivery.vendor.resubmit': [
    '{delivery_resubmit} *Heads up vendor — corrected details for an existing order.*',
    '',
    '*Order Tag:* {order_tag}',
    '*Product:* {product_name}',
    '*Quantity:* {qty}',
    '*Buyer:* {buyer}',
    '',
    '*Corrected Details (revision {revision}):*',
    '{details}',
    '',
    '_Use these NEW details — discard the previous submission. (This message is automated — please process the correction quickly.)_',
  ].join('\n'),

  // ---------- Using Method tutorial ----------
  // Per-product tutorial body shown when the buyer taps `📘 Using
  // Method` under an Order Delivered card.
  'shop.tutorial.body': [
    '{tutorial} *Using Method — {name}*',
    '',
    '{body}',
  ].join('\n'),
  'shop.tutorial.empty': [
    '{tutorial} *Using Method — {name}*',
    '',
    '_The admin hasn’t added a tutorial for this product yet. Please contact admin if you need help using your purchase._',
  ].join('\n'),
  'shop.page.header': '🛒 *{category}*\n\n*Available Products:*\n_{total} products — page {page}/{pages}_',

  // ---------- Profile ----------
  'profile.title': '*User Profile*',
  'profile.notifications.title': '{notify_bell} *Notifications*',
  'profile.notifications.body':
    '{notify_on} _Tune in only the alerts you love_ {notify_bell}\n\n' +
    '{notify_stock} *Stock Alerts*\n' +
    '{notify_info} *Info Alerts*\n' +
    '{notify_wallet} *Wallet Alerts*\n' +
    '{notify_email} *Email Reports*\n\n' +
    '{notify_on} ON\n' +
    '{notify_off} OFF',
  'profile.row.id': 'ID: `{id}`',
  'profile.row.first_name': 'First Name: *{name}*',
  'profile.row.first_name_empty': 'First Name: _not set_',
  'profile.row.username': 'Username: @{username}',
  'profile.row.username_empty': 'Username: _not set_',
  'profile.row.link': 'User link: [open]({link})',
  'profile.row.status': 'Status: *{status}*',
  'profile.row.email': 'Email: `{email}` — Has been Saved! {email_saved_check}',
  'profile.row.email_empty': 'Email: _not set_ — tap *Set Email* below',
  'profile.row.balance': 'Balance: *{balance} USDT*',
  'profile.row.currency': 'Currency: *{currency}*',
  'profile.row.language': 'Language: *{language}*',
  'profile.row.region': 'Region: *{region}* — local time *{time}*',
  'profile.row.region_empty': 'Region: _not set_ — tap *Set Region*',
  'profile.row.joined': 'Joined: *{joined}*',
  // Legacy keys (kept for any callers referencing them via /settext)
  'profile.user_id': 'ID: `{id}`',
  'profile.username': 'Username: @{username}',
  'profile.balance': 'Balance: *{balance}*',
  'profile.language': 'Language: *{language}*',
  'profile.joined': 'Joined: *{joined}*',
  'profile.status.default': 'started bot',
  // Language picker screen — opened from Settings → Language.
  'profile.language.title': '{lang_left} *Select Language* {lang_right}',
  'profile.region.title': '🗺 *Set Region*',
  'profile.region.body':
    'Pick your country — your local time will then be used in messages and timestamps.',
  'profile.region.saved': '✅ Region set to *{region}*. Local time: *{time}*.',
  // Set Email screen (no email yet).
  'profile.email.set.title': '{email_bracket_l} *Set Email* {profile_email}',
  'profile.email.set.body':
    'Enter Below {email_arrow} *Your Email*\n\nEmail: `example@mail.com` {email_saved_check}',
  // Change Email screen (email already set).
  'profile.email.change.title': '{email_bracket_l} *Change Email* {email_bracket_r}',
  'profile.email.change.body':
    'Current Email {profile_email}: `{current}`\n\nEnter Below {email_arrow} *Your New Email*:\nExample: `Example@Email.Com` {email_saved_check}',
  // Why Email screen.
  'profile.email.why.title': '{email_bracket_l} *We Need Your Email* {profile_email}',
  'profile.email.why.body':
    '{email_saved_check} We need your email to send invoices {email_invoice} and to keep our services secure {email_secure} — thanks {email_thanks}.',
  // Misc.
  'profile.email.saved': '✅ Email saved: `{email}`',
  'profile.email.bad': '{email_invalid} *Please Enter A Valid Email*',
  // 12-hour soft-nag reminder for users without a saved email. Sent
  // by `services/emailNag.ts` on the first interaction after every
  // 12-hour window. Users can mute this from Notifications →
  // Email Reports.
  'profile.email.nag': [
    '{email_nag} *Please Add Your Verified Email for More Secured Experience*',
    '',
    '_Tap *Settings → Email Settings → Set Email* to add yours._',
    '',
    '{email_thanks} _Thanks!_',
  ].join('\n'),
  // Popup error shown on the Send-PDF buttons when Email Reports is
  // OFF — gives the user the explicit unblock path.
  'profile.email.reports_off_popup':
    'Email Reports are turned OFF. Open Notifications → toggle "Email Reports: ON" first, then try again.',
  // Toast labels for the Email Reports toggle (mirrors the other
  // notification toggles' verbiage).
  'profile.notify.email_on': '🟢 Email Reports: ON',
  'profile.notify.email_off': '🔕 Email Reports: OFF',

  // ---------- Bot Tutorial (Settings) ----------
  // Admin-editable instructions screen (text + optional photo /
  // video / document attachment + optional URL button). Body is
  // reused verbatim from the `bot_tutorial.text` setting; the
  // header / footer wrap it in premium emojis.
  'profile.bot_tutorial.title': '{bot_tutorial} *Using Method — Bot*',
  'profile.bot_tutorial.empty':
    '_The admin hasn\u2019t added a bot tutorial yet. Please check back later._',
  'profile.bot_tutorial.body': '{body}',

  // ---------- Per-payment-method tutorial card ----------
  // Admin-editable instructions surfaced from every chain / Binance /
  // LTC payment screen. `pay.tutorial.title` carries the tutorial
  // book glyph + the method's display name; the body is reused
  // verbatim from the `pay_tutorial.<method_id>.text` setting.
  'pay.tutorial.title': '{tutorial} *Where to find your reference — {method}*',
  'pay.tutorial.empty':
    '_The admin hasn\u2019t added a tutorial for this payment method yet. Please check back later._',
  'pay.tutorial.body': '{body}',

  // ---------- Send Price List (Settings) ----------
  // Two-button picker. After picking a destination the user gets a
  // CSV with name / status / price / promo info. The mail variant
  // pipes the same CSV through `mailer.ts`; the chat variant sends
  // a Telegram document reply.
  'profile.pricelist.title': '{price_list} *Send Price List*',
  'profile.pricelist.body':
    '{price_list} _Choose where to send the live price-list CSV._\n\n' +
    '\u2022 *Send on Mail* \u2014 we\u2019ll email it to your saved address.\n' +
    '\u2022 *Send in Chat* \u2014 we\u2019ll attach it here as a downloadable file.',
  'profile.pricelist.no_email_popup':
    'Set your email first \u2014 open Settings \u2192 Email Settings \u2192 Set Email.',
  'profile.pricelist.empty':
    'No products in the catalog yet \u2014 ask the admin to add some.',
  'profile.pricelist.sending':
    '\u23f3 Building your price list\u2026',
  'profile.pricelist.mail_sent':
    '{pdf_sent_l} *Price list mailed!* Check your inbox at `{email}`.',
  'profile.pricelist.mail_failed':
    '\u274c Failed to email the price list. Please try again later.',
  'profile.pricelist.chat_sent':
    '{pdf_sent_r} *Price list ready \u2014 see the CSV above.*',
  // CSV header rows + status labels used by `services/csvReport.ts`.
  'profile.pricelist.csv.col.name': 'Product',
  'profile.pricelist.csv.col.price': 'Price (USDT)',
  'profile.pricelist.csv.col.status': 'Status',
  'profile.pricelist.csv.col.stock': 'Stock',
  'profile.pricelist.csv.col.promo': 'Promo',
  'profile.pricelist.csv.status.in_stock': 'In Stock',
  'profile.pricelist.csv.status.out_of_stock': 'Out of Stock',
  'profile.pricelist.csv.status.upcoming': 'Upcoming',
  'profile.pricelist.csv.promo_none': '\u2014',
  'profile.pricelist.csv.promo_format': 'Buy {min_qty}+ \u2212{discount} USDT',
  'profile.pricelist.csv.promo_tier_format': 'Buy {min_qty}+ \u2192 {unit_price} USDT each',
  'profile.pricelist.csv.unlimited': '\u221e',
  // PDF (mail-only) — title / section header used by buildPriceListPdf.
  'profile.pricelist.pdf.title': 'Digitalora \u2014 Price List',
  'profile.pricelist.pdf.section': 'Catalog',
  // Footer surfaced both in the CSV body and in the email subject /
  // body. Admin can override the marketing copy via /settext
  // `profile.pricelist.promo_footer`.
  'profile.pricelist.promo_footer':
    'Thanks for choosing Digitalora. Tap the bot to redeem promos and earn referral rewards. \ud83d\udc2f',
  // Email Settings hub (the new submenu opened from a single Settings button).
  'profile.email.hub.title': '{email_bracket_l} *Email Settings* {profile_email}',
  'profile.email.hub.body':
    '{email_invoice} We use your email for purchase receipts and account-recovery only — never for marketing.\n\n' +
    '{profile_email} *Current email:* `{current}`',
  // Mobile popup shown when the user taps "Change Email" without one.
  'profile.email.change.no_email_popup': 'Please Set up email first',
  // Mobile popup shown when the user taps "Set Email" but already has one.
  'profile.email.set.already_set_popup':
    'Email has already been set ({current}). Use Change Email or Delete Email to update it.',
  // Mobile popup shown when the user taps "Delete Email" without one.
  'profile.email.delete.no_email_popup': 'No email is set yet — nothing to delete.',
  // Delete Email confirmation screen.
  'profile.email.delete.title': '{email_bracket_l} *Delete Email* {email_bracket_l}',
  'profile.email.delete.body':
    '{email_invalid} _Please confirm to delete email_\n\n' +
    '{profile_email} *Current email:* `{current}`',
  // Toast shown after the email is removed.
  'profile.email.delete.success': '✅ Email removed.',
  // Shown when another user already has this email.
  'profile.email.in_use':
    '{email_in_use} Email already in *use*\n\n' +
    '{email_arrow} *_Please enter a new verified email_*',
  // Buttons used on the Settings screen + email sub-screens.
  'btn.email.settings': '📧 Email Settings',
  'btn.email.change': '✏️ Change Email',
  'btn.email.set': '📧 Set Email',
  'btn.email.why': '❔ Why Email',
  'btn.email.delete': '🗑 Delete Email',
  'btn.email.delete.confirm': '🗑 Confirm Delete',
  'btn.email.delete.cancel': '⬅️ Cancel',
  'btn.email.know_more': '📄 Know More',
  // Send-PDF buttons (My Orders / My Deposits / My Stats screens).
  'btn.send_pdf.orders': 'Send Orders PDF to Email',
  'btn.send_pdf.deposits': '📤 Send Deposits PDF to Email',
  'btn.send_pdf.stats': '📤 Send Stats PDF to Email',
  // Pop-ups for the Send-PDF buttons.
  'pdf.no_email_popup':
    '⚠️ Set your email first. Open Settings → Email Settings → Set Email to add one, then come back and tap Send PDF.',
  'pdf.sending_popup': '⏳ Generating your PDF and sending it to {email}…',
  'pdf.sent_popup': '✅ PDF sent to {email}. Check your inbox (and spam folder).',
  // Chat-message ribbon shown right after a Send-PDF tap succeeds.
  // Uses the premium 📬 emoji so the success lands as a custom-emoji
  // entity rather than a plain toast.
  'pdf.sent_message': '{pdf_sent_l} *Pdf has been sended to mail* {pdf_sent_r}',
  'pdf.failed_popup':
    '❌ Could not send PDF to {email}. Please try again in a moment — if it keeps failing, contact support.',
  // My Deposits button.
  'btn.my_deposits': '💳 My Deposits',
  // Redeem Gift Code button (Settings) + screen.
  'btn.redeem': '🎁 Gift Code',
  'btn.buy_code': '🛒 Buy Code',
  // ---------- Redeem Gift Code screen ----------
  'gift.title': '{gift_title} *Redeem Gift Code*',
  'gift.body':
    '{gift_send} Send your gift code below to credit USDT {gift_usdt} to your wallet.\n\n' +
    '{gift_balance} *Current Balance:* {balance} USDT\n\n' +
    '_Each gift code can be redeemed only once per user (unless owner sets a higher limit)._',
  'gift.expired': '{gift_expired} This gift code has expired.',
  'gift.invalid': '{gift_invalid} This gift code is invalid.',
  'gift.already_used': '{gift_expired} You have already redeemed this code.',
  'gift.exhausted': '{gift_expired} This gift code is no longer available.',
  'gift.redeemed':
    '{gift_redeemed} Gift code has been redeemed successfully — *{amount} USDT* has been credited.',
  // ---------- My Orders screen ----------
  'orders.title': '{orders_title} *My Orders*',
  'orders.body': 'Tap any order below to open details, or send the public Order ID shown in your receipt.',
  'orders.empty':
    '{orders_title} *My Orders*\n\n' +
    '🪄 No orders yet.\n\n' +
    '✨ 🛍️ 🚀 Start shopping and your orders will appear here!',
  'orders.page': 'Page {page}/{pages}',
  'orders.status.active': 'Active',
  'orders.status.refunded': 'Refunded',
  'orders.status.cancelled': 'Cancelled',
  // Order detail screen.
  'orders.detail.title': '{orders_title} *My Orders*',
  'orders.detail.id': '{orders_id} *Order ID#* : `{id}`',
  'orders.detail.product': '{orders_product} *Product:* {name}',
  'orders.detail.type': '{orders_type} *Type:* {type}',
  'orders.detail.qty': '{orders_qty} *Selected Qty:* {qty}',
  'orders.detail.total': '{orders_total} *Total Amount:* {total} USDT',
  'orders.detail.when': '{orders_when} *When:* {when}',
  'orders.detail.status': '{orders_status} *Status:* {status}',
  'orders.detail.paid': '{orders_type} *Paid:* {paid}',
  'orders.detail.delivered': '{orders_status} *Delivered:* {delivered}',
  'orders.detail.note': '*Product Note* {orders_note}\n{note}',
  'orders.detail.warranty': '*Warranty:* {warranty} {orders_warranty}',
  'orders.detail.received': '*Received:* {orders_received}\n\n{received}',
  'orders.detail.no_warranty': 'Non',
  'orders.detail.type.wallet': 'Wallet balance',
  'orders.detail.type.direct': 'Direct payment',
  // Buttons used on the Order detail screen.
  'btn.orders_back_list': 'Back to Orders',
  'btn.orders_open_link': 'Open Link',
  // Find by Order ID — opens a typed-input flow for a public order id.
  'btn.find_order_by_id': '🔍 Find by Order ID',
  // Prompt + error responses for the Find by Order ID flow. Custom
  // emoji ids resolve to premium glyphs at render time.
  'orders.lookup.prompt':
    '{order_id_find_l} *Send Your Order ID to find.* {order_id_find_r}',
  'orders.lookup.invalid':
    '{gift_invalid} That doesn\'t look like a valid Order ID. {order_id_invalid_r}',
  // Legacy keys kept so anything still calling them won't break.
  'profile.email.title': '📧 *Set Email*',
  'profile.email.body':
    'Send your contact email — replies and receipts will use this address.\n\nOr `/cancel`.',
  // Refer & Earn screen.
  'profile.refer.title': '{refer_title} *Refer & Earn*',
  'profile.refer.body':
    '{refer_prize_l} *Refer 5 users and win $0.10* {refer_prize_r}\n' +
    '\n' +
    '{refer_clicks} *Clicks:* {clicks}\n' +
    '{refer_pending} *Pending:* {pending}\n' +
    '{refer_active} *Active:* {active}\n' +
    '{refer_left} *Left:* {left}\n' +
    '{refer_total} *Referred (Total):* {refTotal}\n' +
    '{refer_coin} *Total Earned:* {earnedTotal} USDT\n' +
    '{refer_withdrawn} *Withdrawn:* {withdrawn} USDT\n' +
    '\n' +
    '{refer_paybalance} *Referral Pay Balance:* {refAvailable} refs\n' +
    '{refer_spent} *Converted To Usdt:* {converted} refs\n' +
    '\n' +
    '_Transfer earnings to your wallet once they reach $0.50. For cash withdrawal, contact support._\n' +
    '\n' +
    '*Your Referral Link:*\n`{link}`',
  'profile.refer.convert_success':
    '💱 Converted *{refs} refs* into *{amount} USDT*.\n\n💳 Wallet Balance: *{balance} USDT*',
  'profile.refer.convert_low':
    '⚠️ Not enough referrals to convert yet.\n\nConverting into your wallet needs *${min}* worth of referrals.\nCurrent balance: *{available} refs* (≈ ${earned}).',
  'profile.refer.convert_error':
    '⚠️ Could not convert refs right now. Please try again.',
  'btn.copy_link': '📋 Copy Link',
  'btn.live_refers': '🔵 See Your Live Refers',
  'btn.refer_convert': '💱 Convert to Wallet',
  'btn.currency': '💱 Currency',
  'btn.shop_view': '🛍 Shop View',
  'btn.shop_grouping': '🎁 Shop Grouping',
  'btn.shop_view_paged': '🧾 10 per page',
  'btn.shop_view_all': '📦 All products list',
  'btn.shop_grouped': '🎁 Grouped products',
  'btn.shop_ungrouped': '📦 Ungrouped products',
  'btn.stats.24h': '24h',
  'btn.stats.7d': '7d',
  'btn.stats.30d': '30d',
  'btn.stats.custom': 'Custom',
  'profile.currency.title': '💱 *Choose Currency*',
  'profile.currency.body':
    'Your product prices will show your selected currency plus USDT. Payments still use USDT.',
  'profile.currency.saved': '✅ Currency set to {currency}.',
  'profile.currency.error':
    '⚠️ Could not save currency yet. Please apply migration `0033_user_currency.sql` first.',
  'profile.shop_view.title': '{broadcast_shop_now} *Shop View Style*',
  'profile.shop_view.body': 'Choose how product buttons are shown in your Shop.',
  'profile.shop_group.title': '{prod_promo} *Shop Grouping*',
  'profile.shop_group.body': 'Choose if plan categories show as one grouped button or every product separately.',
  'profile.shop_view.paged': '{orders_title} *10 per page* = old default with Next/Prev.',
  'profile.shop_view.all': '{orders_product} *All products list* = one long list with only Refresh + Back.',
  'profile.shop_view.grouped': '{prod_promo} *Grouped products* = show plan groups like Grok All Plans.',
  'profile.shop_view.ungrouped': '{orders_product} *Ungrouped products* = show every product separately.',
  'profile.shop_view.current': 'Current: *{mode}*',
  'profile.shop_view.group_current': 'Grouping: *{mode}*',
  'profile.shop_view.saved.paged': 'Shop view set to 10 per page.',
  'profile.shop_view.saved.all': 'Shop view set to all products.',
  'profile.shop_view.saved.grouped': 'Shop grouping enabled.',
  'profile.shop_view.saved.ungrouped': 'Shop grouping disabled.',
  'profile.orders.empty': 'You have no orders yet.',
  'profile.orders.title': '🧾 *My Orders*',
  'profile.orders.line': '#{id} • {name} ×{qty} • {total} • {date}',
  'profile.notify.stock_on': 'Stock Alerts: ✅ ON',
  'profile.notify.stock_off': 'Stock Alerts: ⛔ OFF',
  'profile.notify.ann_on': 'Info Alerts: ✅ ON',
  'profile.notify.ann_off': 'Info Alerts: ⛔ OFF',
  'profile.notify.wallet_on': 'Wallet Alerts: ✅ ON',
  'profile.notify.wallet_off': 'Wallet Alerts: ⛔ OFF',
  'profile.notify.error':
    '⚠️ Could not save your toggle — apply migration `0008_wallet_alert.sql` on the database.',
  // ---------- My Deposits screen (rewritten) ----------
  'profile.deposits.title': '{deposits_title} *My Deposits*',
  'profile.deposits.empty': '{email_bracket_l} No deposits yet. {email_bracket_l}',
  'profile.deposits.payments_header': '*Payment Deposits* {deposits_payments}',
  'profile.deposits.wallet_header': '*Wallet Balance History* {deposits_wallet}',
  'profile.deposits.line.id': '*#{n}*',
  'profile.deposits.line.amount': 'Amount: {amount} USDT',
  'profile.deposits.line.method': 'Method: {method}',
  'profile.deposits.line.status': 'Status: {status}',
  'profile.deposits.line.reference': 'Reference: `{reference}`',
  'profile.deposits.line.when': 'When: {when}',
  'profile.deposits.wallet.line.type': 'Type: {type}',
  'profile.deposits.wallet.line.amount': 'Amount: {sign}{amount} USDT',
  'profile.deposits.wallet.line.reference': 'Reference: `{reference}`',
  'profile.deposits.wallet.line.when': 'When: {when}',
  // Wallet ledger type labels.
  'profile.deposits.wallet.type.wallet_purchase': 'Wallet purchase',
  'profile.deposits.wallet.type.deposit_credit': 'Deposit credit',
  'profile.deposits.wallet.type.admin_add_balance': 'Admin added balance',
  'profile.deposits.wallet.type.admin_deduct_balance': 'Admin deducted balance',
  // Status labels (deposit row).
  'profile.deposits.status.pending': 'pending_review',
  'profile.deposits.status.approved': 'Credited',
  'profile.deposits.status.rejected': 'failed',

  'profile.stats.title': 'Your Stats',
  'profile.stats.orders': 'Orders: {count}',
  'profile.stats.items': 'Items Bought: {count}',
  'profile.stats.spent': 'Total Spent: {amount} USDT',
  'profile.stats.last': 'Last Order: {rel} ({abs})',
  'profile.stats.last_none': 'Last Order: —',
  'profile.stats.deposits': 'Deposits: {amount} USDT',
  'profile.stats.rel.now': 'just now',
  'profile.stats.rel.minutes': '{n}m ago',
  'profile.stats.rel.hours': '{n}h ago',
  'profile.stats.rel.days': '{n}d ago',

  // ---------- Topup ----------
  'topup.title': '👛 *Top Up Wallet*',
  'topup.wallet_summary': '💰 *Current balance:* {balance}',
  'topup.security_note': '🔐 _Payments are verified before your wallet is credited. Never share your TXID/Order ID with anyone claiming to be support._',
  'topup.choose_method': '👛 *Top Up Wallet*',
  'topup.empty_methods': 'No payment methods configured. Please contact support.',
  'topup.method.body': '*{name}*\n\n{instructions}',
  'topup.requested':
    '✅ Topup request submitted (#{id}).\nAdmin will verify and credit your wallet shortly.',
  'topup.cryptobot.amount_prompt':
    '*CryptoBot USDT Top-Up*\n\nHow much USDT would you like to add?\nReply with an amount (minimum: *{min}*).',
  'topup.cryptobot.invalid_amount':
    '❌ Please send a valid USDT amount (minimum: *{min}*).',
  'topup.cryptobot.start_failed':
    '⚠️ Could not start the CryptoBot top-up. Please try again or use another payment method.',
  'topup.cryptobot.invoice_failed':
    '⚠️ Could not create a CryptoBot invoice right now. Please try again shortly.',
  'topup.cryptobot.invoice_ready':
    '*CryptoBot invoice ready*\n\nAmount: *{amount}*\n\nTap *Open invoice*, complete the payment in CryptoBot, then tap *Check*.',
  'directpay.cryptobot.invoice_ready':
    '*CryptoBot direct-pay invoice ready*\n\nAmount: *{amount} USDT*\n\nTap *Open invoice*, complete the payment in CryptoBot, then tap *Check* to deliver your order.',
  'topup.cryptobot.open_invoice': '💳 Open invoice',
  'topup.cryptobot.check': '✅ I’ve paid / Check',
  'topup.cryptobot.check_unavailable': 'This payment is already resolved or unavailable.',
  'topup.cryptobot.check_failed': 'Could not check payment right now. Try again shortly.',
  'topup.cryptobot.not_paid': 'Payment not received yet. Tap Check again after paying.',
  'topup.cryptobot.check_success': 'Payment confirmed and wallet credited.',
  'topup.cryptobot.already_processed': 'Payment already processed.',
  'topup.cryptobot.finalize_failed': 'Could not finalize payment right now. Please try again.',
  'topup.cryptobot.success':
    '✅ *CryptoBot payment confirmed!*\n\nDeposit ID: *{depositId}*\nCredited: *{amount}*\nNew balance: *{balance}*',

  // ---------- Support ----------
  'support.title': '{support_title} Support',
  'support.body':
    '_*If you\'re unable to send a message or have an issue, use Live Support to connect directly with an admin.*_',
  'support.btn.contact': '📩 Contact Admin',
  // Pre-filled into the admin DM's input bar when the user taps
  // Contact Admin (via t.me/<admin>?text=...).
  'support.contact_prefill': 'Hi i need help about ShopBot Digitalora Please Help me about : ',
  'support.btn.cancel': 'Cancel Support',
  'support.btn.live': '🟢 Live Support',
  'support.btn.end_session': '🔴 End Session',
  // Live-Support relay copy.
  'support.live.busy_popup':
    '⏳ The admin is currently helping another user. Please try again in a moment.',
  'support.live.user_active':
    '{support_live_active} Live Support\n\n' +
    'Support session active.\n\n' +
    'Just type your message right here in this chat — every message is delivered straight to the admin. Tap *Cancel Support* anytime to end the session.',
  // Small status line edited into the original Support screen so chat
  // history shows when each session was opened.
  'support.live.session_created': '🟢 *Live Support session created*',
  'support.live.admin_started':
    '🟢 *Live Support started*\n\n' +
    'User: *{name}* (@{username})\nID: `{id}`\n\nReply here to chat with them. Send /end to close.',
  // No [Admin] tag on the user-facing side — the relay just forwards
  // the admin's raw text or media so it reads like a normal chat.
  'support.live.admin_relay': '*[{name}]:* {text}',
  'support.live.admin_media_header': '*[{name}]* sent media:',
  'support.live.user_ended':
    '{support_live_closed} Live Support closed.\n\n' +
    'Open Support again from the menu whenever you need help.',
  'support.live.admin_ended': '🔴 *Live Support session closed.*',
  // Surfaced to the user when the bot can't deliver the session-start
  // message to the admin chat (most common cause: the new admin
  // account has never tapped Start on this bot, so Telegram refuses
  // every bot-initiated message until they do). Replaces the old
  // silent-fail behaviour where the user saw a working Live Support
  // panel but the admin received nothing.
  'support.live.unavailable_popup':
    '⚠️ Live Support is temporarily unavailable — the admin chat is unreachable right now. Please use Contact Admin from the Support menu, or try Live Support again in a moment.',
  'support.live.unavailable_message':
    '⚠️ *Live Support unavailable*\n\n' +
    "Couldn't reach the admin right now. This usually means the admin needs to open this bot and tap *Start* once so Telegram lets the bot DM them.\n\n" +
    'Please use *Contact Admin* from the Support menu for now.',
  // "Send chat PDF to email" follow-up under the closure message.
  'support.btn.email_transcript': '📧 Send chat PDF to email',
  // Reuses pdf_sent_l / pdf_sent_r so the success copy renders the
  // same animated frame the user sees after Send-PDF on My Orders.
  'support.transcript.sent_message':
    '{pdf_sent_l} *Pdf has been sended to mail* {pdf_sent_r}',
  'support.transcript.no_email_popup':
    '⚠️ Set your email first. Open Settings → Email Settings → Set Email to add one, then come back and tap Send chat PDF to email.',
  'support.transcript.sending_popup':
    '⏳ Generating your support transcript and sending it to {email}…',
  'support.transcript.failed_popup':
    '❌ Could not send the transcript to {email}. Please try again — if it keeps failing, contact support.',
  'support.transcript.expired_popup':
    '⌛ This transcript is no longer available. Start a new Live Support session whenever you need help.',
  // Kiwi AI — premium-formatted greeting. The kiwi avatar (`kiwi_ai`)
  // prefixes the headline so premium viewers see the animated kiwi
  // glyph and everyone else gets the unicode kiwi fallback. The
  // greeting is multi-turn: tap any number of questions, then
  // Cancel to close and (optionally) email the transcript.
  'support.ai.session_open':
    '{kiwi_ai} *Kiwi Ai*\n' +
    '*I am Kiwi automated support assistant.*\n\n' +
    'You can ask normal questions in any language or get help with ' +
    'products, pricing, stock, deposits, coupons, orders, and ' +
    'delivery. Internal system details are off-limits.',
  // Closure message shown when the user taps Cancel. Mirrors
  // `support.live.user_ended` so the two flows feel identical.
  'support.ai.user_ended':
    '{support_live_closed} Kiwi Ai chat closed.\n\n' +
    'Open Kiwi Ai again from the menu whenever you need help.',
  'support.ai.fallback':
    'I couldn\'t answer that automatically. A human will reach out shortly.',
  // Tiny prompt sent right after the AI chat is wiped on Cancel,
  // attached to the “📧 Send chat PDF to email” button so the user
  // can still save the conversation if they want to.
  'support.ai.pdf_prompt':
    '{kiwi_ai} *Kiwi Ai chat saved.*\n' +
    'Tap below to email the transcript as a PDF.',
  'support.ai.empty_popup':
    '💬 Send at least one question first — there\'s nothing to save yet.',
  // Legacy keys kept for any code path still referencing them.
  'support.ai.title': '{kiwi_ai} *Kiwi Ai*',
  'support.ai.prompt': 'Describe your issue and I\'ll do my best to help.',

  // ---------- Channel ----------
  'channel.not_set': '📢 The channel link hasn\'t been set yet. Ask the admin to configure it.',
  'channel.subscribe.title': '📢 *Channel*',
  'channel.subscribe.body': 'Channel joining is optional. You can continue using the bot.',
  'channel.subscribe.joined': '✅ Continue',

  // ---------- Admin ----------
  'admin.only': '⛔ Admin only.',
  'admin.help.title': '🛠 *Admin Commands*',
  'admin.cache.cleared': '🧹 Cache cleared.',

  'admin.text.set': '✅ Text `{key}` updated.',
  'admin.color.set': '✅ Color for `{key}` set to *{color}*.',
  'admin.emoji.set': '✅ Emoji `{key}` updated.',
  'admin.product.added': '✅ Product *{name}* added (id={id}).',
  'admin.category.added': '✅ Category *{name}* added (id={id}).',
  'admin.payment.added': '✅ Payment method *{name}* added (id={id}).',
  'admin.bad_args': '❌ Bad arguments. Usage: `{usage}`',

  // ---------- Errors ----------
  'err.generic': '⚠️ Something went wrong. Please try again.',
  'err.unknown_action': '⚠️ Unknown action.',
  // ---------- 🧾 Shared checkout (Cart + Buy Now) ----------
  'checkout.btn.wallet': '👛 Pay with Wallet',
  'checkout.btn.methods': '💳 Payment Methods',
  'checkout.btn.coupon': '🎟️ Coupon',
  'checkout.btn.coupon_remove': '🎟️ Remove Coupon',
  'checkout.btn.back': '⬅️ Back',
  'checkout.btn.cancel': '❌ Cancel',
  'checkout.btn.confirm': '✅ Confirm & Pay',
  'checkout.title':
    '🧾 *Order Summary*\n\n{lines}\n\n──────────────\n🔢 *Items:* {items}\n💵 *Subtotal:* {subtotal}{discount_lines}\n💳 *Payable:* {payable}\n👛 *Wallet Balance:* {balance}{warning}{coupon_warning}',
  'checkout.line':
    '📦 *{index}. {name}*\n🔢 Quantity: {qty}\n💵 Unit Price: {unit_price}\n💰 Subtotal: {subtotal}{note}',
  'checkout.discount.promo': '🎁 *Promotion:* -{amount}',
  'checkout.discount.coupon': '🎟️ *Coupon {code}:* -{amount}',
  'checkout.empty': '🧾 *Order Summary*\n\nThere is nothing to check out yet.',
  'checkout.warning': '\n⚠️ Some items changed and were adjusted or skipped.',
  'checkout.expired': '⚠️ This checkout expired. Please open your cart or the product again.',
  'checkout.nothing': 'Nothing in this order can be purchased right now.',
  'checkout.in_progress': 'Your checkout is already being processed.',
  'checkout.duplicate': '✅ This order was already placed — we did not charge you twice.',
  'checkout.insufficient': 'Your wallet balance is not enough for this order.',
  'checkout.cancelled': '❌ Checkout cancelled',
  'checkout.cancelled.card': '❌ *Checkout cancelled*\n\nNothing was charged.',
  'checkout.back.hint': '⬅️ Where would you like to go back to?',
  'checkout.methods.hint': '💳 *Payment Methods*\n\nChoose how you want to pay for this order.',
  'checkout.confirm':
    '💳 *Confirm Payment*\n\n🔢 Items: {items}\n💳 Payable: {payable}\n👛 Wallet Balance: {balance}\n\nConfirm to pay with your wallet.',
  'checkout.coupon.prompt': '🎟️ *Coupon*\n\nSend your coupon code in a message.',
  'checkout.coupon.applied': '🎟️ Coupon *{code}* applied — you saved {amount}.',
  'checkout.coupon.removed': '🎟️ Coupon removed',
  'checkout.coupon.rejected': '⚠️ Coupon *{code}* was not applied: {reason}',
  'checkout.coupon.reason.unknown': 'this code does not exist',
  'checkout.coupon.reason.inactive': 'this code is no longer active',
  'checkout.coupon.reason.not_started': 'this code is not active yet',
  'checkout.coupon.reason.expired': 'this code has expired',
  'checkout.coupon.reason.min_subtotal': 'your order is below the minimum for this code',
  'checkout.coupon.reason.usage_limit': 'this code has reached its usage limit',
  'checkout.coupon.reason.per_user_limit': 'you already used this code',
  'checkout.coupon.reason.not_applicable': 'this code does not apply to these items',
  'checkout.coupon.reason.no_effect': 'this code gives no discount on this order',

  // ---------- Marketplace experience (search / sort / wishlist) ----------
  'btn.shop_search': '🔍 Search',
  'btn.shop_search_clear': '🧹 Clear Search',
  'btn.shop_sort': '↕️ Sort',
  'btn.sort_recommended': '✨ Recommended',
  'btn.sort_price_asc': '💰 Price: Low to High',
  'btn.sort_price_desc': '💎 Price: High to Low',
  'btn.sort_name_asc': '🔤 Name: A to Z',
  'btn.sort_newest': '🆕 Newest First',
  'btn.sort_stock_desc': '📦 Most in Stock',
  'btn.favorites': '⭐ Favorites',
  'btn.favorite_add': '⭐ Favorite',
  'btn.favorite_remove': '💔 Unfavorite',
  'btn.notify_restock': '🔔 Notify Me',

  // ---------- Badges ----------
  'badge.flash_sale': '🔥 Flash Sale',
  'badge.featured': '⭐ Featured',
  'badge.new': '🆕 New',
  'badge.premium': '💎 Premium',
  'badge.best_seller': '🏆 Best Seller',
  'badge.discount': '🏷️ {percent}% Off',

  // ---------- Product screen ----------
  'shop.product.heading': '🛍️ *{name}*',
  'shop.product.badges': '{badges}',
  'shop.product.price': '💰 *Price:* {price}',
  'shop.product.price.discounted': '💰 *Price:* {price} (~{was}~ · 🏷️ {percent}% off)',
  'shop.product.stock': '📦 *Stock:* {stock}',
  'shop.product.stock.out': '📦 *Stock:* Out of stock',
  'shop.product.features.title': '✨ *Features*',
  'shop.product.feature': '• {feature}',
  'shop.product.instant_delivery': '⚡ *Instant Delivery*',
  'shop.product.manual_delivery': '🕒 *Manual Delivery* — our team completes this order for you.',
  'shop.product.favorited': '⭐ *Saved to your favorites*',

  // ---------- Search ----------
  'shop.search.prompt':
    '🔍 *Search the Marketplace*\n──────────────\nSend a product name or any part of it.\n_Example: "net" finds "Netflix Premium"._',
  'shop.search.header': '🔍 *Search:* “{query}”\n_{total} results • Page {page}/{pages}_',
  'shop.search.empty':
    '📭 *No matches for “{query}”*\n\n_Try a shorter word, or clear the search to browse everything._',
  'shop.search.cleared': '🧹 Search cleared',

  // ---------- Sort ----------
  'shop.sort.title': '↕️ *Sort Products*\n_Currently: {current}_',
  'shop.sort.applied': '↕️ Sorted by {label}',

  // ---------- Favorites ----------
  'shop.favorites.header': '⭐ *Your Favorites*\n_{total} saved • Page {page}/{pages}_',
  'shop.favorites.empty':
    '📭 *No favorites yet*\n\n_Open any product and tap ⭐ Favorite to save it here._',
  'shop.favorites.added': '⭐ Added to favorites',
  'shop.favorites.removed': '💔 Removed from favorites',

  // ---------- Standard screen states ----------
  'state.loading': '⏳ _Loading…_',
  'state.error':
    '❌ *Something went wrong*\n\n_Please tap 🔄 Refresh and try again._',
  'shop.out_of_stock.notice':
    '❌ *Out of stock*\n\n_This item is unavailable right now. Tap ⭐ Favorite to keep an eye on it._',
};
