import test from "node:test";
import assert from "node:assert/strict";
import { contentComplete, fieldsForContent, funnelFor, hashBlob, makeContent, PART_BYTES, uploadApk, validateApkFile } from "./releaseOps.js";
const fields = { "zh-CN": { titles: "更进一步", summaries: "更可靠", highlights: "稳定\n流畅", notes: "详细日志" }, "en-US": { titles: "Better", summaries: "Reliable", highlights: "Stable\nSmooth", notes: "Release notes" } };
test("required locales and three-highlight limit survive editor roundtrip", () => {
 const content = makeContent(fields); assert.ok(contentComplete(content)); assert.deepEqual(fieldsForContent(content), fields);
 assert.equal(contentComplete({ ...content, notes: { "zh-CN": "日志" } }), false);
 assert.equal(contentComplete(makeContent({ ...fields, "en-US": { ...fields["en-US"], highlights: "a\nb\nc\nd" } })), false);
});
test("funnel uses distinct devices and the preceding stage denominator", () => {
 const points = funnelFor([{ release_id: "r", kind: "offered", devices: 20, count: 100 }, { release_id: "r", kind: "download_started", devices: 5 }], "r");
 assert.equal(points[0].count, 20); assert.equal(points[1].rate, 25); assert.equal(points[1].denominator, 20); assert.equal(points[4].rate, null);
});
test("APK validation rejects wrong formats and oversized files", () => {
 assert.throws(() => validateApkFile({ name: "file.zip", size: 5 })); assert.throws(() => validateApkFile({ name: "file.apk", size: 1024 ** 3 + 1 }));
});
test("uploader verifies resumed part hashes and submits exactly missing parts", async () => {
 const file = new File([new Uint8Array(PART_BYTES + 3)], "app.apk");
 const hash = await hashBlob(file.slice(0, PART_BYTES)), sent = [], calls = [];
 await uploadApk({ token: "editor", file, resumeId: "upload-id", signal: new AbortController().signal, onSession() {}, onProgress() {},
  api: async (_, path, options) => { calls.push([path, options]); return path.endsWith("complete") ? { ok: true } : { id: "upload-id", size: file.size, status: "uploading", parts: [{ part_number: 1, sha256: hash, size: PART_BYTES }] }; },
  sendPart: async (_, id, number, blob) => { sent.push([id, number, blob.size]); },
 });
 assert.deepEqual(sent, [["upload-id", 2, 3]]); assert.ok(calls.at(-1)[0].endsWith("complete"));
});
test("same name and size never suffice for resuming another APK", async () => {
 let sends = 0;
 await assert.rejects(uploadApk({ token: "editor", file: new File(["changed"], "app.apk"), resumeId: "upload-id", signal: new AbortController().signal, onSession() {}, onProgress() {},
  api: async () => ({ id: "upload-id", size: 7, status: "uploading", parts: [{ part_number: 1, sha256: "a".repeat(64), size: 7 }] }), sendPart: async () => { sends++; },
 }), { code: "file_mismatch" }); assert.equal(sends, 0);
});
test("at most three parts transfer concurrently and a failed part retries", async () => {
 let active = 0, peak = 0, attempts = 0;
 await uploadApk({ token: "editor", file: new File([new Uint8Array(PART_BYTES * 3 + 2)], "app.apk"), signal: new AbortController().signal, onSession() {}, onProgress() {},
  api: async () => ({ id: "upload-id" }), sendPart: async (_, id, n) => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; if (n === 1 && attempts++ === 0) throw new Error("network"); },
 }); assert.ok(peak <= 3); assert.equal(attempts, 2);
});
