-- Immutable R2 object identity and one-time artifact challenge for signed local verification.
ALTER TABLE update_artifacts ADD COLUMN object_version TEXT;
ALTER TABLE update_artifacts ADD COLUMN verification_nonce TEXT;
-- Old container proofs do not authorize newly distributed binaries under the new trust model.
UPDATE update_artifacts SET status='rejected',error='legacy_verification_retired_reupload' WHERE status IN ('verified','verifying');
