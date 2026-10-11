-- Additive metadata; v1 deliberately accepts only complete APK artifacts.
ALTER TABLE update_artifacts ADD COLUMN artifact_type TEXT NOT NULL DEFAULT 'full_apk' CHECK(artifact_type = 'full_apk');
ALTER TABLE update_artifacts ADD COLUMN base_version_code INTEGER;
ALTER TABLE update_artifacts ADD COLUMN verification_stage TEXT;
