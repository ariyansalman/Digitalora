import { session, type Context, type SessionFlavor } from 'grammy';
import { SupabaseSessionStorage } from './sessionStorage.js';

/** Multi-step admin input flow state. */
export type AdminFlow =
  | { type: 'add_category'; step: 'name'; data: { emoji?: string } }
  | { type: 'add_category'; step: 'emoji'; data: { name: string } }
  | { type: 'delivery_manual_message'; step: 'text'; data: { submission_id: number } }
  | { type: 'add_product'; step: 'name'; data: { category_id: number } }
  | { type: 'add_product'; step: 'price'; data: { category_id: number; name: string } }
  | {
      // After price we ask: "Unlimited stock?" via two inline buttons
      // (Yes → set unlimited_stock=true and skip stock count; No → ask
      // for integer count). The "stock" step below remains the
      // integer-count step. We carry `unlimited` on data so the
      // finalize step can persist it.
      type: 'add_product';
      step: 'unlimited';
      data: { category_id: number; name: string; price: number };
    }
  | {
      type: 'add_product';
      step: 'stock';
      data: { category_id: number; name: string; price: number };
    }
  | {
      type: 'add_product';
      step: 'warranty';
      data: {
        category_id: number;
        name: string;
        price: number;
        stock: number;
        unlimited?: boolean;
      };
    }
  | {
      type: 'add_product';
      step: 'description';
      data: {
        category_id: number;
        name: string;
        price: number;
        stock: number;
        unlimited?: boolean;
        warranty?: string;
      };
    }
  | {
      type: 'add_product';
      step: 'note';
      data: {
        category_id: number;
        name: string;
        price: number;
        stock: number;
        unlimited?: boolean;
        warranty?: string;
        description?: string;
      };
    }
  | {
      // After the note step, prompt for the per-product items pool
      // (the actual deliverables — emails+passwords, links, etc).
      // Multiline; one payload per line. Empty / Skip means no pool
      // and the buyer falls back to the manual-delivery placeholder.
      type: 'add_product';
      step: 'items';
      data: {
        category_id: number;
        name: string;
        price: number;
        stock: number;
        unlimited?: boolean;
        warranty?: string;
        description?: string;
        note?: string;
      };
    }
  // -------- Per-product inline editor (premium-shop overhaul) --------
  // Each step waits for ONE message of the appropriate kind.
  | { type: 'edit_product_emoji'; step: 'premium'; data: { product_id: number; page: number } }
  | { type: 'edit_product_note_text'; step: 'text'; data: { product_id: number; page: number } }
  | { type: 'edit_product_description'; step: 'text'; data: { product_id: number; page: number } }
  | { type: 'edit_product_warranty'; step: 'text'; data: { product_id: number; page: number } }
  | { type: 'edit_product_tutorial_text'; step: 'text'; data: { product_id: number; page: number } }
  | { type: 'edit_product_tutorial_file'; step: 'file'; data: { product_id: number; page: number } }
  | { type: 'edit_product_tutorial_url'; step: 'url'; data: { product_id: number; page: number } }
  | {
      // Bulk-add deliverables to the per-product items pool with a
      // staging buffer. The admin can:
      //   • paste many lines in one message,
      //   • forward several vendor messages one-by-one (each adds to
      //     the buffer),
      //   • OR upload a `.txt` file (auto-parsed line-by-line).
      // Nothing is written to the pool until they tap **Confirm**;
      // **Clear** drops the buffer, **Cancel** ends the flow.
      type: 'edit_product_items';
      step: 'items';
      data: {
        product_id: number;
        page: number;
        // Staged payloads accumulated across messages — flushed to
        // the pool atomically on Confirm. Stored on the flow itself
        // so the buffer survives multiple admin messages without a
        // separate cache.
        staged?: string[];
        // Telegram chat + message id of the live "Staging" status
        // card. We edit it in-place every time the buffer changes
        // so the chat history stays clean.
        promptChatId?: number;
        promptMessageId?: number;
      };
    }
  | { type: 'edit_product_price'; step: 'price'; data: { product_id: number; page: number } }
  | { type: 'edit_product_stock'; step: 'stock'; data: { product_id: number; page: number } }
  | { type: 'edit_product_name'; step: 'name'; data: { product_id: number; page: number } }
  | { type: 'edit_product_id'; step: 'id'; data: { product_id: number; page: number } }
  | {
      type: 'edit_product_low_stock';
      step: 'threshold';
      data: { product_id: number; page: number };
    }
  | {
      type: 'edit_product_referral_required';
      step: 'count';
      data: { product_id: number; page: number };
    }
  // -------- Per-product post-purchase delivery form editor --------
  // Each step waits for ONE message of the appropriate kind. The
  // message handler in `handlers/admin/index.ts` applies the patch,
  // clears `adminFlow`, and re-renders the product editor.
  | {
      type: 'edit_product_delivery_instruction';
      step: 'text';
      data: { product_id: number; page: number };
    }
  | {
      type: 'edit_product_delivery_success';
      step: 'text';
      data: { product_id: number; page: number };
    }
  | {
      type: 'edit_product_delivery_completion';
      step: 'text';
      data: { product_id: number; page: number };
    }
  | {
      type: 'edit_product_delivery_fields';
      step: 'spec';
      data: { product_id: number; page: number };
    }
  | {
      type: 'edit_product_delivery_vendor';
      step: 'chat_id';
      data: { product_id: number; page: number };
    }
  | {
      type: 'edit_product_delivery_vendor_label';
      step: 'text';
      data: { product_id: number; page: number };
    }
  // -------- Bot Tutorial editor (Settings → Bot Tutorial → Edit) --------
  | { type: 'edit_bot_tutorial_text'; step: 'text'; data: Record<string, never> }
  | { type: 'edit_bot_tutorial_file'; step: 'file'; data: Record<string, never> }
  | { type: 'edit_bot_tutorial_url'; step: 'url'; data: Record<string, never> }
  // -------- Per-payment-method tutorial editor (Payment Methods → Tutorial → Edit) --------
  // Mirrors the bot-tutorial editor but scoped to a specific
  // payment method id. The next admin message of the appropriate
  // kind (text / file / url) is captured into
  // `pay_tutorial.<method_id>.*` settings.
  | {
      type: 'edit_payment_tutorial_text';
      step: 'text';
      data: { method_id: number };
    }
  | {
      type: 'edit_payment_tutorial_file';
      step: 'file';
      data: { method_id: number };
    }
  | {
      type: 'edit_payment_tutorial_url';
      step: 'url';
      data: { method_id: number };
    }
  | { type: 'add_payment'; step: 'name'; data: Record<string, never> }
  | { type: 'add_payment'; step: 'instructions'; data: { name: string } }
  | { type: 'set_text'; step: 'key'; data: Record<string, never> }
  | { type: 'set_text'; step: 'value'; data: { key: string } }
  | { type: 'stats_custom_days'; step: 'days'; data: Record<string, never> }
  | { type: 'set_emoji'; step: 'key'; data: Record<string, never> }
  | { type: 'set_emoji'; step: 'value'; data: { key: string } }
  | { type: 'set_btnicon'; step: 'value'; data: { btnKey: string } }
  | { type: 'set_color'; step: 'value'; data: { key: string } }
  | { type: 'set_color_glyph'; step: 'value'; data: { mode: string } }
  | { type: 'supplier_api_add'; step: 'json'; data: Record<string, never> }
  | { type: 'supplier_canboso_add'; step: 'key'; data: Record<string, never> }
  | { type: 'supplier_reseller_add'; step: 'key'; data: Record<string, never> }
  | { type: 'supplier_vex_add'; step: 'key'; data: Record<string, never> }
  | { type: 'supplier_product_link_add'; step: 'json'; data: { supplier_id?: number } }
  | { type: 'preorder_manual_send'; step: 'items'; data: { order_id: number } }
  | { type: 'announce'; step: 'text'; data: Record<string, never> }
  | {
      // Confirm step + every callback-driven sub-step of the
      // announce-Buy-button editor (product picker, color picker,
      // icon picker) — they all share the same `data` shape, with
      // the optional `buy` field carrying the button definition as
      // the admin builds it up. The actual text-input sub-step is
      // `buy_label` below.
      type: 'announce';
      step: 'confirm';
      data: {
        text: string;
        format?: 'md' | 'html';
        share_sales?: boolean;
        buy?: {
          product_id: number;
          product_name: string;
          label: string;
          color: import('../../config/index.js').ColorMode;
          icon_unicode?: string;
          icon_custom_emoji_id?: string;
        };
      };
    }
  | {
      // Waiting for the admin to send the new button label as a text
      // message. Carries the same `data` so we can resume the confirm
      // screen with the updated label.
      type: 'announce';
      step: 'buy_label';
      data: {
        text: string;
        format?: 'md' | 'html';
        share_sales?: boolean;
        buy: {
          product_id: number;
          product_name: string;
          label: string;
          color: import('../../config/index.js').ColorMode;
          icon_unicode?: string;
          icon_custom_emoji_id?: string;
        };
      };
    }
  | {
      // Waiting for the admin to send a premium-emoji message that
      // we'll capture into `icon_custom_emoji_id` for the Buy button.
      // Same data shape as `buy_label`.
      type: 'announce';
      step: 'buy_icon';
      data: {
        text: string;
        format?: 'md' | 'html';
        share_sales?: boolean;
        buy: {
          product_id: number;
          product_name: string;
          label: string;
          color: import('../../config/index.js').ColorMode;
          icon_unicode?: string;
          icon_custom_emoji_id?: string;
        };
      };
    }
  | { type: 'find_user'; step: 'query'; data: Record<string, never> }
  | { type: 'set_force_join_channel'; step: 'value'; data: Record<string, never> }
  | { type: 'adjust_balance'; step: 'amount'; data: { telegram_id: number } }
  | { type: 'referral_find_user'; step: 'query'; data: Record<string, never> }
  | { type: 'referral_adjust'; step: 'delta'; data: { telegram_id: number } }
  | {
      // Step 1 of the Custom-Prices flow — admin entered the menu and
      // is being asked to identify which user the overrides apply to.
      type: 'price_overrides_pick_user';
      step: 'query';
      data: Record<string, never>;
    }
  | {
      // Admin tapped "Set/edit override" on a specific product and
      // is now being asked for the override price (numeric, USD).
      type: 'price_override_set';
      step: 'price';
      data: { telegram_id: number; product_id: number };
    }
  | {
      // Admin tapped "Bulk paste" — they'll send a multi-line block
      // of `<product_id> <price>` lines that we apply atomically.
      type: 'price_override_bulk';
      step: 'block';
      data: { telegram_id: number };
    }
  | { type: 'ban_user'; step: 'reason'; data: { telegram_id: number } }
  | { type: 'set_deposit_amount'; step: 'amount'; data: { deposit_id: number } }
  | { type: 'add_gift'; step: 'code'; data: Record<string, never> }
  | { type: 'add_gift'; step: 'amount'; data: { code: string } }
  | {
      type: 'add_gift';
      step: 'per_user_limit';
      data: { code: string; amount: number };
    }
  | {
      type: 'add_gift';
      step: 'max_redemptions';
      data: { code: string; amount: number; per_user_limit: number };
    }
  // -------- Promo (qty-threshold flat-USDT discount) flow --------
  // Multi-step `/promo add` wizard. The admin walks through:
  //   scope → (user?) → (product?) → min_qty → discount → (name?)
  // and we materialize the row at the very end. The intermediate
  // `data` carries forward only what's been collected so far so the
  // type narrows naturally per step.
  | {
      type: 'promo_add';
      step: 'pick_user';
      data: { scope: 'user' | 'user_product' };
    }
  | {
      // Awaiting a product callback. Used both when scope is
      // "product" (telegram_id stays null) and when scope is
      // "user_product" (telegram_id was just resolved in pick_user).
      type: 'promo_add';
      step: 'pick_product';
      data: { scope: 'product' | 'user_product'; telegram_id: number | null };
    }
  | {
      type: 'promo_add';
      step: 'min_qty';
      data: {
        scope: 'default' | 'product' | 'user' | 'user_product';
        product_id: number | null;
        telegram_id: number | null;
      };
    }
  | {
      type: 'promo_add';
      step: 'type';
      data: {
        scope: 'default' | 'product' | 'user' | 'user_product';
        product_id: number | null;
        telegram_id: number | null;
      };
    }
  | {
      type: 'promo_add';
      step: 'tiers';
      data: {
        scope: 'default' | 'product' | 'user' | 'user_product';
        product_id: number | null;
        telegram_id: number | null;
      };
    }
  | {
      type: 'promo_add';
      step: 'tier_confirm';
      data: {
        scope: 'default' | 'product' | 'user' | 'user_product';
        product_id: number | null;
        telegram_id: number | null;
        tiers: Array<{ min_qty: number; max_qty: number | null; unit_price: number }>;
      };
    }
  | {
      type: 'promo_add';
      step: 'discount';
      data: {
        scope: 'default' | 'product' | 'user' | 'user_product';
        product_id: number | null;
        telegram_id: number | null;
        min_qty: number;
      };
    }
  | {
      type: 'promo_add';
      step: 'name';
      data: {
        scope: 'default' | 'product' | 'user' | 'user_product';
        product_id: number | null;
        telegram_id: number | null;
        min_qty: number;
        discount_amount: number;
      };
    }
  // Single-field edits invoked from the promo edit card.
  | { type: 'promo_edit_qty'; step: 'value'; data: { promo_id: number } }
  | { type: 'promo_edit_discount'; step: 'value'; data: { promo_id: number } }
  | { type: 'promo_edit_tiers'; step: 'value'; data: { promo_id: number } }
  | { type: 'promo_edit_name'; step: 'value'; data: { promo_id: number } }
  // Exclude-a-user prompt opened from the promo card. Accepts a
  // numeric Telegram id or @username (same resolution as the
  // `pick_user` step in the new-promo wizard).
  | { type: 'promo_exclude_add'; step: 'pick_user'; data: { promo_id: number } }
  // -------- Per-payment-method chrome editor --------
  // Admin entered the chrome editor for a specific row in the
  // Payment Methods list. `step:'icon'` waits for ONE message (any
  // emoji — premium custom emoji or unicode glyph). `step:'color'`
  // waits for a callback to pick a color.
  | { type: 'edit_payment_icon'; step: 'icon'; data: { method_id: number } }
  // -------- Auto-verify payment-method wizards --------
  // Each provider wizard captures a display name then a wallet
  // address. `provider` distinguishes which network the address
  // must validate against.
  | {
      type: 'add_chain_payment';
      step: 'name';
      data: {
        provider: 'usdt_trc20' | 'usdt_bep20' | 'usdt_ton' | 'ltc';
      };
    }
  | {
      type: 'add_chain_payment';
      step: 'address';
      data: {
        provider: 'usdt_trc20' | 'usdt_bep20' | 'usdt_ton' | 'ltc';
        name: string;
      };
    }
  // -------- Binance Pay payment-method wizard --------
  // Three-step wizard: name → pay_id → pay_name.
  // The pay_id (10-digit numeric Binance Pay ID) is stored on
  // payment_methods.address; the pay_name (display string like
  // "urweebboii") on payment_methods.pay_name.
  | {
      type: 'add_binance_payment';
      step: 'name';
      data: Record<string, never>;
    }
  | {
      type: 'add_binance_payment';
      step: 'pay_id';
      data: { name: string };
    }
  | {
      type: 'add_binance_payment';
      step: 'pay_name';
      data: { name: string; pay_id: string };
    }
  | {
      type: 'add_bybit_payment';
      step: 'name';
      data: Record<string, never>;
    }
  | {
      type: 'add_bybit_payment';
      step: 'bybit_id';
      data: { name: string };
    }
  | {
      type: 'add_bybit_payment';
      step: 'bybit_name';
      data: { name: string; bybit_id: string };
    }
  | {
      type: 'add_cryptobot_payment';
      step: 'name';
      data: Record<string, never>;
    };

/**
 * Multi-step user-side flow.
 */
export type UserFlow =
  | {
      /**
       * User tapped 🔍 Search on the marketplace home. The next plain
       * text message is treated as a partial product-search query.
       * `promptChatId` / `promptMessageId` let the handler edit the
       * prompt into the results screen instead of stacking messages.
       */
      type: 'shop_search';
      step: 'query';
      data: { promptChatId?: number; promptMessageId?: number };
    }
  | {
      /**
       * Capture a coupon code typed on the shared 🧾 checkout screen.
       * The code is only ever a lookup key — the discount itself is
       * recomputed server-side by `services/checkout.ts`.
       */
      type: 'checkout_coupon';
      step: 'code';
      data: Record<string, never>;
    }
  | {
      /**
       * Capture an email address sent as a message after tapping "Set
       * Email" or "Change Email". `mode` distinguishes the two so we
       * can echo the right confirmation copy.
       *
       * `postPurchase` is set when the flow is entered via the
       * post-delivery `Add Verified Email` CTA (vs. Settings →
       * Email). When true the message handler:
       *   - auto-deletes the user's typed-email message + the saved
       *     "Has been Saved!" confirmation card
       *   - drops a single bold "Email has been setuped" line
       *   - fires a retroactive invoice email for `pendingInvoiceOrderId`.
       */
      type: 'set_email';
      step: 'value';
      data: {
        mode: 'set' | 'change';
        postPurchase?: boolean;
        pendingInvoiceOrderId?: number;
        promptChatId?: number;
        promptMessageId?: number;
      };
    }
  | {
      /**
       * User is on the Redeem Gift Code screen — next plain-text
       * message they send is treated as a code to redeem.
       */
      type: 'redeem_gift';
      step: 'value';
      data: Record<string, never>;
    }
  | {
      /**
       * User is viewing the My Orders list — typing a public order
       * ID opens the detail screen for that order.
       */
      type: 'orders_lookup';
      step: 'value';
      data: Record<string, never>;
    }
  | {
      /**
       * User opened the *Custom Quantity* keypad on a product page.
       * While this flow is active any plain-text reply is parsed as
       * a quantity (concatenation, not arithmetic — `1` then `1`
       * yields `11`). On a successful submit the bot deletes both
       * the keypad prompt and the user's reply so the chat stays
       * clean. `promptChatId` / `promptMessageId` track the prompt
       * message so it can be edited and ultimately deleted.
       */
      type: 'qty_keypad';
      step: 'await_qty';
      data: {
        productId: number;
        promptChatId: number;
        promptMessageId?: number;
      };
    }
  | {
      /**
       * USDT chain (BEP20 / TRC20 / TON) top-up: user has seen the
       * deposit address and is expected to paste the on-chain tx
       * hash. We verify recipient + USDT contract + amount on-chain
       * and credit on success.
       */
      type: 'chain_topup';
      step: 'tx_hash';
      data: {
        method_id: number;
        method_name: string;
        provider: 'usdt_trc20' | 'usdt_bep20' | 'usdt_ton';
        address: string;
        /**
         * Wall-clock instant (ms since epoch) when the user landed
         * on the address screen. Forwarded to the verifier as
         * `openedAtMs` to anchor the 30-min freshness window so a
         * stale vendor TXID can't be replayed.
         */
        opened_at_ms: number;
        /** Message id of the instruction screen — deleted on success. */
        instruction_message_id?: number;
      };
    }
  | {
      /**
       * Binance Pay top-up: user has seen the merchant Pay ID + Pay
       * Name screen and is expected to paste the Order ID returned
       * by the Binance Pay app after sending. The verifier looks up
       * `/sapi/v1/pay/transactions`, validates receiver / currency /
       * window, and credits on success.
       *
       * `deposit_id` is created upfront when the user opens the
       * screen so the 30-minute window is anchored to a real
       * `deposits.created_at` row.
       */
      type: 'binance_pay_topup';
      step: 'order_id';
      data: {
        method_id: number;
        method_name: string;
        pay_id: string;
        pay_name: string;
        deposit_id: number;
        /** See `chain_topup.opened_at_ms`. */
        opened_at_ms: number;
        /** Message id of the instruction screen — deleted on success. */
        instruction_message_id?: number;
      };
    }
  | {
      type: 'bybit_pay_topup';
      step: 'tx_id';
      data: {
        method_id: number;
        method_name: string;
        bybit_id: string;
        bybit_name: string | null;
        deposit_id: number;
        opened_at_ms: number;
        instruction_message_id?: number;
      };
    }  | {
      /**
       * LTC quote-on-display top-up — three steps:
       *   `usd_amount`  – user types the USD amount they want.
       *   `tx_hash`     – after we lock the LTC quote, user sends
       *                   that exact LTC amount and pastes the tx
       *                   hash (within the 10-min window).
       */
      type: 'ltc_topup';
      step: 'usd_amount';
      data: {
        method_id: number;
        method_name: string;
        address: string;
        /** Message id of the instruction screen — deleted on success. */
        instruction_message_id?: number;
      };
    }
  | {
      type: 'ltc_topup';
      step: 'tx_hash';
      data: {
        method_id: number;
        method_name: string;
        address: string;
        deposit_id: number;
        usd_amount: number;
        ltc_amount: number;
        ltc_rate: number;
        expires_at_ms: number;
        /** See `chain_topup.opened_at_ms`. */
        opened_at_ms: number;
        /** Message id of the instruction screen — deleted on success. */
        instruction_message_id?: number;
      };
    }
  | {
      type: 'cryptobot_topup';
      step: 'usd_amount';
      data: {
        method_id: number;
        method_name: string;
        min_amount: number;
        instruction_message_id?: number;
      };
    }
  | {
      type: 'cryptobot_topup';
      step: 'awaiting_payment';
      data: {
        method_id: number;
        method_name: string;
        deposit_id: number;
        invoice_id: string;
        amount: number;
        invoice_url: string;
        instruction_message_id?: number;
      };
    }
  | {
      /**
       * Direct-pay (Phase B) — USDT chain variant (BEP20 / TRC20 /
       * TON). Same shape as `chain_topup` but with an OrderIntent.
       */
      type: 'direct_chain';
      step: 'tx_hash';
      data: {
        method_id: number;
        method_name: string;
        provider: 'usdt_trc20' | 'usdt_bep20' | 'usdt_ton';
        address: string;
        intent: import('../types.js').OrderIntent;
        /** See `chain_topup.opened_at_ms`. */
        opened_at_ms: number;
        /** Message id of the instruction screen — deleted on success. */
        instruction_message_id?: number;
      };
    }
  | {
      /**
       * Direct-pay (Phase B) — LTC variant. Unlike top-ups, the USD
       * amount is fixed at the order total, so there is no
       * `usd_amount` step — we lock the quote and create the
       * deposit immediately when the user picks LTC.
       */
      type: 'direct_ltc';
      step: 'tx_hash';
      data: {
        method_id: number;
        method_name: string;
        address: string;
        deposit_id: number;
        usd_amount: number;
        ltc_amount: number;
        ltc_rate: number;
        expires_at_ms: number;
        intent: import('../types.js').OrderIntent;
        /** See `chain_topup.opened_at_ms`. */
        opened_at_ms: number;
        /** Message id of the instruction screen — deleted on success. */
        instruction_message_id?: number;
      };
    }
  | {
      /**
       * Direct-pay (Phase B) — Binance Pay variant. The deposit row
       * is created up front so its `created_at` anchors the 30-min
       * acceptance window in the same way the wallet-topup flow does.
       * The user then pastes their Binance Pay Order ID, which the
       * verifier looks up via /sapi/v1/pay/transactions.
       */
      type: 'direct_binance';
      step: 'order_id';
      data: {
        method_id: number;
        method_name: string;
        pay_id: string;
        pay_name: string;
        deposit_id: number;
        intent: import('../types.js').OrderIntent;
        /** See `chain_topup.opened_at_ms`. */
        opened_at_ms: number;
        /** Message id of the instruction screen — deleted on success. */
        instruction_message_id?: number;
      };
    }
  | {
      type: 'direct_bybit';
      step: 'tx_id';
      data: {
        method_id: number;
        method_name: string;
        bybit_id: string;
        bybit_name: string | null;
        deposit_id: number;
        intent: import('../types.js').OrderIntent;
        opened_at_ms: number;
        instruction_message_id?: number;
      };
    }  | {
      /**
       * User is in a Live Support relay session. While this flow is
       * active, every non-command message they send is forwarded to
       * the admin (and admin's replies come back here).
       *
       * `panelMessageId` is the id of the pinned "Live Support" panel
       * message in the user's General chat — we keep it so the cancel
       * callback can unpin and delete the same message instead of
       * guessing from `ctx`.
       *
       * `userTopicId` / `adminTopicId` are the forum-topic message
       * thread ids on the user's and admin's side respectively, when
       * the bot has forum topics enabled in @BotFather. Cancel/end
       * deletes both topics, which removes every relayed message
       * inside them in one shot.
       */
      type: 'live_support';
      step: 'connected';
      data: {
        startedAt: number;
        panelMessageId?: number;
        userTopicId?: number;
        adminTopicId?: number;
      };
    }
  | {
      /**
       * Post-purchase delivery form for products with
       * `delivery_form_enabled = true`. After Order Delivered, the
       * bot walks the buyer through `fields` one at a time — each
       * message they send fills `fields[cursor]`, and the next
       * prompt is rendered in-place by editing `prompt_message_id`.
       *
       * `edit_mode` is true when the user tapped "Edit Details" on
       * an already-submitted form. On final submit we bump the
       * stored revision and ping the vendor with a "resubmitted as
       * corrected" header.
       */
      type: 'delivery_form';
      step: 'fields';
      data: {
        order_id: number;
        order_public_id: string;
        product_id: number;
        product_name: string;
        fields: import('../types.js').DeliveryFieldSpec[];
        collected: Record<string, string>;
        cursor: number;
        qty: number;
        edit_mode: boolean;
        prompt_chat_id: number;
        prompt_message_id?: number;
      };
    };

export type SessionData = {
  /** Selected qty per product id, used by the shop product page */
  qty: Record<number, number>;
  /**
   * Active marketplace search query (partial match). Set by the
   * 🔍 Search flow, cleared by 🧹 Clear Search / leaving the shop.
   */
  shopSearch?: string;
  /**
   * In-progress digit buffer per product id — populated only while
   * the user has the *Custom Quantity* keypad open. Stored as a
   * string so taps and direct-typed numbers can both append cleanly
   * without arithmetic surprises (e.g. `1` + `1` → `"11"`).
   */
  qtyInput?: Record<number, string>;
  /** Multi-step admin input flow, if any */
  adminFlow?: AdminFlow;
  /** Multi-step user input flow, if any. */
  userFlow?: UserFlow;
  /**
   * Whether we've already silently cleared any leftover persistent
   * reply keyboard for this user (one-time migration from earlier
   * bot versions that used a bottom keyboard).
   */
  kbCleared?: boolean;
  /**
   * Set when the user opened the Top-up screen via the buy-flow
   * payment-method picker (`pay_topup` button). Holds the source
   * product id so the topup screen's Back button can navigate back
   * to that picker (`buy:<id>`) instead of the main menu.
   * Cleared when the user re-opens topup from anywhere else.
   */
  topupOriginBuyProductId?: number;
  /**
   * Set after the user successfully passes the optional force-join
   * screen in this chat session. Prevents already-joined users from
   * being re-prompted if Telegram's member API is briefly flaky.
   */
  forceJoinUnlocked?: boolean;
  /**
   * Which road the buyer entered the shared checkout from. Holds
   * *intent only* (cart vs. a product id); every price, quantity and
   * total is recomputed server-side on each render and before the
   * wallet is charged.
   */
  checkout?:
    | { kind: 'cart' }
    | { kind: 'buy_now'; product_id: number; qty: number };
  /** Coupon code the buyer typed on the checkout screen (uppercased). */
  checkoutCoupon?: string;
};

export type SessionCtx = Context & SessionFlavor<SessionData>;

/**
 * Sessions are persisted in Supabase (`public.bot_sessions`) with an
 * in-process cache in front, so an in-progress multi-step flow survives
 * a redeploy or crash instead of silently disappearing. See
 * `middleware/sessionStorage.ts` — the adapter degrades to memory-only
 * if the database is briefly unavailable.
 *
 * Only transient UI state lives here. Order- and money-critical state is
 * authoritative in `orders`, `deposits`, `carts` and `wallets`.
 */
export const sessionStorage = new SupabaseSessionStorage<SessionData>();

export const sessionMiddleware = session<SessionData, SessionCtx>({
  initial: (): SessionData => ({ qty: {} }),
  storage: sessionStorage,
});
