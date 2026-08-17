/* Tiếng Việt — keep keys in sync with en.ts */
export const vi: Record<string, string> = {
  'welcome': 'Chào mừng đến với Digitalora',
  'welcome.title': 'Chào mừng đến với Digitalora!',
  'welcome.balance': 'Số dư của bạn: *${balance}*',
  'welcome.tap_menu': 'Nhấn *Menu Chính* bên dưới để bắt đầu.',
  'menu.title': '🐯 *Digitalora* — Menu Chính',

  'btn.main_menu': '⬅️ Về Menu',
  'btn.shop': '🛍️ Cửa hàng số',
  'btn.topup': '💳 Ví',
  'btn.profile': '👤 Hồ sơ',
  'btn.support': '💬 Trung tâm hỗ trợ',
  'btn.ai_support': '🤖 Hỗ trợ AI',
  'btn.back': '⬅️ Quay lại',
  'btn.next': 'Tiếp ▶️',
  'btn.prev': '◀️ Trước',
  'btn.refresh': '🔄 Làm mới',
  'btn.buy_now': '🛒 Mua ngay',
  'btn.pre_order': '🛍 Pre Order',
  'btn.redeem_referral': '🎁 Thanh toán bằng giới thiệu',
  'btn.referral_earn_buy': '🔗 Kiếm lượt giới thiệu & Mua',
  'btn.convert_refers': '💱 Đổi Refers sang USDT',
  'btn.topup_wallet': '👛 Nạp ví',
  'btn.view_note': '📝 Xem ghi chú',
  'btn.qty_plus': '➕',
  'btn.qty_minus': '➖',
  'btn.custom_qty': '🔢 Số lượng tùy chỉnh',
  'btn.qty_keypad_back': '⌫',
  'btn.qty_keypad_clear': '🗑 Xóa',
  'btn.qty_keypad_confirm': '✅ Xác nhận',
  // Nút "Tối đa" gán số lượng vào mức tối đa có thể mua
  // (`min(QTY_MAX, tồn kho)`) chỉ với một lần nhấn — tiện cho người mua
  // sỉ muốn lấy hết lô mà không cần nhập từng chữ số.
  'btn.qty_keypad_max': '🎯 Tối đa',
  'btn.pay_wallet': '👛 Ví',
  'btn.pay_referral': '🎁 Referral Pay',
  'btn.pay_direct': '💸 Trực tiếp',
  'btn.pay_topup': '🪙 Nạp',
  'btn.confirm_pay': '✅ Xác nhận',
  'btn.cancel_pay': '❌ Hủy',
  // Hàng "Khác" và "Quay lại" trên bàn phím phương thức thanh toán.
  // Người dùng Premium thấy biểu tượng động được khai báo ở
  // EMOJI.paymethod_others / paymethod_back; người khác xem ký tự
  // unicode bên dưới làm dự phòng.
  'btn.paymethod_others': '💡 Khác',
  'btn.paymethod_back': '◀️ Quay lại',
  'btn.qty.max': '🎯 Tối đa',
  'btn.qty.reset': '🔄 Đặt lại',
  'btn.qty.confirm': '✅ Xác nhận',
  'btn.contact_admin': '💬 Liên hệ Admin',
  'btn.qty.dec_1': '➖ 1',
  'btn.qty.dec_10': '⏪ 10',
  'btn.qty.dec_100': '⏮ 100',
  'btn.qty.inc_1': '➕ 1',
  'btn.qty.inc_10': '⏩ 10',
  'btn.qty.inc_100': '⏭ 100',
  'btn.qty.display': '📦 {qty} / {stock}',
  'btn.share_product': '🔗 Sao chép liên kết',
  'btn.view_note_file': '📥 Lưu ghi chú dạng TXT',
  'btn.view_order': '📦 Xem đơn hàng',
  'btn.send_note_txt': '📥 Tải TXT',
  'btn.out_of_stock': '❌ Hết hàng',
  'btn.my_orders': '📦 Đơn hàng của tôi',
  'btn.refer': '🎁 Giới thiệu & Kiếm thưởng',
  'btn.notifications': '🔔 Thông báo',
  'btn.toggle_stock': '📢 Thông báo tồn kho',
  'btn.toggle_announcements': '💬 Thông báo tin tức',
  'btn.toggle_wallet': '💰 Thông báo ví',
  // Mỗi nút trên hàng riêng nay có đủ chỗ cho tên đầy đủ và trạng thái.
  'btn.notify.stock.on': '🟢 Thông báo Tồn kho: BẬT',
  'btn.notify.stock.off': '🔕 Thông báo Tồn kho: TẮT',
  'btn.notify.ann.on': '🟢 Thông báo Tin tức: BẬT',
  'btn.notify.ann.off': '🔕 Thông báo Tin tức: TẮT',
  'btn.notify.wallet.on': '🟢 Thông báo Ví: BẬT',
  'btn.notify.wallet.off': '🔕 Thông báo Ví: TẮT',
  'btn.back_to_settings': '⬅️ Quay lại Cài đặt',
  'btn.language': '🌐 Ngôn ngữ',
  'btn.language.english': '🇬🇧 English',
  'btn.language.arabic': '🇸🇦 العربية',
  'btn.language.vietnamese': '🇻🇳 Tiếng Việt',
  'btn.region.clear': '🚫 Xóa',
  'btn.deposit_history': '💳 Lịch sử nạp',
  'btn.channel': '📣 Kênh chính thức',
  'btn.reseller_api': '🔑 Api Key',
  'api.price_alert.up':
    '{notify_bell} Thân gửi người dùng API, giá *{product}* hiện đã *tăng* lên {price}. Vui lòng cập nhật giá của bạn cho sản phẩm này.',
  'api.price_alert.down':
    '{notify_bell} Thân gửi người dùng API, giá *{product}* hiện đã *giảm* xuống {price}. Vui lòng cập nhật giá của bạn cho sản phẩm này.',
  'btn.stats': '📊 Thống kê',
  'btn.stats_refresh': '🔄 Làm mới',
  'btn.stats_back': '◀️ Quay lại',
  // Hướng dẫn theo từng phương thức — hiển thị dưới mỗi màn hình
  // chuỗi / Binance / LTC. Quản trị viên chỉnh nội dung từ trang /admin.
  'btn.where_txid': '📘 Tìm TXID ở đâu?',
  'btn.where_order_id': '📘 Tìm Mã đơn ở đâu?',
  // Hướng dẫn bot + cách dùng (trang Cài đặt).
  'btn.using_method': '📘 Cách dùng',
  'btn.tutorial_open_link': '🔗 Mở liên kết',
  'btn.bot_tutorial': '📘 Hướng dẫn Bot',

  'shop.home.header.professional': '🛍️ *Chợ Digitalora*\n_{total} sản phẩm • Trang {page}/{pages}_',
  'shop.product.button': '{name} • {price} • còn {stock}',
  'shop.product.button.unlimited': '{name} • {price} • ∞',
  'shop.product.button.oos': '❌ {name} • {price} • Hết hàng',
  'shop.home.header': '*Sản phẩm có sẵn:*',
  'shop.choose_category': '*Sản phẩm có sẵn:*',
  'shop.qty.prompt': '🔢 Nhập số lượng (1–{max}) và gửi.',
  'shop.qty.invalid': '❌ Số không hợp lệ — vui lòng gửi giá trị từ 1 đến {max}.',
  // Token `{current}` là bộ đệm số người dùng đã nhập đến
  // giờ. Trước khi nhận phím đầu tiên, nó hiển thị dưới dạng
  // văn bản hướng dẫn `(Số lượng)` thay cho dấu gạch ngắn
  // trần trụi «mâu» đã dùng trước đây.
  'shop.qty.keypad.instruction':
    '{qty_prompt_keypad} *Cách dùng:* nhấn các chữ số bên dưới hoặc gửi số, ' +
    'sau đó nhấn ✅ Xác nhận.\n' +
    'Hiện tại: <code>{current}</code>',
  // Placeholder hiển thị trong `Hiện tại: <code>…</code>` khi bộ
  // đệm còn rỗng — đọc tự nhiên hơn ("Hiện tại: (Số lượng)") so
  // với dấu gạch ngắn trần trụi trước đây.
  'shop.qty.keypad.placeholder': '(Số lượng)',
  'shop.qty.keypad.invalid':
    '{qty_invalid} *Số lượng không hợp lệ.*\n\n' +
    'Vui lòng gửi số nguyên từ *1* đến *{max}*.',
  'shop.pay.title':
    '{pay_summary} *Tóm tắt đơn hàng*\n\n' +
    '{emoji} *{name}*\n' +
    '{prod_qty_selected} Số lượng: *{qty}*\n' +
    '{promo_line}' +
    '{prod_total_amount} Tổng: *{total}*\n' +
    '{prod_wallet} Ví: *{balance}*\n' +
    '{referral_line}' +
    'Chọn cách thanh toán:',
  'shop.pay.referral_line':
    '{prod_referral} Referral Pay:\n*{available} có sẵn* • *{required} cần*\n\n',
  // Thẻ xác nhận thanh toán bằng ví (trang 2).
  'shop.pay.confirm':
    '{prod_wallet} *Xác nhận Thanh toán*\n\n' +
    '{pay_summary} *Đơn hàng*\n' +
    '{emoji} *{name}* × *{qty}*\n' +
    '{discount_line}' +
    '{prod_total_amount} *Tổng:* {total}\n' +
    '{prod_wallet} *Ví:* {balance}\n\n' +
    '_Trừ *{total}* từ ví của bạn?_',
  'shop.pay.confirm.discount_line':
    '{prod_promo} *Giảm giá:* −{discount}\n',
  'shop.qty.editor.title':
    '🔢 *Chọn số lượng*\n\n' +
    '*{name}*\n' +
    'Tồn kho: *{stock}*\n' +
    'Đơn giá: *{price}*\n\n' +
    'Đã chọn: <code>{qty}</code>\n' +
    'Tổng: *{total}*',
  'shop.empty_categories': 'Chưa có danh mục. Vui lòng quay lại sau.',
  'shop.empty_products': 'Chưa có sản phẩm trong danh mục này.',
  'shop.product.line.name': '{emoji} *{name}*',
  'shop.product.line.price': '{prod_price_base} *Giá gốc:* {price}',
  'shop.product.line.stock': '{prod_stock} *Còn lại:* {stock}',
  'shop.product.line.warranty': '{prod_warranty} *Bảo hành:* {warranty}',
  'shop.product.line.referral.progress':
    '{prod_referral} *Thanh toán giới thiệu:* Cần {required} • Có {total} • Thiếu {remaining}',
  'shop.product.line.referral.ready':
    '{prod_referral} *Thanh toán giới thiệu:* Cần {required} • Có {total} • Sẵn sàng',
  'shop.product.line.referral.claimed':
    '{prod_referral} *Thanh toán giới thiệu:* Số dư đã dùng ở đơn cũ',
  'shop.product.line.qty': '{prod_qty_selected} *Số lượng đã chọn:* {qty}',
  'shop.product.line.total': '{prod_total_amount} *Tổng tiền:* {total}',
  'shop.product.line.balance': '{prod_wallet} *Ví:* {balance}',
  'shop.product.line.promo':
    '{prod_promo} *Khuyến mãi:* {label} — −{discount}',
  'shop.product.line.promo.fallback_label': 'số lượng ≥ {min_qty}',
  'shop.product.line.promo.teaser':
    '{prod_promo} *Khuyến mãi:* Mua {min_qty}+ giảm −${discount}',
  'shop.product.line.promo.tier':
    '{prod_promo} *Khuyến mãi:* {min_qty}+ → ${unit_price}/mỗi sản phẩm',
  'shop.product.line.promo.tier_teaser':
    '{prod_promo} *Khuyến mãi:* Mua {min_qty}+ → ${unit_price}/mỗi sản phẩm',
  'shop.product.line.total.discounted':
    '{prod_total_amount} *Tổng tiền:* ~~{gross}~~ {total}',
  'shop.product.out_of_stock_popup':
    '❌ Sản phẩm này hiện đã hết hàng. Vui lòng liên hệ quản trị viên để bổ sung kho hoặc chọn sản phẩm tương tự.',
  'shop.note.title': '📝 *Ghi chú sản phẩm*',
  'shop.note.empty': 'Sản phẩm này không có ghi chú.',
  'shop.note.full': [
    '*📝 Ghi chú sản phẩm — {name}*',
    '',
    '*Giá:* `{price}`',
    '*Kho:* `{stock}`',
    '*Bảo hành:* `{warranty}`',
    '',
    '*Mô tả:*',
    '{description}',
    '',
    '*Ghi chú:*',
    '{note}',
  ].join('\n'),
  'shop.buy.success':
    '✅ Mua thành công!\n\nSản phẩm: *{name}*\nSố lượng: *{qty}*\nTổng: *{total}*\n\nGiao hàng:\n```\n{delivery}\n```',
  'shop.buy.insufficient':
    '❌ Số dư ví không đủ. Cần *{need}* nhưng chỉ có *{have}*. Vui lòng nạp tiền trước.',
  'shop.buy.no_stock': '❌ Xin lỗi, sản phẩm đã hết hàng.',
  'shop.referral.disabled': '❌ Referral Pay chưa được bật cho sản phẩm này.',
  'shop.referral.already_redeemed': '✅ Referral Pay đã được dùng cho một đơn cũ.',
  'shop.referral.insufficient':
    '❌ Cần {required} lượt giới thiệu để đổi. Bạn có {total} (còn {remaining}).',
  'shop.referral.insufficient.card': [
    '⚠️ *Số dư Referral Pay thấp*',
    '',
    '{prod_referral} *Cần:* {required} lượt',
    '{refer_user} *Hiện có:* {available} lượt',
    '{qty_invalid} *Còn thiếu:* {remaining} lượt',
    '',
    '{refer_title} Mời thêm người bằng link giới thiệu, bấm làm mới, rồi thanh toán bằng Referral Pay.',
  ].join('\n'),
  'shop.referral.confirm': [
    '{refer_title} *Xác nhận Referral Pay*',
    '',
    '{emoji} *{name}* × *{qty}*',
    '{prod_referral} *Cần:* {required} lượt',
    '{refer_user} *Hiện có:* {available} lượt',
    '{delivery_check} *Sau khi trả:* {after} lượt',
    '',
    '_Dùng lượt giới thiệu đang có cho đơn này?_',
  ].join('\n'),
  'shop.referral.failed':
    '❌ Không thể thanh toán bằng Referral Pay lúc này. Vui lòng thử lại hoặc liên hệ admin.',
  'shop.referral.confirmed': [
    '{refer_title} *Thanh toán Referral Pay thành công!*',
    '',
    '*Sản phẩm:* {name}',
    '*Số lượng:* {qty}',
    '*Đã dùng:* {spent} lượt',
    '',
    '{delivering} _Đang giao đơn hàng…_',
  ].join('\n'),
  'shop.referral.delivery': 'Referral Pay cho sản phẩm #{product_id} (SL: {qty})',
  'shop.page.header': '🛒 *{category}*\n\n*Sản phẩm có sẵn:*\n_{total} sản phẩm — trang {page}/{pages}_',

  'profile.title': '⚙️ *Cài đặt*',
  'profile.notifications.title': '{notify_bell} *Thông báo*',
  'profile.notifications.body':
    '{notify_on} _Chỉ bật những thông báo bạn thích_ {notify_bell}\n\n' +
    '{notify_stock} *Thông báo tồn kho*\n' +
    '{notify_info} *Thông báo tin tức*\n' +
    '{notify_wallet} *Thông báo ví*\n\n' +
    '{notify_on} BẬT\n' +
    '{notify_off} TẮT',
  'profile.user_id': 'ID người dùng: `{id}`',
  'profile.username': 'Tên người dùng: @{username}',
  'profile.balance': '👛 Số dư: *{balance}*',
  'profile.language': '🌐 Ngôn ngữ: *{language}*',
  'profile.joined': '📅 Tham gia: *{joined}*',
  // Màn hình Giới thiệu & Kiếm.
  'profile.refer.title': '{refer_title} *Giới thiệu & Kiếm*',
  'profile.refer.body':
    '{refer_prize_l} *Giới thiệu 5 người và nhận $0.10* {refer_prize_r}\n\n' +
    '{refer_clicks} *Clicks:* {clicks}\n' +
    '{refer_pending} *Pending:* {pending}\n' +
    '{refer_active} *Active:* {active}\n' +
    '{refer_left} *Left:* {left}\n' +
    '{refer_total} *Giới thiệu (Tổng):* {refTotal}\n' +
    '{refer_coin} *Tổng đã kiếm:* {earnedTotal} USDT\n' +
    '{refer_withdrawn} *Đã rút:* {withdrawn} USDT\n\n' +
    '{refer_paybalance} *Số dư Referral Pay:* {refAvailable} lượt\n' +
    '{refer_spent} *Đã chuyển thành USDT:* {converted} lượt\n\n' +
    '_Chuyển tiền vào ví khi đạt $0.50. Để rút tiền mặt, liên hệ hỗ trợ._\n\n' +
    '*Liên kết giới thiệu của bạn:*\n`{link}`',
  'profile.refer.convert_success':
    '💱 Đã đổi *{refs} refs* thành *{amount} USDT*.\n\n💳 Số dư ví: *{balance}*',
  'profile.refer.convert_low':
    '⚠️ Chưa đủ lượt giới thiệu để đổi.\n\nChuyển vào ví cần giá trị giới thiệu là *${min}*.\nSố dư hiện tại: *{available} lượt* (≈ ${earned}).',
  'profile.refer.convert_error':
    '⚠️ Không thể đổi refs lúc này. Vui lòng thử lại.',
  'btn.live_refers': '🔵 See Your Live Refers',
  'btn.refer_convert': '💱 Đổi sang ví',
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
  'btn.copy_link': '📋 Sao chép',
  'btn.redeem': '🎁 Mã quà tặng',
  'profile.language.title': '{lang_left} *Chọn ngôn ngữ* {lang_right}',
  'profile.email.hub.title': '{email_bracket_l} *Cài đặt Email* {profile_email}',
  'profile.email.hub.body':
    '{email_invoice} Chúng tôi chỉ dùng email cho biên lai mua hàng và khôi phục tài khoản — không quảng cáo.\n\n' +
    '{profile_email} *Email hiện tại:* `{current}`',
  'profile.email.set.already_set_popup':
    'Email đã được thiết lập ({current}). Vui lòng dùng Đổi Email hoặc Xóa Email để cập nhật.',
  'profile.email.delete.no_email_popup': 'Chưa có email — không có gì để xóa.',
  'profile.email.delete.title': '{email_bracket_l} *Xóa Email* {email_bracket_l}',
  'profile.email.delete.body':
    '{email_invalid} _Vui lòng xác nhận xóa email_\n\n' +
    '{profile_email} *Email hiện tại:* `{current}`',
  'profile.email.delete.success': '✅ Đã xóa email.',
  'profile.email.in_use':
    '{email_in_use} Email đã được *sử dụng*\n\n' +
    '{email_arrow} *_Vui lòng nhập một email khác_*',
  'btn.email.delete': '🗑 Xóa Email',
  'btn.email.delete.confirm': '🗑 Xác nhận xóa',
  'btn.email.delete.cancel': '⬅️ Hủy',
  // Nút "Gửi PDF" cho màn hình Đơn hàng / Nạp tiền / Thống kê.
  'btn.send_pdf.orders': 'Gửi PDF đơn hàng đến email',
  'btn.send_pdf.deposits': '📤 Gửi PDF nạp tiền đến email',
  'btn.send_pdf.stats': '📤 Gửi PDF thống kê đến email',
  'pdf.no_email_popup':
    '⚠️ Vui lòng đặt email trước. Cài đặt → Cài đặt email → Đặt email, sau đó quay lại và nhấn Gửi PDF.',
  'pdf.sending_popup': '⏳ Đang tạo PDF và gửi đến {email}…',
  'pdf.sent_popup': '✅ Đã gửi PDF đến {email}. Vui lòng kiểm tra hộp thư (và mục Spam).',
  // Tin nhắn xác nhận khi gửi PDF thành công.
  'pdf.sent_message': '{pdf_sent_l} *PDF đã được gửi tới email* {pdf_sent_r}',
  'pdf.failed_popup':
    '❌ Không gửi được PDF đến {email}. Vui lòng thử lại sau ít phút — nếu lỗi tiếp tục, hãy liên hệ hỗ trợ.',
  'orders.empty':
    '{orders_title} *Đơn hàng của tôi*\n\n' +
    '🪄 Chưa có đơn hàng nào.\n\n' +
    '✨ 🛍️ 🚀 Bắt đầu mua sắm và đơn hàng sẽ xuất hiện ở đây!',
  'profile.orders.empty': 'Bạn chưa có đơn hàng nào.',
  'profile.orders.title': '🧾 *Đơn hàng của tôi*',
  'profile.orders.line': '#{id} • {name} ×{qty} • {total} • {date}',
  'profile.notify.stock_on': 'Thông báo tồn kho: ✅ BẬT',
  'profile.notify.stock_off': 'Thông báo tồn kho: ⛔ TẮT',
  'profile.notify.ann_on': 'Thông báo tin tức: ✅ BẬT',
  'profile.notify.ann_off': 'Thông báo tin tức: ⛔ TẮT',
  'profile.notify.wallet_on': 'Thông báo ví: ✅ BẬT',
  'profile.notify.wallet_off': 'Thông báo ví: ⛔ TẮT',
  'profile.notify.error':
    '⚠️ Không thể lưu trạng thái — cần áp dụng `0008_wallet_alert.sql` vào cơ sở dữ liệu.',
  'profile.deposits.title': '💳 *Lịch sử nạp*',
  'profile.deposits.empty': 'Chưa có giao dịch nạp.',
  'profile.deposits.line': '#{id} • {amount} • {method} • {status} • {date}',

  'profile.stats.title': 'Thống kê của bạn',
  'profile.stats.orders': 'Đơn hàng: {count}',
  'profile.stats.items': 'Mặt hàng đã mua: {count}',
  'profile.stats.spent': 'Tổng đã chi: {amount} USDT',
  'profile.stats.last': 'Đơn cuối: {rel} ({abs})',
  'profile.stats.last_none': 'Đơn cuối: —',
  'profile.stats.deposits': 'Nạp tiền: {amount} USDT',
  'profile.stats.rel.now': 'vừa xong',
  'profile.stats.rel.minutes': '{n} phút trước',
  'profile.stats.rel.hours': '{n} giờ trước',
  'profile.stats.rel.days': '{n} ngày trước',

  // Hướng dẫn theo phương thức — quản trị chỉnh từ /admin và xuất
  // hiện dưới các màn hình USDT / Binance / LTC. Tiêu đề mang biểu
  // tượng sách + tên phương thức, nội dung lấy từ
  // `pay_tutorial.<method_id>.text`.
  'pay.tutorial.title': '{tutorial} *Tìm tham chiếu ở đâu — {method}*',
  'pay.tutorial.empty':
    '_Quản trị viên chưa thêm hướng dẫn cho phương thức này. Vui lòng quay lại sau._',
  'pay.tutorial.body': '{body}',

  'topup.title': '👛 *Nạp ví*',
  'topup.wallet_summary': '💰 *Số dư hiện tại:* {balance}',
  'topup.security_note': '🔐 _Thanh toán sẽ được xác minh trước khi cộng tiền. Không chia sẻ TXID hoặc Order ID với bất kỳ ai tự nhận là hỗ trợ._',
  'topup.choose_method': '👛 *Nạp ví*',
  'topup.empty_methods': 'Chưa cấu hình phương thức thanh toán. Vui lòng liên hệ hỗ trợ.',
  'topup.method.body': '*{name}*\n\n{instructions}',
  'topup.requested':
    '✅ Yêu cầu nạp đã gửi (#{id}).\nQuản trị viên sẽ xác nhận và cộng tiền sớm.',
  'topup.cryptobot.amount_prompt':
    '*Nạp USDT qua CryptoBot*\n\nBạn muốn nạp bao nhiêu USDT?\nGửi số tiền (tối thiểu: *{min}*).',
  'topup.cryptobot.invalid_amount':
    '❌ Vui lòng gửi số USDT hợp lệ (tối thiểu: *{min}*).',
  'topup.cryptobot.start_failed':
    '⚠️ Không thể bắt đầu nạp CryptoBot. Vui lòng thử lại hoặc dùng phương thức khác.',
  'topup.cryptobot.invoice_failed':
    '⚠️ Không thể tạo hóa đơn CryptoBot lúc này. Vui lòng thử lại sau.',
  'topup.cryptobot.invoice_ready':
    '*Hóa đơn CryptoBot đã sẵn sàng*\n\nSố tiền: *{amount}*\n\nNhấn *Mở hóa đơn*, hoàn tất thanh toán trong CryptoBot, rồi nhấn *Kiểm tra*.',
  'directpay.cryptobot.invoice_ready':
    '*Hóa đơn thanh toán trực tiếp CryptoBot đã sẵn sàng*\n\nSố tiền: *{amount} USDT*\n\nNhấn *Mở hóa đơn*, hoàn tất thanh toán trong CryptoBot, rồi nhấn *Kiểm tra* để giao đơn hàng.',
  'topup.cryptobot.open_invoice': '💳 Mở hóa đơn',
  'topup.cryptobot.check': '✅ Đã thanh toán / Kiểm tra',
  'topup.cryptobot.check_unavailable': 'Khoản thanh toán này đã được xử lý hoặc không khả dụng.',
  'topup.cryptobot.check_failed': 'Chưa thể kiểm tra thanh toán. Vui lòng thử lại sau.',
  'topup.cryptobot.not_paid': 'Chưa nhận được thanh toán. Hãy nhấn Kiểm tra lại sau khi thanh toán.',
  'topup.cryptobot.check_success': 'Đã xác nhận thanh toán và cộng tiền vào ví.',
  'topup.cryptobot.already_processed': 'Thanh toán đã được xử lý.',
  'topup.cryptobot.finalize_failed': 'Chưa thể hoàn tất thanh toán. Vui lòng thử lại.',
  'topup.cryptobot.success':
    '✅ *Thanh toán CryptoBot đã được xác nhận!*\n\nMã nạp: *{depositId}*\nĐã cộng: *{amount}*\nSố dư mới: *{balance}*',

  'support.title': '{support_title} Hỗ trợ',
  'support.body':
    '_*Nếu bạn không thể gửi tin nhắn hoặc gặp sự cố, hãy sử dụng Hỗ trợ trực tiếp để kết nối ngay với quản trị viên.*_',
  'support.btn.contact': '📩 Liên hệ quản trị',
  'support.contact_prefill': 'Chào, tôi cần trợ giúp về ShopBot Digitalora. Vui lòng giúp tôi về: ',
  'support.btn.cancel': 'Hủy hỗ trợ',
  'support.btn.live': '🟢 Hỗ trợ trực tiếp',
  'support.btn.end_session': '🔴 Kết thúc phiên',
  'support.live.busy_popup':
    '⏳ Quản trị viên đang hỗ trợ người khác. Vui lòng thử lại sau ít phút.',
  'support.live.user_active':
    '{support_live_active} Hỗ trợ trực tiếp\n\n' +
    'Phiên hỗ trợ đang hoạt động.\n\n' +
    'Hãy nhắn tin trực tiếp tại đây — mọi tin nhắn sẽ được chuyển ngay đến quản trị viên. Bấm *Hủy hỗ trợ* bất cứ lúc nào để kết thúc phiên.',
  'support.live.session_created': '🟢 *Đã tạo phiên Hỗ trợ trực tiếp*',
  'support.live.admin_started':
    '🟢 *Bắt đầu Hỗ trợ trực tiếp*\n\n' +
    'Người dùng: *{name}* (@{username})\nID: `{id}`\n\nTrả lời tại đây để chat. Gửi /end để đóng phiên.',
  'support.live.admin_relay': '*[{name}]:* {text}',
  'support.live.admin_media_header': '*[{name}]* đã gửi tệp:',
  'support.live.user_ended':
    '{support_live_closed} Đã đóng Hỗ trợ trực tiếp.\n\n' +
    'Mở lại Hỗ trợ từ menu bất kỳ lúc nào bạn cần giúp đỡ.',
  'support.live.admin_ended': '🔴 *Phiên Hỗ trợ trực tiếp đã đóng.*',
  'support.live.unavailable_popup':
    '⚠️ Hỗ trợ trực tiếp tạm thời không khả dụng — không thể liên lạc với quản trị viên ngay bây giờ. Vui lòng dùng Liên hệ Admin hoặc thử lại sau.',
  'support.live.unavailable_message':
    '⚠️ *Hỗ trợ trực tiếp không khả dụng*\n\n' +
    'Hiện không thể liên lạc với quản trị viên. Thường là do quản trị viên chưa từng mở bot này và bấm *Start* — Telegram chỉ cho phép bot nhắn cho người đã chủ động bắt đầu trò chuyện.\n\n' +
    'Vui lòng dùng *Liên hệ Admin* trong menu Hỗ trợ.',
  'support.btn.email_transcript': '📧 Gửi PDF chat tới email',
  'support.transcript.sent_message':
    '{pdf_sent_l} *PDF đã được gửi tới email* {pdf_sent_r}',
  'support.transcript.no_email_popup':
    '⚠️ Hãy đặt email trước. Cài đặt → Cài đặt email → Đặt email, sau đó quay lại và nhấn nút gửi PDF chat.',
  'support.transcript.sending_popup':
    '⏳ Đang tạo bản ghi hỗ trợ và gửi đến {email}…',
  'support.transcript.failed_popup':
    '❌ Không gửi được bản ghi đến {email}. Vui lòng thử lại — nếu lỗi tiếp tục, hãy liên hệ hỗ trợ.',
  'support.transcript.expired_popup':
    '⌛ Bản ghi này không còn khả dụng. Bắt đầu phiên Hỗ trợ trực tiếp mới khi bạn cần giúp đỡ.',
  'support.ai.session_open':
    '{kiwi_ai} *Kiwi Ai*\n' +
    '*Tôi là Kiwi, trợ lý hỗ trợ tự động.*\n\n' +
    'Bạn có thể hỏi bất kỳ câu hỏi nào bằng bất kỳ ngôn ngữ nào ' +
    'hoặc được hỗ trợ về sản phẩm, giá, kho hàng, nạp tiền, mã ' +
    'giảm giá, đơn hàng và giao hàng. Thông tin nội bộ hệ thống ' +
    'không được tiết lộ.',
  'support.ai.user_ended':
    '{support_live_closed} Đã đóng Kiwi Ai.\n\n' +
    'Mở lại Kiwi Ai từ menu bất kỳ lúc nào bạn cần giúp đỡ.',
  'support.ai.fallback':
    'Tôi không thể trả lời tự động. Một nhân viên sẽ liên hệ sớm.',
  'support.ai.pdf_prompt':
    '{kiwi_ai} *Đã lưu hội thoại Kiwi Ai.*\n' +
    'Nhấn bên dưới để gửi bản ghi về email của bạn dưới dạng PDF.',
  'support.ai.empty_popup':
    '💬 Hãy gửi ít nhất một câu hỏi trước — chưa có gì để lưu.',
  'support.ai.title': '{kiwi_ai} *Kiwi Ai*',
  'support.ai.prompt': 'Mô tả vấn đề và tôi sẽ cố gắng hỗ trợ.',
  'channel.not_set': '📢 Liên kết kênh chưa được cài đặt.',
  'channel.subscribe.title': '📢 *Tham gia kênh* để tiếp tục',
  'channel.subscribe.body': 'Vui lòng tham gia kênh bên dưới rồi nhấn *Tôi đã tham gia*.',
  'channel.subscribe.joined': '✅ Tôi đã tham gia',

  'admin.only': '⛔ Chỉ dành cho quản trị viên.',
  'admin.help.title': '🛠 *Lệnh quản trị*',
  'admin.cache.cleared': '🧹 Đã xóa cache.',

  'admin.text.set': '✅ Đã cập nhật text `{key}`.',
  'admin.color.set': '✅ Màu `{key}` đặt thành *{color}*.',
  'admin.emoji.set': '✅ Đã cập nhật emoji `{key}`.',
  'admin.product.added': '✅ Đã thêm sản phẩm *{name}* (id={id}).',
  'admin.category.added': '✅ Đã thêm danh mục *{name}* (id={id}).',
  'admin.payment.added': '✅ Đã thêm phương thức thanh toán *{name}* (id={id}).',
  'admin.bad_args': '❌ Tham số sai. Cách dùng: `{usage}`',

  'err.generic': '⚠️ Đã xảy ra lỗi. Vui lòng thử lại.',
  'err.unknown_action': '⚠️ Hành động không xác định.',
  'profile.pricelist.csv.promo_tier_format':
    'Mua {min_qty}+ → {unit_price} USDT mỗi sản phẩm',
  // ---------- 🧾 Thanh toán dùng chung ----------
  'checkout.btn.wallet': '👛 Thanh toán bằng Ví',
  'checkout.btn.methods': '💳 Phương thức thanh toán',
  'checkout.btn.coupon': '🎟️ Mã giảm giá',
  'checkout.btn.coupon_remove': '🎟️ Bỏ mã giảm giá',
  'checkout.btn.back': '⬅️ Quay lại',
  'checkout.btn.cancel': '❌ Hủy',
  'checkout.btn.confirm': '✅ Xác nhận & Thanh toán',
  'checkout.title':
    '🧾 *Tóm tắt đơn hàng*\n\n{lines}\n\n──────────────\n🔢 *Số lượng mục:* {items}\n💵 *Tạm tính:* {subtotal}{discount_lines}\n💳 *Cần thanh toán:* {payable}\n👛 *Số dư ví:* {balance}{warning}{coupon_warning}',
  'checkout.line':
    '📦 *{index}. {name}*\n🔢 Số lượng: {qty}\n💵 Đơn giá: {unit_price}\n💰 Thành tiền: {subtotal}{note}',
  'checkout.discount.promo': '🎁 *Khuyến mãi:* -{amount}',
  'checkout.discount.coupon': '🎟️ *Mã {code}:* -{amount}',
  'checkout.empty': '🧾 *Tóm tắt đơn hàng*\n\nChưa có gì để thanh toán.',
  'checkout.warning': '\n⚠️ Một số mục đã thay đổi nên được điều chỉnh hoặc bỏ qua.',
  'checkout.expired': '⚠️ Phiên thanh toán đã hết hạn. Hãy mở lại giỏ hàng hoặc sản phẩm.',
  'checkout.nothing': 'Hiện không thể mua mục nào trong đơn này.',
  'checkout.in_progress': 'Đơn thanh toán của bạn đang được xử lý.',
  'checkout.duplicate': '✅ Đơn này đã được đặt — bạn không bị trừ tiền hai lần.',
  'checkout.insufficient': 'Số dư ví không đủ cho đơn hàng này.',
  'checkout.cancelled': '❌ Đã hủy thanh toán',
  'checkout.cancelled.card': '❌ *Đã hủy thanh toán*\n\nKhông có khoản nào bị trừ.',
  'checkout.back.hint': '⬅️ Bạn muốn quay lại đâu?',
  'checkout.methods.hint': '💳 *Phương thức thanh toán*\n\nChọn cách bạn muốn thanh toán đơn này.',
  'checkout.confirm':
    '💳 *Xác nhận thanh toán*\n\n🔢 Số mục: {items}\n💳 Cần trả: {payable}\n👛 Số dư ví: {balance}\n\nXác nhận để trả bằng ví.',
  'checkout.coupon.prompt': '🎟️ *Mã giảm giá*\n\nGửi mã giảm giá của bạn trong một tin nhắn.',
  'checkout.coupon.applied': '🎟️ Đã áp dụng mã *{code}* — bạn tiết kiệm {amount}.',
  'checkout.coupon.removed': '🎟️ Đã bỏ mã giảm giá',
  'checkout.coupon.rejected': '⚠️ Mã *{code}* không được áp dụng: {reason}',
  'checkout.coupon.reason.unknown': 'mã này không tồn tại',
  'checkout.coupon.reason.inactive': 'mã này không còn hiệu lực',
  'checkout.coupon.reason.not_started': 'mã này chưa bắt đầu',
  'checkout.coupon.reason.expired': 'mã này đã hết hạn',
  'checkout.coupon.reason.min_subtotal': 'đơn hàng chưa đạt mức tối thiểu của mã',
  'checkout.coupon.reason.usage_limit': 'mã này đã hết lượt sử dụng',
  'checkout.coupon.reason.per_user_limit': 'bạn đã dùng mã này rồi',
  'checkout.coupon.reason.not_applicable': 'mã này không áp dụng cho các mục này',
  'checkout.coupon.reason.no_effect': 'mã này không giảm được gì cho đơn này',

  // ---------- Marketplace experience (search / sort / wishlist) ----------
  'btn.shop_search': '🔍 Tìm kiếm',
  'btn.shop_search_clear': '🧹 Xoá tìm kiếm',
  'btn.shop_sort': '↕️ Sắp xếp',
  'btn.sort_recommended': '✨ Đề xuất',
  'btn.sort_price_asc': '💰 Giá: Thấp đến cao',
  'btn.sort_price_desc': '💎 Giá: Cao đến thấp',
  'btn.sort_name_asc': '🔤 Tên: A đến Z',
  'btn.sort_newest': '🆕 Mới nhất',
  'btn.sort_stock_desc': '📦 Còn nhiều nhất',
  'btn.favorites': '⭐ Yêu thích',
  'btn.favorite_add': '⭐ Yêu thích',
  'btn.favorite_remove': '💔 Bỏ yêu thích',
  'btn.notify_restock': '🔔 Báo tôi',

  // ---------- Badges ----------
  'badge.flash_sale': '🔥 Flash Sale',
  'badge.featured': '⭐ Nổi bật',
  'badge.new': '🆕 Mới',
  'badge.premium': '💎 Premium',
  'badge.best_seller': '🏆 Bán chạy',
  'badge.discount': '🏷️ Giảm {percent}%',

  // ---------- Product screen ----------
  'shop.product.heading': '🛍️ *{name}*',
  'shop.product.badges': '{badges}',
  'shop.product.price': '💰 *Giá:* {price}',
  'shop.product.price.discounted': '💰 *Giá:* {price} (~{was}~ · 🏷️ giảm {percent}%)',
  'shop.product.stock': '📦 *Kho:* {stock}',
  'shop.product.stock.out': '📦 *Kho:* Hết hàng',
  'shop.product.features.title': '✨ *Tính năng*',
  'shop.product.feature': '• {feature}',
  'shop.product.instant_delivery': '⚡ *Giao ngay lập tức*',
  'shop.product.manual_delivery': '🕒 *Giao thủ công* — đội ngũ sẽ xử lý đơn của bạn.',
  'shop.product.favorited': '⭐ *Đã lưu vào yêu thích*',

  // ---------- Search ----------
  'shop.search.prompt':
    '🔍 *Tìm trong cửa hàng*\n──────────────\nGửi tên sản phẩm hoặc một phần tên.\n_Ví dụ: "net" tìm ra "Netflix Premium"._',
  'shop.search.header': '🔍 *Tìm:* “{query}”\n_{total} kết quả • Trang {page}/{pages}_',
  'shop.search.empty':
    '📭 *Không có kết quả cho “{query}”*\n\n_Thử từ khoá ngắn hơn hoặc xoá tìm kiếm._',
  'shop.search.cleared': '🧹 Đã xoá tìm kiếm',

  // ---------- Sort ----------
  'shop.sort.title': '↕️ *Sắp xếp sản phẩm*\n_Hiện tại: {current}_',
  'shop.sort.applied': '↕️ Đã sắp xếp theo {label}',

  // ---------- Favorites ----------
  'shop.favorites.header': '⭐ *Yêu thích của bạn*\n_{total} đã lưu • Trang {page}/{pages}_',
  'shop.favorites.empty':
    '📭 *Chưa có mục yêu thích*\n\n_Mở sản phẩm bất kỳ và nhấn ⭐ để lưu._',
  'shop.favorites.added': '⭐ Đã thêm vào yêu thích',
  'shop.favorites.removed': '💔 Đã bỏ khỏi yêu thích',

  // ---------- Standard screen states ----------
  'state.loading': '⏳ _Đang tải…_',
  'state.error': '❌ *Đã xảy ra lỗi*\n\n_Hãy nhấn 🔄 Làm mới và thử lại._',
  'shop.out_of_stock.notice':
    '❌ *Hết hàng*\n\n_Sản phẩm này hiện không có sẵn. Nhấn ⭐ để theo dõi._',
};
