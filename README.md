[![MseeP Badge](https://mseep.net/pr/bsmi021-mcp-mistral-codestral-badge.jpg)](https://mseep.ai/app/bsmi021-mcp-mistral-codestral)

# Mistral Codestral MCP Server

A Model Context Protocol (MCP) server that provides seamless integration with Mistral AI's Codestral and general-purpose language models, enabling AI-powered code completion, bug fixing, test generation, and general reasoning capabilities through a standardized interface.

## What is this MCP Server?

This is an **MCP (Model Context Protocol) server** that acts as a bridge between MCP clients (like Claude Desktop, IDEs, or other AI assistants) and Mistral AI's powerful language models. It exposes Mistral's capabilities as standardized tools that can be called by any MCP-compatible client.

### What it Does

This server provides two main capabilities:

1. **Code-Specific AI Tools** - Using Mistral's Codestral models optimized for code:
   - **Code Completion**: Intelligently complete partial code snippets
   - **Bug Fixing**: Analyze code for bugs and provide corrected versions with explanations
   - **Test Generation**: Automatically generate comprehensive unit tests for your code
   - **Fill-in-the-Middle (FIM)**: Complete code between existing start and end sections

2. **General-Purpose Chat** - Using Mistral's reasoning models:
   - Complex reasoning and analysis
   - Planning and strategic thinking
   - Natural language understanding and generation
   - Technical explanations and documentation

### Architecture Overview

The server consists of two main components:

- **`src/index.ts`**: The MCP server implementation that:
  - Exposes tools via the Model Context Protocol
  - Handles tool invocations from MCP clients
  - Validates inputs using Zod schemas
  - Formats and returns responses
  - Manages file I/O operations for saving generated code

- **`src/mistral.ts`**: The Mistral API client that:
  - Manages connections to both Codestral and standard Mistral endpoints
  - Handles authentication and API key validation
  - Implements rate limiting (100ms minimum between requests)
  - Provides error handling and retry logic
  - Supports multiple model types (Codestral, Mistral Large, Small, Ministral)

## Features

- **Dual API Support**: Automatically routes requests to the appropriate Mistral endpoint (Codestral for code tasks, standard API for general tasks)
- **Multiple Models**: Support for 6 different Mistral models optimized for different use cases
- **Code completion** with context-aware suggestions
- **Bug detection and fixing** with detailed explanations
- **Automated test generation** using appropriate testing frameworks
- **Fill-in-the-Middle (FIM)** completion for inserting code in existing contexts
- **General-purpose reasoning** for analysis, planning, and understanding
- **Comprehensive input validation** using Zod schemas
- **Rate limiting** to prevent API throttling
- **Error handling** with user-friendly messages
- **File output support** for saving generated code
- **Resource access** for code files in the workspace

## Installation

1. Clone this repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and add your Mistral API key:

   ```bash
   cp .env.example .env
   ```

4. Build the project:

   ```bash
   npm run build
   ```

## Usage

Start the server:

```bash
npm start
```

### Configuration

Add your Mistral API key to the `.env` file:

```
MISTRAL_API_KEY=your_api_key_here
```

### Available Tools

The server exposes two MCP tools that can be invoked by any MCP client:

#### 1. code_completion

An AI-powered code assistance tool that processes code using Mistral's Codestral models.

**What it does internally:**
1. Validates input parameters using Zod schemas
2. For FIM tasks: calls the specialized `/fim/completions` endpoint
3. For other tasks: constructs appropriate system and user prompts, then calls `/chat/completions`
4. Extracts code from markdown code blocks in the response
5. Optionally saves the result to a file
6. Returns formatted code to the client

**Parameters:**

- `code` (string, required): The code to process
- `language` (string, optional): Programming language (helps with syntax-specific suggestions)
- `task` (string, required): Type of operation:
  - `"complete"`: Continue or complete partial code
  - `"fix"`: Analyze for bugs and provide corrected version
  - `"test"`: Generate comprehensive unit tests
  - `"fim"`: Fill-in-the-middle completion (requires `suffix`)
- `model` (string, optional): Choose between `codestral-latest` (default) or `codestral-mamba-latest`
- `suffix` (string, optional): Code that should come after completion (required for FIM task)
- `temperature` (number, optional): Sampling temperature 0-1 (default: 0.7) - lower is more deterministic
- `top_p` (number, optional): Nucleus sampling 0-1 (default: 1)
- `max_tokens` (number, optional): Maximum tokens to generate (default: 1000)
- `stop` (array, optional): Stop sequences to end generation
- `outputPath` (string, optional): File path to save the generated code
- `streamToFile` (boolean, optional): If true, only returns success message instead of full output

**Example use cases:**
- Complete a partially written function
- Fix TypeScript type errors in existing code
- Generate Jest tests for a React component
- Fill in the implementation between function signature and return statement

#### 2. chat

A general-purpose AI reasoning tool using Mistral's powerful language models (Large, Small, or Ministral variants).

**What it does internally:**
1. Validates the conversation messages array
2. Routes to the standard Mistral API endpoint (not Codestral)
3. Sends the conversation to the selected model
4. Returns the response content directly without code extraction

**Parameters:**

- `messages` (array, required): Conversation history with objects containing:
  - `role` (string): One of "system", "user", or "assistant"
  - `content` (string): The message content
- `model` (string, optional): Choose from:
  - `mistral-large-latest` (default) - Most capable, best for complex reasoning
  - `mistral-small-latest` - Faster, good for simpler tasks
  - `ministral-8b-latest` - Efficient, balanced performance
  - `ministral-3b-latest` - Fastest, lightweight tasks
- `temperature` (number, optional): Sampling temperature 0-1 (default: 0.7)
- `top_p` (number, optional): Nucleus sampling 0-1 (default: 1)
- `max_tokens` (number, optional): Maximum tokens to generate (default: 1000)
- `stop` (array, optional): Stop sequences to end generation

**Example use cases:**
- Explain complex architectural decisions
- Plan implementation strategies
- Analyze code for security concerns
- Generate technical documentation
- Answer questions about best practices

### How It Works: API Architecture

The server intelligently manages connections to two different Mistral API endpoints:

**Codestral Endpoint** (`https://codestral.mistral.ai/v1`)
- Used for: `codestral-latest` and `codestral-mamba-latest` models
- Specialized for code-related tasks
- Supports both chat completions and FIM (Fill-in-the-Middle) completions

**Standard Mistral Endpoint** (`https://api.mistral.com/v1`)
- Used for: `mistral-large-latest`, `mistral-small-latest`, `ministral-8b-latest`, `ministral-3b-latest`
- Optimized for general-purpose reasoning and analysis
- Only supports chat completions

**Automatic Routing:**
The `mistral.ts` module automatically determines which endpoint to use based on the selected model, creating separate axios clients for each endpoint with proper authentication and timeouts.

**Built-in Safety Features:**

- **Rate Limiting**: Enforces 100ms minimum between requests to prevent API throttling
- **Timeouts**: 30-second timeout for all API calls
- **Error Handling**: Comprehensive error catching with user-friendly messages for:
  - 401: Authentication failures (invalid API key)
  - 429: Rate limit exceeded
  - 500: Server errors
  - Other errors with detailed context
- **Input Validation**: All parameters validated using Zod schemas before API calls
- **Response Validation**: API responses validated against expected schema
- **Code Extraction**: Automatically extracts code from markdown code blocks in responses
- **Debug Logging**: Detailed error logging for troubleshooting

## Development

Run in development mode with auto-reloading:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

## Using with MCP Clients

This server implements the Model Context Protocol, which means it can be used with any MCP-compatible client:

### Claude Desktop Integration

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "mistral-codestral": {
      "command": "node",
      "args": ["/path/to/mcp-mistral-codestral/build/index.js"],
      "env": {
        "MISTRAL_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

After restarting Claude Desktop, you'll have access to the `code_completion` and `chat` tools.

### Using the Tools

Once connected, you can invoke the tools through natural language:

**Code completion:**
```
"Please complete this Python function: def fibonacci(n):"
```

**Bug fixing:**
```
"Find and fix bugs in this TypeScript code: [paste code]"
```

**Test generation:**
```
"Generate Jest tests for this React component: [paste code]"
```

**General reasoning:**
```
"Explain the trade-offs between REST and GraphQL APIs"
```

## Error Handling

The server implements comprehensive error handling at multiple levels:

**API Layer** (`mistral.ts`):
- Catches and categorizes HTTP errors (401, 429, 500, etc.)
- Provides context-specific error messages
- Logs detailed error information for debugging

**Server Layer** (`index.ts`):
- Validates all inputs before processing using Zod schemas
- Catches tool execution errors
- Returns structured error responses to clients
- Handles file I/O errors gracefully

**Error Response Format:**
```typescript
{
  content: [{
    type: "text",
    text: "Error: [user-friendly message]"
  }],
  isError: true
}
```

## Resource Access

The server provides access to code files through the `file://code` resource URI, enabling MCP clients to:
- List available code files in the workspace
- Read code file contents
- Integrate code context into AI interactions

## License

MIT
