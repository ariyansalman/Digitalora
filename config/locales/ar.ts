/* العربية — keep keys in sync with en.ts */
export const ar: Record<string, string> = {
  'welcome': 'مرحبًا بك في متجر Digitalora',
  'welcome.title': 'مرحبًا بك في متجر Digitalora!',
  'welcome.balance': 'رصيدك: *${balance}*',
  'welcome.tap_menu': 'اضغط *القائمة الرئيسية* بالأسفل للبدء.',
  'menu.title': '🐯 *متجر Digitalora* — القائمة الرئيسية',

  'btn.main_menu': '⬅️ العودة للقائمة',
  'btn.shop': '🛍️ المتجر الرقمي',
  'btn.topup': '💳 المحفظة',
  'btn.profile': '👤 الملف الشخصي',
  'btn.support': '💬 مركز الدعم',
  'btn.ai_support': '🤖 الدعم بالذكاء الاصطناعي',
  'btn.back': '⬅️ رجوع',
  'btn.next': 'التالي ▶️',
  'btn.prev': '◀️ السابق',
  'btn.refresh': '🔄 تحديث',
  'btn.buy_now': '🛒 شراء الآن',
  'btn.pre_order': '🛍 Pre Order',
  'btn.redeem_referral': '🎁 الدفع بالإحالات',
  'btn.referral_earn_buy': '🔗 اكسب إحالات واشترِ',
  'btn.convert_refers': '💱 تحويل الإحالات إلى USDT',
  'btn.topup_wallet': '👛 شحن المحفظة',
  'btn.view_note': '📝 عرض الملاحظة',
  'btn.qty_plus': '➕',
  'btn.qty_minus': '➖',
  'btn.custom_qty': '🔢 كمية مخصّصة',
  'btn.qty_keypad_back': '⌫',
  'btn.qty_keypad_clear': '🗑 مسح',
  'btn.qty_keypad_confirm': '✅ تأكيد',
  // «الحد الأقصى» يضبط البافر على الحد المسموح للمستخدم
  // (`min(QTY_MAX, المخزون)`) بضغطة واحدة، للمشتري
  // الذي يرغب في شراء الكمية الكاملة دون إدخال الأرقام.
  'btn.qty_keypad_max': '🎯 الحد الأقصى',
  'btn.pay_wallet': '👛 المحفظة',
  'btn.pay_referral': '🎁 دفع بالإحالات',
  'btn.pay_direct': '💸 دفع مباشر',
  'btn.pay_topup': '🪙 شحن',
  'btn.confirm_pay': '✅ تأكيد',
  'btn.cancel_pay': '❌ إلغاء',
  // صفوف "أخرى" و"رجوع" في لوحة طرق الدفع — الرمز المتميز
  // المعرف في EMOJI.paymethod_others / paymethod_back يظهر للمشتركين
  // المميزين، والباقي يرى الرمز التقليدي أدناه كاحتياطي.
  'btn.paymethod_others': '💡 أخرى',
  'btn.paymethod_back': '◀️ رجوع',
  'btn.qty.max': '🎯 الحد الأقصى',
  'btn.qty.reset': '🔄 إعادة',
  'btn.qty.confirm': '✅ تأكيد',
  'btn.contact_admin': '💬 تواصل مع الإدارة',
  'btn.qty.dec_1': '➖ 1',
  'btn.qty.dec_10': '⏪ 10',
  'btn.qty.dec_100': '⏮ 100',
  'btn.qty.inc_1': '➕ 1',
  'btn.qty.inc_10': '⏩ 10',
  'btn.qty.inc_100': '⏭ 100',
  'btn.qty.display': '📦 {qty} / {stock}',
  'btn.share_product': '🔗 نسخ الرابط',
  'btn.view_note_file': '📥 حفظ كملف TXT',
  'btn.view_order': '📦 عرض الطلب',
  'btn.send_note_txt': '📥 تنزيل TXT',
  'btn.out_of_stock': '❌ غير متوفر',
  'btn.my_orders': '📦 طلباتي',
  'btn.refer': '🎁 الإحالة والربح',
  'btn.notifications': '🔔 الإشعارات',
  'btn.toggle_stock': '📢 تنبيهات المخزون',
  'btn.toggle_announcements': '💬 تنبيهات عامة',
  'btn.toggle_wallet': '💰 تنبيهات المحفظة',
  // كل زر على صف مستقل، لذلك نعرض الاسم الكامل وحالة التفعيل.
  'btn.notify.stock.on': '🟢 تنبيهات المخزون: مفعلة',
  'btn.notify.stock.off': '🔕 تنبيهات المخزون: معطلة',
  'btn.notify.ann.on': '🟢 تنبيهات عامة: مفعلة',
  'btn.notify.ann.off': '🔕 تنبيهات عامة: معطلة',
  'btn.notify.wallet.on': '🟢 تنبيهات المحفظة: مفعلة',
  'btn.notify.wallet.off': '🔕 تنبيهات المحفظة: معطلة',
  'btn.back_to_settings': '⬅️ رجوع للإعدادات',
  'btn.language': '🌐 اللغة',
  'btn.language.english': '🇬🇧 English',
  'btn.language.arabic': '🇸🇦 العربية',
  'btn.language.vietnamese': '🇻🇳 Tiếng Việt',
  'btn.region.clear': '🚫 مسح',
  'btn.deposit_history': '💳 سجل الإيداعات',
  'btn.channel': '📣 القناة الرسمية',
  'btn.reseller_api': '🔑 Api Key',
  'api.price_alert.up':
    '{notify_bell} عزيزي مستخدم API، أصبح سعر *{product}* الآن *أعلى* ووصل إلى {price}. يرجى تحديث أسعاركم لهذا المنتج.',
  'api.price_alert.down':
    '{notify_bell} عزيزي مستخدم API، أصبح سعر *{product}* الآن *أقل* ووصل إلى {price}. يرجى تحديث أسعاركم لهذا المنتج.',
  'btn.stats': '📊 إحصائيات',
  'btn.stats_refresh': '🔄 تحديث',
  'btn.stats_back': '◀️ رجوع',
  // أزرار شرح طريقة الدفع المعروضة أسفل كل شاشة عنوان شبكة /
  // Binance / LTC. ينقل المسؤول هذه الشاشات من واجهة الإدارة.
  'btn.where_txid': '📘 أين أجد TXID؟',
  'btn.where_order_id': '📘 أين أجد رقم الطلب؟',
  // Bot tutorial + Using Method (نسخة الإعدادات).
  'btn.using_method': '📘 طريقة الاستخدام',
  'btn.tutorial_open_link': '🔗 فتح الرابط',
  'btn.bot_tutorial': '📘 شرح البوت',

  'shop.home.header.professional': '🛍️ *متجر Digitalora الرقمي*\n_{total} منتج • الصفحة {page}/{pages}_',
  'shop.product.button': '{name} • {price} • متوفر {stock}',
  'shop.product.button.unlimited': '{name} • {price} • ∞',
  'shop.product.button.oos': '❌ {name} • {price} • غير متوفر',
  'shop.home.header': '*المنتجات المتاحة:*',
  'shop.choose_category': '*المنتجات المتاحة:*',
  'shop.qty.prompt': '🔢 اكتب الكمية (1–{max}) وأرسل.',
  'shop.qty.invalid': '❌ رقم غير صالح — أرسل قيمة بين 1 و {max}.',
  // الرمز `{current}` هو بافر الأرقام الذي أدخله المستخدم
  // حتى الآن. قبل أول لمسة يظهر النص `(الكمية)` كتوجيه
  // للمستخدم بدلاً من الشرطة الغامضة السابقة («—»).
  'shop.qty.keypad.instruction':
    '{qty_prompt_keypad} *طريقة الاستخدام:* اضغط الأرقام أدناه أو أرسل رقماً ' +
    'ثم اضغط ✅ تأكيد.\n' +
    'الحالي: <code>{current}</code>',
  // العنصر النائب الذي يظهر داخل `الحالي: <code>…</code>` قبل أن
  // يبدأ المستخدم بإدخال الأرقام. يقرأ كجملة (الحالي: (الكمية))
  // بدلاً من الشرطة الغامضة السابقة («—»).
  'shop.qty.keypad.placeholder': '(الكمية)',
  'shop.qty.keypad.invalid':
    '{qty_invalid} *كمية غير صالحة.*\n\n' +
    'أرسل عدداً صحيحاً بين *1* و *{max}*.',
  'shop.pay.title':
    '{pay_summary} *ملخص الطلب*\n\n' +
    '{emoji} *{name}*\n' +
    '{prod_qty_selected} الكمية: *{qty}*\n' +
    '{promo_line}' +
    '{prod_total_amount} الإجمالي: *{total}*\n' +
    '{prod_wallet} المحفظة: *{balance}*\n' +
    '{referral_line}' +
    'اختر طريقة الدفع:',
  'shop.pay.referral_line':
    '{prod_referral} دفع الإحالات:\n*{available} متاح* • *{required} مطلوب*\n\n',
  // بطاقة تأكيد الدفع من المحفظة (الصفحة 2).
  'shop.pay.confirm':
    '{prod_wallet} *تأكيد الدفع*\n\n' +
    '{pay_summary} *الطلب*\n' +
    '{emoji} *{name}* × *{qty}*\n' +
    '{discount_line}' +
    '{prod_total_amount} *الإجمالي:* {total}\n' +
    '{prod_wallet} *المحفظة:* {balance}\n\n' +
    '_خصم *{total}* من محفظتك؟_',
  'shop.pay.confirm.discount_line':
    '{prod_promo} *خصم:* −{discount}\n',
  'shop.qty.editor.title':
    '🔢 *اختر الكمية*\n\n' +
    '*{name}*\n' +
    'المخزون: *{stock}*\n' +
    'السعر للوحدة: *{price}*\n\n' +
    'المحدد: <code>{qty}</code>\n' +
    'الإجمالي: *{total}*',
  'shop.empty_categories': 'لا توجد فئات بعد. يرجى التحقق لاحقًا.',
  'shop.empty_products': 'لا توجد منتجات في هذه الفئة بعد.',
  'shop.product.line.name': '{emoji} *{name}*',
  'shop.product.line.price': '{prod_price_base} *السعر الأساسي:* {price}',
  'shop.product.line.stock': '{prod_stock} *المتوفر:* {stock}',
  'shop.product.line.warranty': '{prod_warranty} *الضمان:* {warranty}',
  'shop.product.line.referral.progress':
    '{prod_referral} *الدفع بالإحالات:* المطلوب {required} • المتاح {total} • الناقص {remaining}',
  'shop.product.line.referral.ready':
    '{prod_referral} *الدفع بالإحالات:* المطلوب {required} • المتاح {total} • جاهز',
  'shop.product.line.referral.claimed':
    '{prod_referral} *الدفع بالإحالات:* تم استخدام الرصيد في طلب قديم',
  'shop.product.line.qty': '{prod_qty_selected} *الكمية المختارة:* {qty}',
  'shop.product.line.total': '{prod_total_amount} *الإجمالي:* {total}',
  'shop.product.line.balance': '{prod_wallet} *المحفظة:* {balance}',
  'shop.product.line.promo':
    '{prod_promo} *عرض ترويجي:* {label} — −{discount}',
  'shop.product.line.promo.fallback_label': 'الكمية ≥ {min_qty}',
  'shop.product.line.promo.teaser':
    '{prod_promo} *عرض ترويجي:* اشترِ {min_qty}+ بخصم −${discount}',
  'shop.product.line.promo.tier':
    '{prod_promo} *عرض ترويجي:* {min_qty}+ ← ${unit_price} للوحدة',
  'shop.product.line.promo.tier_teaser':
    '{prod_promo} *عرض ترويجي:* اشترِ {min_qty}+ ← ${unit_price} للوحدة',
  'shop.product.line.total.discounted':
    '{prod_total_amount} *الإجمالي:* ~~{gross}~~ {total}',
  'shop.product.out_of_stock_popup':
    '❌ هذا المنتج غير متوفر حاليًا. الرجاء التواصل مع الإدارة لإعادة تجديد المخزون أو اختيار منتج مشابه.',
  'shop.note.title': '📝 *ملاحظة المنتج*',
  'shop.note.empty': 'لا توجد ملاحظة لهذا المنتج.',
  'shop.note.full': [
    '*📝 ملاحظة المنتج — {name}*',
    '',
    '*السعر:* `{price}`',
    '*المخزون:* `{stock}`',
    '*الضمان:* `{warranty}`',
    '',
    '*الوصف:*',
    '{description}',
    '',
    '*الملاحظة:*',
    '{note}',
  ].join('\n'),
  'shop.buy.success':
    '✅ تمت عملية الشراء!\n\nالمنتج: *{name}*\nالكمية: *{qty}*\nالإجمالي: *{total}*\n\nالتسليم:\n```\n{delivery}\n```',
  'shop.buy.insufficient': '❌ رصيد غير كافٍ. تحتاج *{need}* ولديك *{have}* فقط. يرجى الشحن أولاً.',
  'shop.buy.no_stock': '❌ عذرًا، هذا المنتج غير متوفر.',
  'shop.referral.disabled': '❌ دفع الإحالات غير مفعّل لهذا المنتج.',
  'shop.referral.already_redeemed': '✅ تم استخدام دفع الإحالات على طلب قديم.',
  'shop.referral.insufficient':
    '❌ تحتاج {required} إحالة للاستبدال. لديك {total} (باقي {remaining}).',
  'shop.referral.insufficient.card': [
    '⚠️ *رصيد الإحالات غير كافٍ*',
    '',
    '{prod_referral} *المطلوب:* {required} إحالات',
    '{refer_user} *المتاح:* {available} إحالات',
    '{qty_invalid} *المتبقي:* {remaining} إحالات',
    '',
    '{refer_title} ادعُ مستخدمين برابط الإحالة، ثم حدّث الصفحة وادفع بالإحالات.',
  ].join('\n'),
  'shop.referral.confirm': [
    '{refer_title} *تأكيد دفع الإحالات*',
    '',
    '{emoji} *{name}* × *{qty}*',
    '{prod_referral} *المطلوب:* {required} إحالات',
    '{refer_user} *المتاح:* {available} إحالات',
    '{delivery_check} *بعد الدفع:* {after} إحالات',
    '',
    '_استخدام إحالاتك النشطة لهذا الطلب؟_',
  ].join('\n'),
  'shop.referral.failed':
    '❌ تعذر إكمال دفع الإحالات الآن. حاول مرة أخرى أو تواصل مع الإدارة.',
  'shop.referral.confirmed': [
    '{refer_title} *تم الدفع بالإحالات بنجاح!*',
    '',
    '*المنتج:* {name}',
    '*الكمية:* {qty}',
    '*الإحالات المستخدمة:* {spent}',
    '',
    '{delivering} _جارٍ تسليم طلبك…_',
  ].join('\n'),
  'shop.referral.delivery': 'دفع بالإحالات للمنتج #{product_id} (الكمية: {qty})',
  'shop.page.header': '🛒 *{category}*\n\n*المنتجات المتاحة:*\n_{total} منتج — صفحة {page}/{pages}_',

  'profile.title': '⚙️ *الإعدادات*',
  'profile.notifications.title': '{notify_bell} *الإشعارات*',
  'profile.notifications.body':
    '{notify_on} _فعّل فقط التنبيهات التي تهمّك_ {notify_bell}\n\n' +
    '{notify_stock} *تنبيهات المخزون*\n' +
    '{notify_info} *تنبيهات عامة*\n' +
    '{notify_wallet} *تنبيهات المحفظة*\n\n' +
    '{notify_on} مفعلة\n' +
    '{notify_off} معطلة',
  'profile.user_id': 'معرف المستخدم: `{id}`',
  'profile.username': 'اسم المستخدم: @{username}',
  'profile.balance': '👛 الرصيد: *{balance}*',
  'profile.language': '🌐 اللغة: *{language}*',
  'profile.joined': '📅 الانضمام: *{joined}*',
  // شاشة الإحالة والتربح.
  'profile.refer.title': '{refer_title} *إحالة وتربح*',
  'profile.refer.body':
    '{refer_prize_l} *ادعُ 5 مستخدمين واربح $0.10* {refer_prize_r}\n\n' +
    '{refer_clicks} *النقرات:* {clicks}\n' +
    '{refer_pending} *المعلق:* {pending}\n' +
    '{refer_active} *النشط:* {active}\n' +
    '{refer_left} *المتبقي:* {left}\n' +
    '{refer_total} *الإحالات (الإجمالي):* {refTotal}\n' +
    '{refer_coin} *إجمالي الأرباح:* {earnedTotal} USDT\n' +
    '{refer_withdrawn} *المسحوب:* {withdrawn} USDT\n\n' +
    '{refer_paybalance} *رصيد دفع الإحالات:* {refAvailable} إحالات\n' +
    '{refer_spent} *تم تحويلها إلى USDT:* {converted} إحالات\n\n' +
    '_حوّل الأرباح إلى المحفظة عندما تصل إلى $0.50. للسحب النقدي تواصل مع الدعم._\n\n' +
    '*رابط الإحالة الخاص بك:*\n`{link}`',
  'profile.refer.convert_success':
    '💱 تم تحويل *{refs} إحالة* إلى *{amount} USDT*.\n\n💳 رصيد المحفظة: *{balance}*',
  'profile.refer.convert_low':
    '⚠️ لا يوجد رصيد إحالات كافٍ للتحويل بعد.\n\nالتحويل إلى محفظتك يحتاج رصيدًا بقيمة *${min}*.\nالرصيد الحالي: *{available} إحالة* (≈ ${earned}).',
  'profile.refer.convert_error':
    '⚠️ تعذر تحويل الإحالات الآن. حاول مرة أخرى.',
  'btn.live_refers': '🔵 See Your Live Refers',
  'btn.refer_convert': '💱 تحويل إلى المحفظة',
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
  'btn.copy_link': '📋 نسخ الرابط',
  'btn.redeem': '🎁 رمز هدية',
  'profile.language.title': '{lang_left} *اختر اللغة* {lang_right}',
  'profile.email.hub.title': '{email_bracket_l} *إعدادات البريد* {profile_email}',
  'profile.email.hub.body':
    '{email_invoice} نستخدم بريدك لإرسال الفواتير واستعادة الحساب فقط — لن نرسل أي رسائل تسويقية.\n\n' +
    '{profile_email} *البريد الحالي:* `{current}`',
  'profile.email.set.already_set_popup':
    'تم تعيين البريد بالفعل ({current}). استخدم تغيير البريد أو حذف البريد لتحديثه.',
  'profile.email.delete.no_email_popup': 'لا يوجد بريد محفوظ — لا شيء لحذفه.',
  'profile.email.delete.title': '{email_bracket_l} *حذف البريد* {email_bracket_l}',
  'profile.email.delete.body':
    '{email_invalid} _يرجى التأكيد لحذف البريد_\n\n' +
    '{profile_email} *البريد الحالي:* `{current}`',
  'profile.email.delete.success': '✅ تم حذف البريد.',
  'profile.email.in_use':
    '{email_in_use} هذا البريد *مستخدم* بالفعل\n\n' +
    '{email_arrow} *_يرجى إدخال بريد إلكتروني آخر_*',
  'btn.email.delete': '🗑 حذف البريد',
  'btn.email.delete.confirm': '🗑 تأكيد الحذف',
  'btn.email.delete.cancel': '⬅️ إلغاء',
  // أزرار "إرسال PDF" في شاشات الطلبات / الإيداعات / الإحصائيات.
  'btn.send_pdf.orders': 'إرسال PDF الطلبات إلى البريد',
  'btn.send_pdf.deposits': '📤 إرسال PDF الإيداعات إلى البريد',
  'btn.send_pdf.stats': '📤 إرسال PDF الإحصائيات إلى البريد',
  'pdf.no_email_popup':
    '⚠️ يرجى ضبط البريد الإلكتروني أولًا. الإعدادات → إعدادات البريد → ضبط البريد، ثم عُد واضغط "إرسال PDF".',
  'pdf.sending_popup': '⏳ جارٍ إنشاء PDF وإرساله إلى {email}…',
  'pdf.sent_popup': '✅ تم إرسال PDF إلى {email}. تحقّق من البريد الوارد (وملف الرسائل غير المرغوب فيها).',
  // رسالة دردشة تظهر عند نجاح إرسال PDF.
  'pdf.sent_message': '{pdf_sent_l} *تم إرسال PDF إلى البريد* {pdf_sent_r}',
  'pdf.failed_popup':
    '❌ تعذّر إرسال PDF إلى {email}. حاول مرة أخرى بعد قليل — وتواصل مع الدعم إذا تكرّر الخطأ.',
  'orders.empty':
    '{orders_title} *طلباتي*\n\n' +
    '🪄 لا توجد طلبات بعد.\n\n' +
    '✨ 🛍️ 🚀 ابدأ التسوق وستظهر طلباتك هنا!',
  'profile.orders.empty': 'لا توجد طلبات بعد.',
  'profile.orders.title': '🧾 *طلباتي*',
  'profile.orders.line': '#{id} • {name} ×{qty} • {total} • {date}',
  'profile.notify.stock_on': 'تنبيهات المخزون: ✅ مفعلة',
  'profile.notify.stock_off': 'تنبيهات المخزون: ⛔ معطلة',
  'profile.notify.ann_on': 'تنبيهات عامة: ✅ مفعلة',
  'profile.notify.ann_off': 'تنبيهات عامة: ⛔ معطلة',
  'profile.notify.wallet_on': 'تنبيهات المحفظة: ✅ مفعلة',
  'profile.notify.wallet_off': 'تنبيهات المحفظة: ⛔ معطلة',
  'profile.notify.error':
    '⚠️ تعذر حفظ التبديل — يجب تطبيق `0008_wallet_alert.sql` على قاعدة البيانات.',
  'profile.deposits.title': '💳 *سجل الإيداعات*',
  'profile.deposits.empty': 'لا توجد إيداعات بعد.',
  'profile.deposits.line': '#{id} • {amount} • {method} • {status} • {date}',

  'profile.stats.title': 'إحصائياتك',
  'profile.stats.orders': 'الطلبات: {count}',
  'profile.stats.items': 'العناصر المشتراة: {count}',
  'profile.stats.spent': 'إجمالي الإنفاق: {amount} USDT',
  'profile.stats.last': 'آخر طلب: {rel} ({abs})',
  'profile.stats.last_none': 'آخر طلب: —',
  'profile.stats.deposits': 'الإيداعات: {amount} USDT',
  'profile.stats.rel.now': 'الآن',
  'profile.stats.rel.minutes': 'منذ {n} د',
  'profile.stats.rel.hours': 'منذ {n} س',
  'profile.stats.rel.days': 'منذ {n} ي',

  // شرح طريقة الدفع لكل طريقة — قابل للتعديل من واجهة الإدارة
  // ويُعرض من شاشات USDT / Binance / LTC. يحمل عنوان البطاقة
  // اسم الطريقة، والمحتوى يأتي حرفيًا من الإعداد
  // `pay_tutorial.<method_id>.text`.
  'pay.tutorial.title': '{tutorial} *أين تجد المرجع — {method}*',
  'pay.tutorial.empty':
    '_لم يضف المسؤول شرحًا لهذه الطريقة بعد. تحقق لاحقًا._',
  'pay.tutorial.body': '{body}',

  'topup.title': '👛 *شحن المحفظة*',
  'topup.wallet_summary': '💰 *الرصيد الحالي:* {balance}',
  'topup.security_note': '🔐 _يتم التحقق من المدفوعات قبل إضافة الرصيد. لا تشارك TXID أو رقم الطلب مع أي شخص يدّعي أنه الدعم._',
  'topup.choose_method': '👛 *شحن المحفظة*',
  'topup.empty_methods': 'لا توجد طرق دفع مكوّنة. يرجى التواصل مع الدعم.',
  'topup.method.body': '*{name}*\n\n{instructions}',
  'topup.requested': '✅ تم تقديم طلب الشحن (#{id}).\nسيتم التحقق وإضافة الرصيد قريبًا.',
  'topup.cryptobot.amount_prompt':
    '*شحن USDT عبر CryptoBot*\n\nكمية USDT التي تريد إضافتها؟\nأرسل المبلغ (الحد الأدنى: *{min}*).',
  'topup.cryptobot.invalid_amount':
    '❌ أرسل مبلغ USDT صالحًا (الحد الأدنى: *{min}*).',
  'topup.cryptobot.start_failed':
    '⚠️ تعذر بدء شحن CryptoBot. حاول مرة أخرى أو استخدم طريقة دفع أخرى.',
  'topup.cryptobot.invoice_failed':
    '⚠️ تعذر إنشاء فاتورة CryptoBot الآن. حاول مرة أخرى بعد قليل.',
  'topup.cryptobot.invoice_ready':
    '*فاتورة CryptoBot جاهزة*\n\nالمبلغ: *{amount}*\n\nاضغط *فتح الفاتورة* وأكمل الدفع في CryptoBot، ثم اضغط *تحقق*.',
  'directpay.cryptobot.invoice_ready':
    '*فاتورة الدفع المباشر عبر CryptoBot جاهزة*\n\nالمبلغ: *{amount} USDT*\n\nاضغط *فتح الفاتورة* وأكمل الدفع في CryptoBot، ثم اضغط *تحقق* لتسليم طلبك.',
  'topup.cryptobot.open_invoice': '💳 فتح الفاتورة',
  'topup.cryptobot.check': '✅ دفعت / تحقق',
  'topup.cryptobot.check_unavailable': 'تمت معالجة هذه الدفعة أو أنها غير متاحة.',
  'topup.cryptobot.check_failed': 'تعذر التحقق من الدفع الآن. حاول مرة أخرى قريبًا.',
  'topup.cryptobot.not_paid': 'لم يتم استلام الدفع بعد. اضغط تحقق مرة أخرى بعد الدفع.',
  'topup.cryptobot.check_success': 'تم تأكيد الدفع وإضافة الرصيد.',
  'topup.cryptobot.already_processed': 'تمت معالجة الدفع مسبقًا.',
  'topup.cryptobot.finalize_failed': 'تعذر إنهاء الدفع الآن. حاول مرة أخرى.',
  'topup.cryptobot.success':
    '✅ *تم تأكيد دفع CryptoBot!*\n\nرقم الإيداع: *{depositId}*\nتمت الإضافة: *{amount}*\nالرصيد الجديد: *{balance}*',

  'support.title': '{support_title} الدعم',
  'support.body':
    '_*إذا تعذّر عليك إرسال رسالة أو واجهتك مشكلة، استخدم الدعم المباشر للتواصل مع المسؤول مباشرة.*_',
  'support.btn.contact': '📩 تواصل مع المسؤول',
  'support.contact_prefill': 'مرحبًا، أحتاج مساعدة بخصوص ShopBot Digitalora، الرجاء المساعدة بشأن: ',
  'support.btn.cancel': 'إلغاء الدعم',
  'support.btn.live': '🟢 الدعم المباشر',
  'support.btn.end_session': '🔴 إنهاء الجلسة',
  'support.live.busy_popup': '⏳ المسؤول مشغول حاليًا مع مستخدم آخر. حاول مرة أخرى بعد قليل.',
  'support.live.user_active':
    '{support_live_active} الدعم المباشر\n\n' +
    'جلسة الدعم فعّالة.\n\n' +
    'اكتب رسالتك هنا مباشرةً — كل رسالة تُرسل فورًا إلى المسؤول. اضغط *إلغاء الدعم* في أي وقت لإنهاء الجلسة.',
  'support.live.session_created': '🟢 *تم إنشاء جلسة دعم مباشر*',
  'support.live.admin_started':
    '🟢 *بدأ الدعم المباشر*\n\n' +
    'المستخدم: *{name}* (@{username})\nID: `{id}`\n\nردّ هنا للدردشة. أرسل /end لإنهاء الجلسة.',
  'support.live.admin_relay': '*[{name}]:* {text}',
  'support.live.admin_media_header': '*[{name}]* أرسل ملفًا:',
  'support.live.user_ended':
    '{support_live_closed} تم إغلاق الدعم المباشر.\n\n' +
    'افتح الدعم مرّة أخرى من القائمة عند حاجتك للمساعدة.',
  'support.live.admin_ended': '🔴 *تم إغلاق جلسة الدعم المباشر.*',
  'support.live.unavailable_popup':
    '⚠️ الدعم المباشر غير متاح مؤقتاً — لا يمكن الوصول إلى المسؤول الآن. الرجاء استخدام «التواصل مع الإدارة» أو إعادة المحاولة لاحقاً.',
  'support.live.unavailable_message':
    '⚠️ *الدعم المباشر غير متاح*\n\n' +
    'تعذّر الوصول إلى المسؤول الآن. السبب الأكثر شيوعاً أنّ المسؤول لم يفتح هذا البوت بعد ويضغط *Start* لمرة واحدة حتى يسمح تيليغرام للبوت بمراسلته.\n\n' +
    'الرجاء استخدام *التواصل مع الإدارة* من قائمة الدعم في الوقت الحالي.',
  'support.btn.email_transcript': '📧 إرسال ملف PDF للدردشة عبر البريد',
  'support.transcript.sent_message':
    '{pdf_sent_l} *تم إرسال PDF إلى البريد* {pdf_sent_r}',
  'support.transcript.no_email_popup':
    '⚠️ أضف بريدك الإلكتروني أولًا من الإعدادات → إعدادات البريد → ضبط البريد، ثم عُد واضغط على إرسال PDF.',
  'support.transcript.sending_popup': '⏳ جارٍ إنشاء سجل الدعم وإرساله إلى {email}…',
  'support.transcript.failed_popup':
    '❌ تعذّر إرسال السجل إلى {email}. حاول مرة أخرى — تواصل مع الدعم إذا تكرّر الخطأ.',
  'support.transcript.expired_popup':
    '⌛ لم يعد هذا السجل متاحًا. ابدأ جلسة دعم مباشر جديدة عند الحاجة للمساعدة.',
  'support.ai.session_open':
    '{kiwi_ai} *Kiwi Ai*\n' +
    '*أنا كيوي، مساعد الدعم الآلي.*\n\n' +
    'يمكنك طرح أي سؤال بأي لغة أو الحصول على مساعدة بشأن المنتجات، ' +
    'الأسعار، المخزون، الإيداعات، الكوبونات، الطلبات، والتوصيل. ' +
    'تفاصيل النظام الداخلية ممنوعة.',
  'support.ai.user_ended':
    '{support_live_closed} تم إغلاق دردشة Kiwi Ai.\n\n' +
    'افتح Kiwi Ai مرة أخرى من القائمة عند الحاجة.',
  'support.ai.fallback':
    'لم أستطع الإجابة تلقائيًا. سيتواصل معك أحد المسؤولين قريبًا.',
  'support.ai.pdf_prompt':
    '{kiwi_ai} *تم حفظ محادثة Kiwi Ai.*\n' +
    'اضغط أدناه لإرسال سجل المحادثة إلى بريدك الإلكتروني كـ PDF.',
  'support.ai.empty_popup':
    '💬 أرسل سؤالاً واحداً على الأقل أولاً — لا يوجد شيء لحفظه بعد.',
  'support.ai.title': '{kiwi_ai} *Kiwi Ai*',
  'support.ai.prompt': 'اشرح مشكلتك وسأبذل قصارى جهدي للمساعدة.',
  'channel.not_set': '📢 لم يتم ضبط رابط القناة بعد.',
  'channel.subscribe.title': '📢 *انضم إلى قناتنا* للمتابعة',
  'channel.subscribe.body': 'يرجى الانضمام أدناه ثم الضغط على *لقد انضممت*.',
  'channel.subscribe.joined': '✅ لقد انضممت',

  'admin.only': '⛔ للمسؤول فقط.',
  'admin.help.title': '🛠 *أوامر المسؤول*',
  'admin.cache.cleared': '🧹 تم مسح الكاش.',

  'admin.text.set': '✅ تم تحديث النص `{key}`.',
  'admin.color.set': '✅ تم تعيين لون `{key}` إلى *{color}*.',
  'admin.emoji.set': '✅ تم تحديث الإيموجي `{key}`.',
  'admin.product.added': '✅ تمت إضافة المنتج *{name}* (id={id}).',
  'admin.category.added': '✅ تمت إضافة الفئة *{name}* (id={id}).',
  'admin.payment.added': '✅ تمت إضافة طريقة الدفع *{name}* (id={id}).',
  'admin.bad_args': '❌ معاملات خاطئة. الاستخدام: `{usage}`',

  'err.generic': '⚠️ حدث خطأ. حاول مرة أخرى.',
  'err.unknown_action': '⚠️ إجراء غير معروف.',
  'profile.pricelist.csv.promo_tier_format':
    'اشترِ {min_qty}+ ← {unit_price} USDT للوحدة',
  // ---------- 🧾 الدفع المشترك ----------
  'checkout.btn.wallet': '👛 الدفع من المحفظة',
  'checkout.btn.methods': '💳 طرق الدفع',
  'checkout.btn.coupon': '🎟️ كوبون',
  'checkout.btn.coupon_remove': '🎟️ إزالة الكوبون',
  'checkout.btn.back': '⬅️ رجوع',
  'checkout.btn.cancel': '❌ إلغاء',
  'checkout.btn.confirm': '✅ تأكيد والدفع',
  'checkout.title':
    '🧾 *ملخص الطلب*\n\n{lines}\n\n──────────────\n🔢 *العناصر:* {items}\n💵 *المجموع الفرعي:* {subtotal}{discount_lines}\n💳 *المبلغ المستحق:* {payable}\n👛 *رصيد المحفظة:* {balance}{warning}{coupon_warning}',
  'checkout.line':
    '📦 *{index}. {name}*\n🔢 الكمية: {qty}\n💵 سعر الوحدة: {unit_price}\n💰 المجموع: {subtotal}{note}',
  'checkout.discount.promo': '🎁 *عرض ترويجي:* -{amount}',
  'checkout.discount.coupon': '🎟️ *كوبون {code}:* -{amount}',
  'checkout.empty': '🧾 *ملخص الطلب*\n\nلا يوجد شيء للدفع حاليًا.',
  'checkout.warning': '\n⚠️ تغيّرت بعض العناصر وتم تعديلها أو تخطيها.',
  'checkout.expired': '⚠️ انتهت صلاحية هذه العملية. افتح السلة أو المنتج مرة أخرى.',
  'checkout.nothing': 'لا يمكن شراء أي عنصر في هذا الطلب حاليًا.',
  'checkout.in_progress': 'تتم معالجة عملية الدفع الخاصة بك بالفعل.',
  'checkout.duplicate': '✅ تم تنفيذ هذا الطلب مسبقًا — لم يتم خصم المبلغ مرتين.',
  'checkout.insufficient': 'رصيد محفظتك غير كافٍ لهذا الطلب.',
  'checkout.cancelled': '❌ تم إلغاء الدفع',
  'checkout.cancelled.card': '❌ *تم إلغاء الدفع*\n\nلم يتم خصم أي مبلغ.',
  'checkout.back.hint': '⬅️ إلى أين تريد الرجوع؟',
  'checkout.methods.hint': '💳 *طرق الدفع*\n\nاختر طريقة الدفع لهذا الطلب.',
  'checkout.confirm':
    '💳 *تأكيد الدفع*\n\n🔢 العناصر: {items}\n💳 المستحق: {payable}\n👛 رصيد المحفظة: {balance}\n\nأكِّد للدفع من محفظتك.',
  'checkout.coupon.prompt': '🎟️ *كوبون*\n\nأرسل رمز الكوبون في رسالة.',
  'checkout.coupon.applied': '🎟️ تم تطبيق الكوبون *{code}* — وفّرت {amount}.',
  'checkout.coupon.removed': '🎟️ تمت إزالة الكوبون',
  'checkout.coupon.rejected': '⚠️ لم يتم تطبيق الكوبون *{code}*: {reason}',
  'checkout.coupon.reason.unknown': 'هذا الرمز غير موجود',
  'checkout.coupon.reason.inactive': 'هذا الرمز لم يعد فعّالًا',
  'checkout.coupon.reason.not_started': 'لم يبدأ هذا الرمز بعد',
  'checkout.coupon.reason.expired': 'انتهت صلاحية هذا الرمز',
  'checkout.coupon.reason.min_subtotal': 'طلبك أقل من الحد الأدنى لهذا الرمز',
  'checkout.coupon.reason.usage_limit': 'وصل هذا الرمز إلى حد الاستخدام',
  'checkout.coupon.reason.per_user_limit': 'لقد استخدمت هذا الرمز من قبل',
  'checkout.coupon.reason.not_applicable': 'هذا الرمز لا ينطبق على هذه العناصر',
  'checkout.coupon.reason.no_effect': 'هذا الرمز لا يمنح خصمًا على هذا الطلب',

  // ---------- Marketplace experience (search / sort / wishlist) ----------
  'btn.shop_search': '🔍 بحث',
  'btn.shop_search_clear': '🧹 مسح البحث',
  'btn.shop_sort': '↕️ ترتيب',
  'btn.sort_recommended': '✨ موصى به',
  'btn.sort_price_asc': '💰 السعر: من الأقل للأعلى',
  'btn.sort_price_desc': '💎 السعر: من الأعلى للأقل',
  'btn.sort_name_asc': '🔤 الاسم: أ إلى ي',
  'btn.sort_newest': '🆕 الأحدث أولاً',
  'btn.sort_stock_desc': '📦 الأكثر توفرًا',
  'btn.favorites': '⭐ المفضلة',
  'btn.favorite_add': '⭐ إضافة للمفضلة',
  'btn.favorite_remove': '💔 إزالة من المفضلة',
  'btn.notify_restock': '🔔 نبهني',

  // ---------- Badges ----------
  'badge.flash_sale': '🔥 عرض سريع',
  'badge.featured': '⭐ مميز',
  'badge.new': '🆕 جديد',
  'badge.premium': '💎 بريميوم',
  'badge.best_seller': '🏆 الأكثر مبيعًا',
  'badge.discount': '🏷️ خصم {percent}%',

  // ---------- Product screen ----------
  'shop.product.heading': '🛍️ *{name}*',
  'shop.product.badges': '{badges}',
  'shop.product.price': '💰 *السعر:* {price}',
  'shop.product.price.discounted': '💰 *السعر:* {price} (~{was}~ · 🏷️ خصم {percent}%)',
  'shop.product.stock': '📦 *المخزون:* {stock}',
  'shop.product.stock.out': '📦 *المخزون:* غير متوفر',
  'shop.product.features.title': '✨ *المميزات*',
  'shop.product.feature': '• {feature}',
  'shop.product.instant_delivery': '⚡ *تسليم فوري*',
  'shop.product.manual_delivery': '🕒 *تسليم يدوي* — سيكمل فريقنا طلبك.',
  'shop.product.favorited': '⭐ *تمت الإضافة إلى المفضلة*',

  // ---------- Search ----------
  'shop.search.prompt':
    '🔍 *ابحث في المتجر*\n──────────────\nأرسل اسم المنتج أو جزءًا منه.\n_مثال: «net» تجد «Netflix Premium»._',
  'shop.search.header': '🔍 *بحث:* «{query}»\n_{total} نتيجة • صفحة {page}/{pages}_',
  'shop.search.empty':
    '📭 *لا نتائج لـ «{query}»*\n\n_جرّب كلمة أقصر أو امسح البحث لتصفح كل المنتجات._',
  'shop.search.cleared': '🧹 تم مسح البحث',

  // ---------- Sort ----------
  'shop.sort.title': '↕️ *ترتيب المنتجات*\n_الحالي: {current}_',
  'shop.sort.applied': '↕️ تم الترتيب حسب {label}',

  // ---------- Favorites ----------
  'shop.favorites.header': '⭐ *مفضلتك*\n_{total} محفوظة • صفحة {page}/{pages}_',
  'shop.favorites.empty':
    '📭 *لا توجد مفضلات بعد*\n\n_افتح أي منتج واضغط ⭐ لحفظه هنا._',
  'shop.favorites.added': '⭐ تمت الإضافة للمفضلة',
  'shop.favorites.removed': '💔 تمت الإزالة من المفضلة',

  // ---------- Standard screen states ----------
  'state.loading': '⏳ _جارٍ التحميل…_',
  'state.error': '❌ *حدث خطأ ما*\n\n_اضغط 🔄 تحديث وحاول مجددًا._',
  'shop.out_of_stock.notice':
    '❌ *غير متوفر*\n\n_هذا المنتج غير متاح حاليًا. اضغط ⭐ لحفظه ومتابعته._',
};
