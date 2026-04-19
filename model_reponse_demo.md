```plaintext

curl "https://api.cloudflare.com/client/v4/accounts/xxxxx/ai/run/@cf/qwen/qwen3-30b-a3b-fp8" \
  -H "Authorization: Bearer xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "stream": true,
    "messages": [
      {
        "role": "system",
        "content": "You are a specialized agent. "
      },
      {
        "role": "user",
        "content": "Remind me to go to the library tomorrow at 2pm"
      }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "add_todo",
          "description": "Add a new task",
          "parameters": {
            "type": "object",
            "properties": {
              "task": { "type": "string" },
              "time": { "type": "string" }
            },
            "required": ["task", "time"]
          }
        }
      }
    ]
  }'
data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}],"usage":{"prompt_tokens":192,"total_tokens":192,"completion_tokens":0},"prompt_token_ids":null}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"\n"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":194,"completion_tokens":2}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"Okay"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":195,"completion_tokens":3}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":","},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":196,"completion_tokens":4}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" the"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":197,"completion_tokens":5}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" user"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":198,"completion_tokens":6}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" wants"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":199,"completion_tokens":7}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" a"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":200,"completion_tokens":8}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" reminder"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":201,"completion_tokens":9}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" to"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":202,"completion_tokens":10}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" go"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":203,"completion_tokens":11}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" to"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":204,"completion_tokens":12}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" the"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":205,"completion_tokens":13}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" library"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":206,"completion_tokens":14}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" tomorrow"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":207,"completion_tokens":15}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" at"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":208,"completion_tokens":16}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" "},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":209,"completion_tokens":17}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"2"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":210,"completion_tokens":18}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"pm"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":211,"completion_tokens":19}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"."},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":212,"completion_tokens":20}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" I"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":213,"completion_tokens":21}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" need"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":214,"completion_tokens":22}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" to"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":215,"completion_tokens":23}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" use"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":216,"completion_tokens":24}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" the"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":217,"completion_tokens":25}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" add"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":218,"completion_tokens":26}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"_todo"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":219,"completion_tokens":27}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" function"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":220,"completion_tokens":28}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"."},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":221,"completion_tokens":29}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" The"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":222,"completion_tokens":30}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" parameters"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":223,"completion_tokens":31}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" required"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":224,"completion_tokens":32}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" are"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":225,"completion_tokens":33}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" task"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":226,"completion_tokens":34}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" and"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":227,"completion_tokens":35}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" time"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":228,"completion_tokens":36}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"."},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":229,"completion_tokens":37}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" The"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":230,"completion_tokens":38}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" task"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":231,"completion_tokens":39}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" is"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":232,"completion_tokens":40}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" \""},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":233,"completion_tokens":41}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"go"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":234,"completion_tokens":42}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" to"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":235,"completion_tokens":43}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" the"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":236,"completion_tokens":44}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" library"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":237,"completion_tokens":45}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"\""},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":238,"completion_tokens":46}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" and"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":239,"completion_tokens":47}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" the"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":240,"completion_tokens":48}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" time"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":241,"completion_tokens":49}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" is"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":242,"completion_tokens":50}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" \""},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":243,"completion_tokens":51}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"tom"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":244,"completion_tokens":52}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"orrow"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":245,"completion_tokens":53}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" at"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":246,"completion_tokens":54}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" "},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":247,"completion_tokens":55}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"2"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":248,"completion_tokens":56}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"pm"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":249,"completion_tokens":57}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"\"."},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":250,"completion_tokens":58}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" I"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":251,"completion_tokens":59}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" should"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":252,"completion_tokens":60}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" structure"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":253,"completion_tokens":61}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" the"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":254,"completion_tokens":62}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" JSON"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":255,"completion_tokens":63}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" call"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":256,"completion_tokens":64}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" with"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":257,"completion_tokens":65}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" those"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":258,"completion_tokens":66}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" values"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":259,"completion_tokens":67}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"."},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":260,"completion_tokens":68}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" Let"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":261,"completion_tokens":69}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" me"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":262,"completion_tokens":70}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" make"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":263,"completion_tokens":71}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" sure"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":264,"completion_tokens":72}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" the"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":265,"completion_tokens":73}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" keys"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":266,"completion_tokens":74}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" are"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":267,"completion_tokens":75}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" correct"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":268,"completion_tokens":76}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" and"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":269,"completion_tokens":77}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" the"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":270,"completion_tokens":78}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" time"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":271,"completion_tokens":79}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" format"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":272,"completion_tokens":80}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" is"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":273,"completion_tokens":81}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" as"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":274,"completion_tokens":82}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" specified"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":275,"completion_tokens":83}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"."},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":276,"completion_tokens":84}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" Alright"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":277,"completion_tokens":85}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":","},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":278,"completion_tokens":86}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" that"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":279,"completion_tokens":87}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" should"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":280,"completion_tokens":88}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":" do it.\n"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":283,"completion_tokens":91}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"content":"\n\n"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":285,"completion_tokens":93}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"id":"chatcmpl-tool-a7348842dffa4c4795f7f8ae2cc1b328","type":"function","index":0,"function":{"name":"add_todo"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":294,"completion_tokens":102}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"task\": \""}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":301,"completion_tokens":109}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"go"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":302,"completion_tokens":110}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" to"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":303,"completion_tokens":111}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" the"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":304,"completion_tokens":112}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" library"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":305,"completion_tokens":113}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\","}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":306,"completion_tokens":114}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" \""}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":307,"completion_tokens":115}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"time"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":308,"completion_tokens":116}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\":"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":309,"completion_tokens":117}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" \""}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":310,"completion_tokens":118}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"tom"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":311,"completion_tokens":119}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"orrow"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":312,"completion_tokens":120}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" at"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":313,"completion_tokens":121}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" "}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":314,"completion_tokens":122}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"2"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":315,"completion_tokens":123}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"pm"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":316,"completion_tokens":124}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"}"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":318,"completion_tokens":126}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"content":""},"logprobs":null,"finish_reason":"tool_calls","stop_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":319,"completion_tokens":127}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[],"usage":{"prompt_tokens":192,"total_tokens":319,"completion_tokens":127}}

data: [DONE]

```

