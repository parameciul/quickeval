# Payments (Stripe)

The base for paid features. Nothing is on sale yet: `PAID_FEATURES` in `shared/payments.ts` is empty, and without the Stripe keys every payment call answers 503 `payments_off` ("Plățile nu sunt încă active.").

## How it works

1. A page shows `PayButton` (`src/ui/PayButton.tsx`). It calls `startCheckout`: `useApi().startCheckout({ feature, returnPath, testCode? })` in the teacher app, `UploadApi.startCheckout(token, secret, { feature, returnPath })` in the student app.
2. The API (`server/routes/payments.ts`, `startCheckout`) reads the price from the catalog, writes a `pending` row in `payments`, and asks Stripe for a Checkout page. The browser goes there.
3. Stripe sends the user back to `returnPath` with `?plata=reusita` or `?plata=anulata`. `PaymentReturnNotice` shows a line for it. Coming back proves nothing.
4. Stripe calls `POST /api/payments/webhook`. The API checks the signature on the exact body, then marks the row `paid` once, only for the amount and currency of the row (`markPaid` in `server/db/payments.ts`).
5. A route of a paid feature calls `requirePaid(env, payer, feature, test?)`. It answers 402 `payment_required` until the row is `paid`.

## Payers

- Teacher: `/api/admin/payments` (`GET` the list, `POST /checkout`). The payer is the logged-in teacher.
- Student: `/api/u/<token>/payments` (`GET`, `POST /checkout`), with the phone's `X-Upload-Session`. The payer is the student of that upload, stored by `student_id` (uploads go away on a reset). A student feature with scope `test` is bought for the test of the link.
- A feature with scope `test` stores the test's id and `created_at`: ids of deleted tests come back.

## Add a paid feature

1. Add it to `PAID_FEATURES`: a key (`a-z`, `0-9`, `_`), the Romanian name, the amount in bani (at least 200 for RON), the currency, the payer and the scope.
2. Put `requirePaid` in the routes the feature opens. Show `PayButton` where the user meets the feature, and `PaymentReturnNotice` on the return page.
3. Write tests: `server/routes/payments.test.ts` shows how to pass a catalog and a fake Stripe call (`startTestApi({ env, app: { paidFeatures, createCheckoutSession } })`) and how to sign a webhook (`stripeSignatureHeader`).

## Connect the Stripe account

1. Run migration 0015 on the live database before the code reaches `main`: `npx wrangler d1 migrations apply quickeval --remote`.
2. Stripe dashboard, Developers, API keys: copy the secret key (`sk_test_…` first, `sk_live_…` later). `npx wrangler pages secret put STRIPE_SECRET_KEY --project-name quickeval`.
3. Stripe dashboard, Developers, Webhooks, Add endpoint: `https://quickeval.pages.dev/api/payments/webhook`, with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Copy its signing secret (`whsec_…`). `npx wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name quickeval`.
4. The secrets apply from the next deployment.
5. Local test: put both keys (test mode) in `.dev.vars`, and forward the webhook with the Stripe CLI: `stripe listen --forward-to http://127.0.0.1:8788/api/payments/webhook` (it prints the `whsec_…` to use locally).

The path `/api/payments` must stay outside Cloudflare Access: Stripe has no login.
