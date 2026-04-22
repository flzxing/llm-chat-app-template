export type ChatToolDefinition = {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: {
			type: "object";
			properties: Record<string, unknown>;
			required?: string[];
			additionalProperties?: boolean;
		};
	};
};

export const DEFAULT_LLM_TOOLS: ChatToolDefinition[] = [
	{
		type: "function",
		function: {
			name: "add_todo",
			description:
				"Create a todo item for the user. Use this when user asks to add or remind a task.",
			parameters: {
				type: "object",
				properties: {
					title: {
						type: "string",
						description: "Short todo title, usually 3-40 chars.",
						minLength: 1,
						maxLength: 120,
					},
					due_time_iso: {
						type: "string",
						description:
							"Due date-time in ISO 8601 format with timezone, for example 2026-04-20T14:30:00+08:00.",
					},
					priority: {
						type: "string",
						enum: ["low", "medium", "high"],
						description: "Task priority.",
					},
					note: {
						type: "string",
						description: "Optional additional details.",
						maxLength: 500,
					},
				},
				required: ["title", "due_time_iso"],
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "open_app",
			description:
				"Open an app on user's device by app name or package identifier.",
			parameters: {
				type: "object",
				properties: {
					app_name: {
						type: "string",
						description: "Human-readable app name, for example WeChat.",
						minLength: 1,
						maxLength: 80,
					},
					package_name: {
						type: "string",
						description:
							"Platform package/bundle id, for example com.tencent.xin or com.apple.Maps.",
						minLength: 1,
						maxLength: 120,
					},
					platform: {
						type: "string",
						enum: ["android", "ios", "macos", "windows", "unknown"],
						description: "Target operating platform.",
					},
				},
				required: ["app_name", "package_name"],
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "record_expense",
			description:
				"Record an expense or income transaction to personal ledger.",
			parameters: {
				type: "object",
				properties: {
					transaction_type: {
						type: "string",
						enum: ["expense", "income", "transfer"],
						description: "Accounting transaction type.",
					},
					amount: {
						type: "number",
						description: "Transaction amount, must be greater than 0.",
						minimum: 0.01,
					},
					currency: {
						type: "string",
						description: "ISO 4217 currency code, for example CNY, USD.",
						minLength: 3,
						maxLength: 3,
					},
					category: {
						type: "string",
						description:
							"Category name, for example Food, Transport, Shopping, Salary.",
						minLength: 1,
						maxLength: 50,
					},
					account: {
						type: "string",
						description:
							"Payment account, for example Cash, Alipay, WeChat, Visa.",
						minLength: 1,
						maxLength: 50,
					},
					occurred_at_iso: {
						type: "string",
						description:
							"Transaction date-time in ISO 8601 format with timezone.",
					},
					merchant: {
						type: "string",
						description: "Optional merchant or payee name.",
						maxLength: 80,
					},
					note: {
						type: "string",
						description: "Optional memo.",
						maxLength: 500,
					},
				},
				required: [
					"transaction_type",
					"amount",
					"currency",
					"category",
					"account",
					"occurred_at_iso",
				],
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "generate_image",
			description:
				"Generate an image from text prompt with style, size and quality options.",
			parameters: {
				type: "object",
				properties: {
					prompt: {
						type: "string",
						description: "Main text prompt describing what to generate.",
						minLength: 1,
						maxLength: 2000,
					},
					negative_prompt: {
						type: "string",
						description: "What should be avoided in the image.",
						maxLength: 1000,
					},
					size: {
						type: "string",
						enum: ["1024x1024", "1024x1536", "1536x1024", "2048x2048"],
						description: "Output image resolution.",
					},
					style: {
						type: "string",
						enum: [
							"photorealistic",
							"anime",
							"illustration",
							"3d",
							"oil_painting",
							"minimal",
						],
						description: "Preferred rendering style.",
					},
					quality: {
						type: "string",
						enum: ["draft", "standard", "high"],
						description: "Generation quality level.",
					},
					num_images: {
						type: "integer",
						description: "Number of images to generate.",
						minimum: 1,
						maximum: 4,
					},
					seed: {
						type: "integer",
						description: "Optional seed for reproducibility.",
						minimum: 1,
						maximum: 2147483647,
					},
				},
				required: ["prompt", "size"],
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "ai_web_search",
			description:
				"Search web content for latest information, then return concise findings with sources.",
			parameters: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description: "Search query describing the target topic.",
						minLength: 2,
						maxLength: 300,
					},
					focus: {
						type: "string",
						description:
							"Optional focus such as 'pricing', 'release note', or 'benchmark'.",
						maxLength: 80,
					},
					max_results: {
						type: "integer",
						description: "Maximum number of results to fetch and summarize.",
						minimum: 1,
						maximum: 10,
					},
					language: {
						type: "string",
						enum: ["zh-CN", "en", "auto"],
						description: "Preferred language for returned summary.",
					},
				},
				required: ["query"],
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "summarize_text",
			description:
				"Summarize long text into structured output such as bullets, key points and action items.",
			parameters: {
				type: "object",
				properties: {
					text: {
						type: "string",
						description: "Source text to summarize.",
						minLength: 1,
						maxLength: 20000,
					},
					style: {
						type: "string",
						enum: ["brief", "balanced", "detailed"],
						description: "Summary detail level.",
					},
					output_format: {
						type: "string",
						enum: ["paragraph", "bullet_points", "json_outline"],
						description: "Preferred output format.",
					},
					max_tokens: {
						type: "integer",
						description: "Optional cap for summary length.",
						minimum: 64,
						maximum: 2048,
					},
				},
				required: ["text"],
				additionalProperties: false,
			},
		},
	},
];
