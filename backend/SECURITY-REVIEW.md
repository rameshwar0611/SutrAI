# Focused backend security remediation

Branch: `fix/backend-security-hardening`. Base: fetched `origin/main` at `4e21d50733b21aca4adaf71b620a20d73428c12a`. This branch contains no Contour frontend changes and does not alter infrastructure, Dockerfiles, deployment workflows, environment files or production secrets.

## Targeted changes

| Defect | Implementation |
| --- | --- |
| Public internal plan/credit operations; trusted browser identity headers | `gateway/utils/authProxy.js` allowlists public login/logout, strips caller identity headers; `shared/security/internal.js` verifies server-only per-caller credentials and route capabilities. Gateway overwrites identity from the validated Redis session. |
| Missing conversation/message ownership | `services/chat/controllers/chat.handlers.js` scopes queries to the authenticated account. Only agent service credentials can write messages. `services/agent/controllers/agent.handler.js` checks ownership before reserving credits or invoking the graph. |
| Replayable payment verification | `services/billing/controllers/billing.handlers.js` checks signature, account ownership, recorded quote, provider payment/order IDs, currency, amount, captured status and paid order totals. Payment order IDs are unique. |
| Credit grants spanning two services | `services/auth/controllers/auth.handlers.js` writes the grant receipt and both balances in one atomic user-document update. A billing retry reuses the order receipt. Lost acknowledgement/final billing-save failures cannot apply that grant again. |
| Non-atomic/post-generation credit deduction | Auth atomically reserves available credits before the graph runs. Conditional settlement/refund applies once. Agents propagate failures instead of swallowing failed deductions or returning provider errors as successful answers. |
| Stale balances across sessions | Redis holds session identity; gateway `/api/me` reads the authoritative Mongo account through the authenticated auth service. All active sessions observe the same current balance. Internal grant/reservation ledgers are excluded from public account responses. |
| Upload collisions, incorrect error variable and proxy buffering | UUID filenames, compatible PDF/image MIME filtering, 20 MB file limit and sanitized error responses. Gateway streams multipart unchanged instead of buffering it under the proxy default limit. A central `finally` removes temporary files on success and failure. |

## Compatibility and credit policy

Existing frontend routes and success payloads are retained: Google login/logout, `/api/me`, conversation APIs, multipart agent requests (`prompt`, `conversationId`, `agent`, optional `file`), `{answer, images, artifacts}`, and billing `{order, plan}` / `{message: "Payment Verified"}`. The seven public mode identifiers are unchanged. PDF/image interpretation remains in Auto; explicit PDF/PPT/Vision modes generate content. Auth failures now use HTTP 401; both main's Guest Mode and Contour support it.

Intentional internal changes: plan mutation is billing-only, credit operations are agent-only, message creation is agent-only, and account/history reads require approved service callers. Internal callers supply authenticated identity in server headers; body account IDs/credit amounts are not accepted by credit mutation handlers. Credit allocation and prices come from `shared/billing/plans.js`, not a client quote. These endpoints are not frontend APIs.

Credit costs preserve the existing completed-workflow totals: Chat 1, Search 6 (Search 5 plus Chat 1), Coding/PDF/PPT/Vision/upload analysis 10. Auto **reserves 10** before its routing LLM and returns unused credits after a successful cheaper route. Therefore Auto needs ten available credits even if it ultimately selects Chat; explicit Chat works with one. This conservative reservation is needed to guarantee funds before an unknown workflow starts. No UI/API change is required, but a future low-balance hint could explain the Auto minimum. Known pre-generation/provider failures settle with zero charge; unsuccessful settlement remains pending review. Neither expiry nor recurring billing is introduced.

## Required service configuration — not provisioned by this change

Supply independent cryptographically random credentials (at least 32 bytes) through the existing private runtime-secret mechanism. Do not put them in source, browser variables, URLs or logs. `SERVICE_AUTH_TOKEN` is a caller's outgoing credential; `SERVICE_AUTH_KEYS` is a target's JSON map of accepted caller names to their corresponding credentials. No real values are included here.

| Service | Outgoing token | Verifier map keys |
| --- | --- | --- |
| Gateway | gateway credential | none |
| Auth | none | `gateway`, `agent`, `billing` |
| Chat | none | `gateway`, `agent` |
| Agent | agent credential | `gateway` |
| Billing | billing credential | `gateway` |

A target should receive only the verifier credentials it needs. Missing, malformed, short or incorrect credentials fail closed. This is a small service-credential boundary, not a full zero-trust/service-mesh system. It requires HTTPS or an appropriately protected private network; bearer credentials must not cross an untrusted plaintext connection. Responses are not followed across redirects. Coordinate backend rollout: mixing old unsigned callers with new guarded services will fail closed. Existing Node startup environment loading requirements still apply (`node --env-file=.env index.js` or injected process variables).

No AWS secrets or deployment configuration were changed. Provisioning and controlled rollout require separate approval.

## Payment/reservation recovery and existing data

New orders carry `creditGrantVersion: 1`; provider capture and authenticated ownership are required before granting. A crash/timeout after the auth grant leaves billing `verified`; repeating verification with the **same** provider-authenticated order/payment callback is safe because the auth receipt deduplicates it. Only after the grant acknowledgement and final payment save does billing return `Payment Verified`. Provider-accepted authorization alone does not grant credits. Settle/capture lag should be retried for the same order, never by automatically charging again.

Legacy payment records have no grant receipt proving whether their old update applied. Verification returns a review-required error for these records; it never replays a historical grant automatically. Before rollout, an authorized operator must inspect existing duplicate order IDs, confirm the unique index, and reconcile historical/in-flight payments with provider records and existing balances. No data scan, backfill, migration or live reconciliation was performed. Do not add a grant receipt and re-run an old payment without establishing its historical credit effect.

An agent crash or an ambiguous reserve/settlement RPC can leave an embedded `creditReservations` entry in `reserved` state. Available credits conservatively exclude that reservation. Review the request against durable messages/provider outcome, then settle that **same request ID** once with the appropriate workflow cost or zero for confirmed failure. Never refund based solely on age: generation might have completed. No scheduled refund job, public reconciliation endpoint, recovery UI or webhook was invented. Pending-case recovery is operational work requiring separate approval; this change does not implement backend-wide distributed transactions.

Grant/reservation receipts are embedded in the atomic user document for a modest demo workload. Keep them durable: deleting receipts would weaken deduplication. Monitor document growth; a separate ledger/migration strategy is future work before sustained high-volume use. Payment and user state do not form a cross-service transaction, so the intermediate `verified` state and manual handling of legacy/pending cases remain relevant. No general exactly-once guarantee is claimed for AI generation or chat persistence.

## Regression validation

Use Node 24.19.0/npm 11.9.0 and the existing per-service dependencies. Tests use real **disposable loopback MongoDB**, real Express/proxy/Multer routes, synthetic accounts/files, mocked Firebase and mocked Razorpay captured-payment/order fixtures. They do not call Firebase, Razorpay, LLMs, S3, Redis production, or any deployed application. Module mocks require Node's `--experimental-test-module-mocks` flag (included in `npm test`).

Start an isolated Mongo instance (no production data or mounted volumes):

```bash
docker run --rm -d --name sutrai-security-tests-mongo \
  -p 127.0.0.1:27028:27017 --tmpfs /data/db --tmpfs /data/configdb \
  mongo@sha256:b9924c330a8bbc5800fe9c69f04a84e221eca7b28fd049a0354147d9908fa142 \
  mongod --bind_ip_all --quiet --setParameter diagnosticDataCollectionEnabled=false

SECURITY_TEST_MONGODB_URI=mongodb://127.0.0.1:27028/sutrai_security_test_hardening npm test --prefix backend
npm run lint --prefix backend
docker stop sutrai-security-tests-mongo
```

The test helper refuses a non-loopback URI, credentials, options, or a database outside the `sutrai_security_test_` namespace. Every test database is uniquely named and dropped afterwards. Never supply the application's `MONGODB_URI`. Backend lint reuses the existing frontend ESLint development tools after normal frontend dependency installation; no new runtime dependency was introduced.

Tests cover unauthenticated/internal-role misuse, forged browser identity, cross-account reads/updates/writes and agent denial, verified Google/session lifecycle, two active sessions, concurrent insufficient-credit races, reservation/refund replay, parallel payment callbacks, lost grant acknowledgement, failed final billing writes, mismatched provider entities/amounts/currency/status, legacy payment rejection, unique order IDs, MIME/size rejection, filename uniqueness and multipart proxy streaming above 1 MB. Existing frontend unit tests/build are also checked from this branch's unmodified main frontend; this branch intentionally does not contain PR #6's expanded suite.

The real LangGraph is also exercised across all seven modes and both Auto upload branches, with isolated model/search/storage/PDF-parser doubles; provider failures propagate out of the graph. No simulated responses are added to production components.

Validated 31 October 2026:

| Check | Result |
| --- | --- |
| Backend security regressions | **35 passed**, zero skipped/failed, including real MongoDB concurrency and HTTP route tests |
| Full backend ESLint | Passed |
| Backend JavaScript syntax | Passed for all 71 backend `.js` files; backend has no separate transpilation/build script |
| Unmodified main frontend unit tests | **21 passed** |
| Unmodified main frontend production build | Passed; existing large-chunk warning |
| Unmodified main frontend ESLint | Existing **7 errors and 1 warning**; no frontend files changed. Contour PR #6 remains separate and addresses its own lint baseline. |

The test runner emits the expected Node experimental-module-mocking warning. Passing test counts are not code-coverage percentages or proof of deployed-service behavior. Raw local logs and the exact changed-file list are retained under ignored `tmp/backend-security-validation/` for review; original private metrics are untouched.

Razorpay fixtures represent test-mode semantics; **no actual Razorpay test-mode transaction or provider API call was executed**. A controlled live test-mode integration is still required. No real payment, production/user-data access, infrastructure change, commit, push, merge or deployment is authorized by this report.

## Controlled demo release gates

Conditional GO for a small controlled test-account demo only after: credentials are privately provisioned and all services deployed together; existing data/index/legacy-payment review is complete (or an independently authorized clean test database is used); and real Google/session-cookie, provider/upload/download and Razorpay **test-mode** capture/replay/recovery acceptance passes. Keep the deployment workflow disabled until a separate deployment approval.

Current recommendation: **not approved for unrestricted public/real-money deployment**. Pending reservation/legacy payment reconciliation, credential transport/rotation, database availability/durability, real provider behavior, cross-site browser-cookie policy and document growth require explicit operational acceptance. These limits do not justify unrelated enterprise features in this remediation.
