import axios, { AxiosError } from 'axios';
import { z } from 'zod';

const CODESTRAL_API_BASE = 'https://codestral.mistral.ai/v1';
const MISTRAL_API_BASE = 'https://api.mistral.com/v1';

export const MISTRAL_MODELS = {
  // Code-specific models (use Codestral endpoint)
  CODESTRAL: 'codestral-latest',
  CODESTRAL_MAMBA: 'codestral-mamba-latest',
  // General models (use standard Mistral endpoint)
  MISTRAL_LARGE: 'mistral-large-latest',
  MISTRAL_SMALL: 'mistral-small-latest',
  MINISTRAL_8B: 'ministral-8b-latest',
  MINISTRAL_3B: 'ministral-3b-latest',
} as const;

export type MistralModel = typeof MISTRAL_MODELS[keyof typeof MISTRAL_MODELS];

// Helper to determine which API base to use
function getApiBase(model: MistralModel): string {
  if (model === MISTRAL_MODELS.CODESTRAL || model === MISTRAL_MODELS.CODESTRAL_MAMBA) {
    return CODESTRAL_API_BASE;
  }
  return MISTRAL_API_BASE;
}

// Response schema validation
const CompletionResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number(),
    message: z.object({
      role: z.string(),
      content: z.string(),
    }),
    finish_reason: z.string().optional(),
  })),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }),
});

export type CompletionResponse = z.infer<typeof CompletionResponseSchema>;

export class MistralAPI {
  private apiKey: string;
  private codestralClient: ReturnType<typeof axios.create>;
  private mistralClient: ReturnType<typeof axios.create>;

  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('API key cannot be empty');
    }
    this.apiKey = apiKey.trim();

    // Create separate clients for each API endpoint
    this.codestralClient = axios.create({
      baseURL: CODESTRAL_API_BASE,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    });

    this.mistralClient = axios.create({
      baseURL: MISTRAL_API_BASE,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000, // 30 second timeout
    });
  }

  // Helper to get the right client for a model
  private getClient(model: MistralModel) {
    return getApiBase(model) === CODESTRAL_API_BASE
      ? this.codestralClient
      : this.mistralClient;
  }

  async validateApiKey(): Promise<boolean> {
    // Codestral endpoint doesn't have a /models endpoint
    // We'll validate by attempting a simple chat completion instead
    try {
      await this.chatCompletion(
        [{ role: 'user', content: 'test' }],
        { max_tokens: 1 }
      );
      console.error('Successfully connected to Codestral API');
      return true;
    } catch (error) {
      if (error instanceof AxiosError) {
        console.error('API Error details:', {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers
        });
        if (error.response?.status === 401) {
          throw new Error('Invalid API key. Please check your Codestral API key.');
        }
        throw new Error(`API validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  async chatCompletion(
    messages: Array<{ role: string; content: string }>,
    options: {
      model?: MistralModel;
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
      stop?: string[];
    } = {}
  ) {
    try {
      const model = options.model || MISTRAL_MODELS.CODESTRAL;
      const client = this.getClient(model);

      const response = await client.post('/chat/completions', {
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        top_p: options.top_p ?? 1,
        max_tokens: options.max_tokens ?? 1000,
        stop: options.stop,
      });

      const validatedResponse = CompletionResponseSchema.parse(response.data);
      return validatedResponse;
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;

        switch (status) {
          case 401:
            throw new Error('Authentication failed. Please check your API key.');
          case 429:
            throw new Error('Rate limit exceeded. Please try again later.');
          case 500:
            throw new Error('Mistral API server error. Please try again later.');
          default:
            throw new Error(`Mistral API error (${status}): ${message}`);
        }
      }
      throw error;
    }
  }

  // FIM (Fill-in-the-middle) completion
  async fimCompletion(
    prompt: string,
    options: {
      suffix?: string;
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
      stop?: string[];
    } = {}
  ) {
    try {
      console.error('FIM Request:', {
        prompt,
        options,
      });

      const requestBody = {
        model: MISTRAL_MODELS.CODESTRAL,
        prompt,
        suffix: options.suffix,
        temperature: options.temperature ?? 0,
        top_p: options.top_p ?? 1,
        max_tokens: options.max_tokens ?? 1000,
        stop: options.stop,
      };

      console.error('FIM Request Body:', JSON.stringify(requestBody, null, 2));

      // FIM is only available on Codestral models
      const response = await this.codestralClient.post('/fim/completions', requestBody);

      console.error('FIM Response:', {
        status: response.status,
        headers: response.headers,
        data: response.data,
      });

      const validatedResponse = CompletionResponseSchema.parse(response.data);
      return validatedResponse;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('FIM Error:', {
        name: err.name,
        message: err.message,
        stack: err.stack,
      });

      if (error instanceof AxiosError) {
        console.error('API Error Details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          headers: error.response?.headers,
        });

        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;

        switch (status) {
          case 401:
            throw new Error('Authentication failed. Please check your API key.');
          case 429:
            throw new Error('Rate limit exceeded. Please try again later.');
          case 500:
            throw new Error('Mistral API server error. Please try again later.');
          default:
            throw new Error(`Mistral API error (${status}): ${message}\nResponse: ${JSON.stringify(error.response?.data)}`);
        }
      }
      throw new Error(`Unexpected error during FIM completion: ${err.message}`);
    }
  }

  // Function for creating prompts based on task type
  createPrompt(
    code: string,
    language: string | undefined,
    task: 'complete' | 'fix' | 'test' | 'fim',
    suffix?: string
  ): Array<{ role: string; content: string }> {
    const langStr = language ? ` ${language}` : '';

    const systemPrompts = {
      complete: "You are an expert programmer. Continue or complete the provided code according to best practices.",
      fix: "You are an expert programmer. Analyze the code for bugs and provide a corrected version with explanations of the fixes.",
      test: "You are an expert programmer. Generate comprehensive unit tests for the provided code using appropriate testing frameworks.",
      fim: "You are an expert programmer. Complete the code between the given start and end sections, ensuring it flows naturally.",
    };

    let userContent = `Here is the${langStr} code:\n\n\`\`\`${language || ''}\n${code}\n\`\`\``;

    if (task === 'fim' && suffix) {
      userContent += `\n\nThe code should end with:\n\n\`\`\`${language || ''}\n${suffix}\n\`\`\``;
    }

    return [
      {
        role: "system",
        content: systemPrompts[task],
      },
      {
        role: "user",
        content: userContent,
      },
    ];
  }

  // Rate limiting helpers
  private lastRequestTime: number = 0;
  private readonly minRequestInterval: number = 100; // Minimum 100ms between requests

  private async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve =>
        setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
      );
    }

    this.lastRequestTime = Date.now();
  }
}

// Create a singleton instance
let instance: MistralAPI | null = null;

export const getMistralAPI = (apiKey: string): MistralAPI => {
  if (!instance) {
    instance = new MistralAPI(apiKey);
  }
  return instance;
};
