# Official APK release operations

## Environments and prerequisites

The production API remains in the existing `llm-chat-app-template` Worker. `src/app-updates-entry.ts` is a separate, minimal entry used by `wrangler.updates-staging.jsonc`; it does not deploy unrelated chat changes. Staging package identity is `com.flzxing.lucky.updateqa`. Production defaults to `com.flzxing.lucky`.

Cloudflare Containers requires Workers Paid. On 2026-10-11 this account returned HTTP 401 with the explicit error “Deploying containers requires the Workers Paid plan.” Docker/Colima/buildx and the real verification image work locally. The staging API, D1, R2 and producer queue were deployed; automatic cloud queue/container execution remains unverified until the plan is enabled. Do not mark a locally consumed job as a cloud queue test.

Production resources configured in `wrangler.jsonc` / `release-verifier/wrangler.jsonc`:

- R2 `lucky-app-releases`, independent from theme storage. Keep public bucket access disabled; APK distribution must pass the Worker publication/revocation check.
- Queue `lucky-apk-verification`; DLQ `lucky-apk-verification-failed`.
- Verifier Worker `lucky-apk-verifier`, two basic container instances maximum, one job per batch, three queue retries, concurrency two.
- Service binding `RELEASE_API` → `llm-chat-app-template`.
- D1 migrations `0004_app_updates.sql`, `0005_app_update_verification_progress.sql`. Apply all normal project migrations in order.

```bash
npx wrangler r2 bucket create lucky-app-releases
npx wrangler queues create lucky-apk-verification
npx wrangler queues create lucky-apk-verification-failed
npx wrangler d1 migrations apply kmp-ai-db --remote
npm --prefix ops ci
npm --prefix ops run build
npx wrangler deploy
cd release-verifier
npm ci
npx wrangler deploy
```

Production deployment must use a clean checkout of the committed update feature. Keep unrelated pending work out of both the commit and deployment; run the isolated upgrade checks and verify the live endpoints after deployment. The initial implementation QA used staging only.

## Keys and authorization

Use secret bindings; never put secrets in wrangler config, Git, a PR, terminal output, or the browser's persistent storage.

| API Worker secret | Value |
| --- | --- |
| `UPDATE_POLICY_PRIVATE_KEY` | PKCS#8 PEM P-256 private key, separate from APK signing |
| `UPDATE_POLICY_KEY_ID` | Public key identifier, e.g. `official-v1` |
| `UPDATE_RELEASE_CERT_SHA256` | Pre-registered lowercase SHA-256 of the official APK signing certificate |
| `UPDATE_VERIFICATION_SECRET` | Random HMAC secret shared only with verifier Worker |
| `UPDATE_EDITORS_JSON` | JSON map of attributable editor name to random editing credential |
| `UPDATE_PUBLISHERS_JSON` | Separate JSON map of attributable publisher name to random publication credential |

Verifier Worker needs only `UPDATE_VERIFICATION_SECRET`. It receives no APK signing private key. Configure API secret bulk from a mode-0600 external JSON file using `wrangler secret bulk /safe/path/secrets.json`; use `--config wrangler.updates-staging.jsonc` for staging. Verifier secrets must be provisioned with its own config. Legacy theme/admin credentials retain editing only; publication always needs an additional named publisher credential and a reason.

Client pins the policy public key at build time. Key rotation requires distributing a trusted client key before the server switches signing key IDs. Installed signer identity is checked against both the downloaded descriptor and the actually installed app. Certificate rotation is not automatically trusted in v1; plan it explicitly before changing APK keys.

## API contract

- `POST /v1/app-updates/check`: protocolVersion, packageName, versionCode, sdkInt, abi, locale, channel=official, installId; optional artifactId reauthorizes an existing download/install. Returns base64url payload + raw P-256 signature + keyId, no-store.
- `POST /v1/app-updates/events`: installId plus up to 20 idempotent event IDs; anonymous upgrade diagnostics, 30-day retention.
- `GET/HEAD /assets/app-releases/{artifactId}.apk`: verified + published/paused only; stream R2, ETag, length, byte Range/If-Range, no-store so withdrawal cannot be bypassed by stale CDN objects.
- `GET/HEAD /download/luckytool.apk`: redirects to the highest verified 100%-published release; 404 before an official baseline exists.
- `GET /v1/admin/app-updates/session`: check editing credential without publishing permission.
- `POST /v1/admin/app-updates/uploads`: fileName, bytes (1GiB max). Returns upload ID and 16MiB part size.
- `GET /uploads/{id}`, `PUT /uploads/{id}/parts/{n}` (Content-Length, x-part-sha256), `POST /uploads/{id}/complete`, `DELETE /uploads/{id}`, `POST /uploads/{id}/retry` under the admin prefix.
- `GET/POST /v1/admin/app-updates/releases`; `PUT /releases/{id}` (revision CAS); `POST /releases/{id}/publish|pause|revoke`; `GET /releases/{id}/preview`.
- `POST /v1/admin/app-updates/art`: WebP ≤400KiB; returns a same-origin immutable image URL.
- `GET /v1/admin/app-updates/stats|audit`: device funnel, errors and revision history.
- `POST /v1/internal/app-updates/verification`: HMAC over `timestamp.rawBody`; timestamp skew ≤5min. Progress stages are monotonic; final report is idempotent. A forged/expired callback is rejected.

Upload completes only when all server-verified part hashes and lengths match. Browser re-selection verifies every already-uploaded part before resuming; name/size alone are insufficient. Upload bytes flow to R2 through a fixed-length stream, not a whole-APK buffer. Browser concurrency is capped at three. Unfinished uploads expire after 24h. Verification jobs are dispatched at most four times at 15min intervals; queue retries/DLQ are separate. Inspect both before manually retrying.

## Real validation

The image pins Android command-line tools 11076708 and build-tools 36.0.0. A non-root Python HTTP service streams to temporary disk, computes SHA-256, runs `apksigner verify --verbose --print-certs`, parses aapt2 manifest identity and verifies ZIP native ABI consistency. Progress is emitted only after each actual stage finishes. API final acceptance also checks the pre-registered certificate, package name, size, SDK, ABI and non-debuggable flag. A rejected artifact cannot be drafted, published or downloaded.

Validation errors: invalid_apk_signature, single_signer_required, invalid_android_manifest, missing_manifest_identity, abi_manifest_mismatch, truncated_apk, apk_identity_rejected, verification_timeout. Do not solve these by manually editing parsed identity or weakening the certificate configuration.

## Publishing and incidents

Use `/ops/releases` and preserve the review sequence. Chinese Simplified and English title, summary and notes are mandatory, with up to three highlights. Readonly package identity comes from validation. Save drafts before leaving; previews are isolated and cannot install files. Normal updates may be ignored; forced minimum versions require a compatible API26+ arm64 target and a separate confirmation. Forced clients bypass normal rollout percentage.

Every published edit increments revision with a compare-and-swap guard and atomic audit. Concurrent stale edits fail with revision_conflict. Publication order is protected against concurrently publishing an older release. Scheduled releases are evaluated every five minutes and on update checks; a scheduled release overtaken by a newer published version is paused rather than newly exposed as a downgrade.

Pause stops new offers, retaining authorization for already acquired artifacts. Revoke stops offers, binary downloads and subsequent installation authorization. OS requests already committed cannot reliably be recalled. Never reuse a versionCode or overwrite a published APK; ship a higher-code repair build. Start at 1%, inspect actual installed-version confirmations and error groups, then 5% → 25% → 100%. The stable download address changes only at 100%.

Metrics are observations reported by anonymous clients, not an authenticated billing ledger. “Installed” is reported only after PackageInfo confirms the new running version; launching the installer is a different event. Percentages use the prior funnel stage as denominator; inspect time windows and delayed reports before interpreting conversion.

## Tests and QA

```bash
npx vitest run --config vitest.updates.config.ts
npx tsc --noEmit
npx wrangler deploy --dry-run
npm --prefix ops test
npm --prefix ops run build
npm --prefix ops run test:e2e
npm --prefix release-verifier run check
python3 -m unittest discover -s release-verifier/test
```

The isolated update Vitest config uses local D1/R2 and avoids unrelated AI/Vectorize remote preview setup. The full existing suite's 60 assertions also passed, but its remote-preview teardown reports an account error.

`scripts/app-update-qa.py` uploads a real `.updateqa` APK in three concurrent 16MiB parts, waits for validation, then publishes only to an explicitly staging origin. Its optional `--local-container http://127.0.0.1:18080` mode uses the real SDK verifier and authenticated callback; it records that cloud queue delivery was NOT verified. Do not use this mode for a production release. Evidence is written to an explicit output path and contains no credentials.

Android signing/build/installation details and final test evidence are in the Android repository's `docs/releases/` directory. Missing physical OEM devices and unperformed offline key backup must remain explicitly unverified.
