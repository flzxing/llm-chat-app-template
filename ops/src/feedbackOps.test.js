import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogToDraft,
  emptyReason,
  filterReports,
  formatCsat,
  missingReasonLocales,
  moveReason,
  validateReasonDraft,
} from "./feedbackOps.js";

test("catalog draft keeps other reason and fills locale holes", () => {
  const draft = catalogToDraft({
    fallbackLocale: "en-US",
    reasons: [{ id: "other", kind: "other", labels: { "zh-CN": "其他" } }],
  });
  assert.equal(draft.reasons[0].labels["en-US"], "");
  assert.deepEqual(missingReasonLocales(draft.reasons[0]), [
    "zh-TW",
    "en-GB",
    "ja",
    "ko",
    "de",
    "es",
    "fr",
  ]);
});

test("reason draft requires exactly one other id", () => {
  const other = { ...emptyReason("other"), kind: "other", labels: { "en-US": "Other" } };
  const preset = { ...emptyReason("off_topic"), labels: { "en-US": "Off topic" } };
  assert.equal(validateReasonDraft([other, preset]), "");
  assert.match(validateReasonDraft([preset]), /其他/);
  assert.match(validateReasonDraft([other, { ...other, id: "other_2" }]), /其他/);
});

test("moveReason rewrites sort order", () => {
  const moved = moveReason(
    [
      { id: "a", sort: 10 },
      { id: "b", sort: 20 },
      { id: "c", sort: 30 },
    ],
    "c",
    -1,
  );
  assert.deepEqual(
    moved.map((item) => item.id),
    ["a", "c", "b"],
  );
  assert.deepEqual(
    moved.map((item) => item.sort),
    [10, 20, 30],
  );
});

test("inbox filter is conjunctive", () => {
  const rows = [
    { id: "1", kind: "down", status: "new", reasonIds: ["off_topic"], comment: "loop" },
    { id: "2", kind: "up", status: "new", reasonIds: [], comment: "" },
    { id: "3", kind: "down", status: "triaged", reasonIds: ["tool_failed"], comment: "chip" },
  ];
  assert.deepEqual(
    filterReports(rows, { kind: "down", status: "new", query: "loop" }).map((row) => row.id),
    ["1"],
  );
  assert.equal(formatCsat(96.66), "96.7%");
  assert.equal(formatCsat(null), "—");
});
