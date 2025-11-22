import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { config } from "dotenv";
import { z } from "zod";
import { getMistralAPI, CompletionResponse, MISTRAL_MODELS, MistralModel } from './mistral.js';
import fs from 'fs/promises';
import path from 'path';

// Load environment variables
config();

// Validate required environment variables
const envSchema = z.object({
  MISTRAL_API_KEY: z.string().min(1),
});

const env = envSchema.parse(process.env);

// Initialize Mistral API
let mistralApi: ReturnType<typeof getMistralAPI>;

try {
  mistralApi = getMistralAPI(env.MISTRAL_API_KEY);
  // Validate API key on startup
  await mistralApi.validateApiKey();
  console.error("Successfully connected to Mistral API");
} catch (error) {
  console.error("Failed to initialize Mistral API:", error instanceof Error ? error.message : error);
  process.exit(1);
}

// Define server configuration
const server = new Server(
  {
    name: "mcp-codestral",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Validate tool input schemas
const CodeCompletionSchema = z.object({
  code: z.string(),
  language: z.string().optional(),
  task: z.enum(['complete', 'fix', 'test', 'fim']),
  model: z.enum([MISTRAL_MODELS.CODESTRAL, MISTRAL_MODELS.CODESTRAL_MAMBA]).optional(),
  suffix: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().positive().optional(),
  stop: z.array(z.string()).optional(),
  outputPath: z.string().optional(),
  streamToFile: z.boolean().optional(),
});

const ChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })),
  model: z.enum([
    MISTRAL_MODELS.MISTRAL_LARGE,
    MISTRAL_MODELS.MISTRAL_SMALL,
    MISTRAL_MODELS.MINISTRAL_8B,
    MISTRAL_MODELS.MINISTRAL_3B,
  ]).optional(),
  temperature: z.number().min(0).max(1).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().positive().optional(),
  stop: z.array(z.string()).optional(),
});

// Format Mistral API response
function formatResponse(completion: CompletionResponse): string {
  if (!completion.choices || completion.choices.length === 0) {
    throw new Error('Invalid completion response');
  }

  const content = completion.choices[0].message.content;

  // Extract code from markdown code blocks if present
  const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
  const matches = [...content.matchAll(codeBlockRegex)];

  if (matches.length > 0) {
    return matches.map(match => match[1].trim()).join('\n\n');
  }

  return content;
}

// Tool Implementation
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "code_completion",
        description: "Complete code, fix bugs, or generate tests using Mistral Codestral",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "The code to process",
            },
            language: {
              type: "string",
              description: "Programming language (optional)",
            },
            task: {
              type: "string",
              enum: ["complete", "fix", "test", "fim"],
              description: "Type of task: 'complete' for code completion, 'fix' for bug fixing, 'test' for test generation, 'fim' for fill-in-the-middle",
            },
            model: {
              type: "string",
              enum: [MISTRAL_MODELS.CODESTRAL, MISTRAL_MODELS.CODESTRAL_MAMBA],
              description: "Model to use (optional, defaults to codestral-latest)",
            },
            suffix: {
              type: "string",
              description: "Code that should come after the completion (for FIM task)",
            },
            temperature: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Sampling temperature (optional, defaults to 0.7)",
            },
            top_p: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Nucleus sampling threshold (optional, defaults to 1)",
            },
            max_tokens: {
              type: "number",
              minimum: 1,
              description: "Maximum number of tokens to generate (optional, defaults to 1000)",
            },
            stop: {
              type: "array",
              items: {
                type: "string"
              },
              description: "Stop sequences to end generation (optional)",
            },
            outputPath: {
              type: "string",
              description: "Path to save the generated code (optional)",
            },
            streamToFile: {
              type: "boolean",
              description: "If true, saves result to file and returns success message only (optional)",
            }
          },
          required: ["code", "task"],
        },
      },
      {
        name: "chat",
        description: "General-purpose chat completion for reasoning, analysis, planning, and understanding using Mistral's general models",
        inputSchema: {
          type: "object",
          properties: {
            messages: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  role: {
                    type: "string",
                    enum: ["system", "user", "assistant"],
                    description: "The role of the message sender"
                  },
                  content: {
                    type: "string",
                    description: "The content of the message"
                  }
                },
                required: ["role", "content"]
              },
              description: "Array of conversation messages"
            },
            model: {
              type: "string",
              enum: [
                MISTRAL_MODELS.MISTRAL_LARGE,
                MISTRAL_MODELS.MISTRAL_SMALL,
                MISTRAL_MODELS.MINISTRAL_8B,
                MISTRAL_MODELS.MINISTRAL_3B,
              ],
              description: "Model to use (optional, defaults to mistral-large-latest)"
            },
            temperature: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Sampling temperature (optional, defaults to 0.7)"
            },
            top_p: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Nucleus sampling threshold (optional, defaults to 1)"
            },
            max_tokens: {
              type: "number",
              minimum: 1,
              description: "Maximum number of tokens to generate (optional, defaults to 1000)"
            },
            stop: {
              type: "array",
              items: {
                type: "string"
              },
              description: "Stop sequences to end generation (optional)"
            }
          },
          required: ["messages"],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "chat") {
    try {
      const params = ChatSchema.parse(args);

      // Use general Mistral API for chat
      const completion = await mistralApi.chatCompletion(params.messages, {
        model: params.model || MISTRAL_MODELS.MISTRAL_LARGE,
        temperature: params.temperature,
        top_p: params.top_p,
        max_tokens: params.max_tokens,
        stop: params.stop,
      });

      // Return the response content directly without code extraction
      const content = completion.choices[0].message.content;

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    } catch (error) {
      console.error("Error processing chat request:", error);

      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === "code_completion") {
    try {
      const params = CodeCompletionSchema.parse(args);

      let completion: CompletionResponse;

      if (params.task === 'fim') {
        // Use FIM endpoint for fill-in-the-middle task
        completion = await mistralApi.fimCompletion(params.code, {
          suffix: params.suffix,
          temperature: params.temperature,
          top_p: params.top_p,
          max_tokens: params.max_tokens,
          stop: params.stop,
        });
      } else {
        // Get formatted messages for other tasks
        const messages = mistralApi.createPrompt(
          params.code,
          params.language,
          params.task,
          params.suffix
        );

        // Make API call to Mistral
        completion = await mistralApi.chatCompletion(messages, {
          model: params.model,
          temperature: params.temperature,
          top_p: params.top_p,
          max_tokens: params.max_tokens,
          stop: params.stop,
        });
      }
      const formattedResponse = formatResponse(completion);

      // Handle file operations and response
      if (params.outputPath) {
        try {
          await fs.mkdir(path.dirname(params.outputPath), { recursive: true });
          await fs.writeFile(params.outputPath, formattedResponse, 'utf-8');

          // If streamToFile is true, return success message only
          if (params.streamToFile) {
            return {
              content: [
                {
                  type: "text",
                  text: `Successfully saved to ${params.outputPath}`,
                },
              ],
            };
          }
        } catch (error) {
          console.error("Error saving to file:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error saving to file: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
              },
            ],
            isError: true,
          };
        }
      }

      // Return the formatted response if not streaming to file
      return {
        content: [
          {
            type: "text",
            text: formattedResponse,
          },
        ],
      };
    } catch (error) {
      console.error("Error processing code completion request:", error);

      // Return a more user-friendly error message
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Add some basic resource handlers for code files
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "file://code",
        name: "Code Files",
        description: "Access to code files in the workspace"
      }
    ]
  };
});

// Start the server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Mistral Codestral MCP Server running on stdio");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
