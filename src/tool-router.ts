import {
	DEFAULT_TOOL_EMBED_MODEL,
	DEFAULT_TOOL_RETRIEVAL_COUNT,
} from "./constants";
import { DEFAULT_LLM_TOOLS, type ChatToolDefinition } from "./tools";
import type { ChatMessage, Env } from "./types";

type EmbeddingResponse = {
	shape: number[];
	data: number[][];
};

type ToolRoutingDebugInfo = {
	usedFallback: boolean;
	retrievedToolNames: string[];
	topScore: number | null;
	embeddingMs: number;
	queryMs: number;
	selectedCount: number;
};

type ToolIndexInitResult = {
	mutationId: string;
	toolCount: number;
	toolsHash: string;
};

type ToolIndexStatus = {
	expectedToolCount: number;
	expectedToolsHash: string;
	vectorCount: number;
	dimensions: number;
	metric: string | null;
	ready: boolean;
};

const TOOL_NAMESPACE = "prod";
const DEFAULT_TOP_K = 20;
const DEFAULT_SCORE_THRESHOLD = 0.45;
let lastSyncedToolsHash: string | null = null;

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseThreshold(value: string | undefined, fallback: number): number {
	const parsed = Number.parseFloat(value ?? "");
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(-1, Math.min(1, parsed));
}

function latestUserMessage(messages: ChatMessage[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i]?.role === "user" && messages[i].content.trim()) {
			return messages[i].content.trim();
		}
	}
	return "";
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
}

async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function buildToolEmbeddingText(tool: ChatToolDefinition): string {
	const def = tool.function;
	const props = Object.entries(def.parameters.properties ?? {})
		.map(([name, schema]) => `${name}: ${stableStringify(schema)}`)
		.join("\n");
	return [
		`tool_name: ${def.name}`,
		`description: ${def.description}`,
		"parameters:",
		props,
		`required: ${JSON.stringify(def.parameters.required ?? [])}`,
	].join("\n");
}

async function embedText(env: Env, text: string): Promise<number[]> {
	const model = env.TOOL_EMBED_MODEL || DEFAULT_TOOL_EMBED_MODEL;
	const result = (await env.AI.run(model as keyof AiModels, {
		text: [text],
	})) as EmbeddingResponse;
	return result.data[0];
}

async function syncToolsToVectorize(
	env: Env,
	options?: { force?: boolean },
): Promise<ToolIndexInitResult | null> {
	if (!options?.force && env.TOOL_VECTORIZE_AUTO_SYNC === "false") return null;
	const raw = stableStringify(DEFAULT_LLM_TOOLS);
	const hash = await sha256Hex(raw);
	if (hash === lastSyncedToolsHash) return null;

	const vectors: VectorizeVector[] = [];
	for (const tool of DEFAULT_LLM_TOOLS) {
		const embeddingText = buildToolEmbeddingText(tool);
		const vector = await embedText(env, embeddingText);
		const schemaHash = await sha256Hex(stableStringify(tool.function.parameters));
		vectors.push({
			id: `tool:${tool.function.name}:v${schemaHash.slice(0, 12)}`,
			namespace: TOOL_NAMESPACE,
			values: vector,
			metadata: {
				tool_name: tool.function.name,
				tool_group: "general",
				enabled: true,
				risk_level: "low",
				version: "1",
				schema_hash: schemaHash,
				tool_json: JSON.stringify(tool),
			},
		});
	}

	const upserted = await env.TOOL_INDEX.upsert(vectors);
	lastSyncedToolsHash = hash;
	console.log("tool-router.vectorize.sync", {
		mutationId: upserted.mutationId,
		toolCount: vectors.length,
	});
	return {
		mutationId: upserted.mutationId,
		toolCount: vectors.length,
		toolsHash: hash,
	};
}

export async function initializeToolIndex(env: Env): Promise<ToolIndexInitResult> {
	const result = await syncToolsToVectorize(env, { force: true });
	if (result) return result;
	const hash = await sha256Hex(stableStringify(DEFAULT_LLM_TOOLS));
	return {
		mutationId: "no-op",
		toolCount: DEFAULT_LLM_TOOLS.length,
		toolsHash: hash,
	};
}

export async function getToolIndexStatus(env: Env): Promise<ToolIndexStatus> {
	const expectedToolCount = DEFAULT_LLM_TOOLS.length;
	const expectedToolsHash = await sha256Hex(stableStringify(DEFAULT_LLM_TOOLS));
	const details = await env.TOOL_INDEX.describe();
	const detailRecord = details as unknown as Record<string, unknown>;
	const metric =
		typeof detailRecord.metric === "string"
			? detailRecord.metric
			: typeof detailRecord.distance === "string"
				? detailRecord.distance
				: null;
	return {
		expectedToolCount,
		expectedToolsHash,
		vectorCount: details.vectorCount,
		dimensions: details.dimensions,
		metric,
		ready: details.vectorCount >= expectedToolCount,
	};
}

export async function resolveToolsForQuery(
	env: Env,
	messages: ChatMessage[],
): Promise<{ tools: ChatToolDefinition[]; debug: ToolRoutingDebugInfo }> {
	const userQuery = latestUserMessage(messages);
	if (!userQuery) {
		return {
			tools: DEFAULT_LLM_TOOLS.slice(0, DEFAULT_TOOL_RETRIEVAL_COUNT),
			debug: {
				usedFallback: true,
				retrievedToolNames: DEFAULT_LLM_TOOLS.slice(0, DEFAULT_TOOL_RETRIEVAL_COUNT).map(
					(t) => t.function.name,
				),
				topScore: null,
				embeddingMs: 0,
				queryMs: 0,
				selectedCount: DEFAULT_TOOL_RETRIEVAL_COUNT,
			},
		};
	}

	if (env.TOOL_VECTORIZE_AUTO_SYNC === "true") {
		await syncToolsToVectorize(env);
	}

	const topN = parsePositiveInt(
		env.TOOL_RETRIEVAL_TOP_N,
		DEFAULT_TOOL_RETRIEVAL_COUNT,
	);
	const topK = Math.min(
		100,
		parsePositiveInt(env.TOOL_RETRIEVAL_TOP_K, DEFAULT_TOP_K),
	);
	const scoreThreshold = parseThreshold(
		env.TOOL_RETRIEVAL_SCORE_THRESHOLD,
		DEFAULT_SCORE_THRESHOLD,
	);

	const embedStart = Date.now();
	const queryVector = await embedText(env, userQuery);
	const embeddingMs = Date.now() - embedStart;

	const queryStart = Date.now();
	const matches = await env.TOOL_INDEX.query(queryVector, {
		topK,
		namespace: TOOL_NAMESPACE,
		returnMetadata: "all",
		filter: { enabled: true },
	});
	const queryMs = Date.now() - queryStart;

	const selected: ChatToolDefinition[] = [];
	const selectedNames: string[] = [];
	for (const match of matches.matches ?? []) {
		if ((match.score ?? -Infinity) < scoreThreshold) continue;
		const raw = (match.metadata as Record<string, unknown> | undefined)?.tool_json;
		if (typeof raw !== "string") continue;
		try {
			const parsed = JSON.parse(raw) as ChatToolDefinition;
			selected.push(parsed);
			selectedNames.push(parsed.function.name);
			if (selected.length >= topN) break;
		} catch {}
	}

	const tools =
		selected.length > 0 ? selected : DEFAULT_LLM_TOOLS.slice(0, Math.max(1, topN));
	return {
		tools,
		debug: {
			usedFallback: selected.length === 0,
			retrievedToolNames:
				selected.length > 0
					? selectedNames
					: DEFAULT_LLM_TOOLS.slice(0, Math.max(1, topN)).map(
							(t) => t.function.name,
						),
			topScore: matches.matches?.[0]?.score ?? null,
			embeddingMs,
			queryMs,
			selectedCount: tools.length,
		},
	};
}
