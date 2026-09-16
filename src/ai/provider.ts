export type ProviderId = 
  | 'gemini' 
  | 'groq' 
  | 'openai' 
  | 'openrouter' 
  | 'anthropic' 
  | 'deepseek' 
  | 'cerebras' 
  | 'ollama' 
  | 'custom';

export interface ProviderPreset {
  id: ProviderId;
  name: string;
  defaultEndpoint: string;
  defaultModel: string;
  recommendedModels: string[];
  isOpenAICompatible: boolean;
}

export const PROVIDER_PRESETS: Record<ProviderId, ProviderPreset> = {
  groq: {
    id: 'groq',
    name: 'Groq Cloud',
    defaultEndpoint: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    recommendedModels: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'deepseek-r1-distill-llama-70b',
      'whisper-large-v3-turbo'
    ],
    isOpenAICompatible: true
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    recommendedModels: ['gpt-4o', 'gpt-4o-mini', 'o1-mini'],
    isOpenAICompatible: true
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-r1',
    recommendedModels: [
      'deepseek/deepseek-r1',
      'anthropic/claude-3.7-sonnet',
      'meta-llama/llama-3.3-70b-instruct'
    ],
    isOpenAICompatible: true
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    defaultEndpoint: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-7-sonnet-20250219',
    recommendedModels: ['claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022'],
    isOpenAICompatible: false
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultEndpoint: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    recommendedModels: ['deepseek-chat', 'deepseek-reasoner'],
    isOpenAICompatible: true
  },
  cerebras: {
    id: 'cerebras',
    name: 'Cerebras Cloud',
    defaultEndpoint: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama3.3-70b',
    recommendedModels: ['llama3.3-70b', 'llama3.1-8b'],
    isOpenAICompatible: true
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local Host)',
    defaultEndpoint: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2-vision',
    recommendedModels: ['llama3.2-vision', 'llama3.3:70b', 'qwen2.5:7b'],
    isOpenAICompatible: true
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    recommendedModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    isOpenAICompatible: false
  },
  custom: {
    id: 'custom',
    name: 'Custom OpenAI-Compatible',
    defaultEndpoint: 'https://your-custom-endpoint/v1',
    defaultModel: 'custom-model',
    recommendedModels: [],
    isOpenAICompatible: true
  }
};

export interface AIProviderConfig {
  provider: ProviderId;
  endpoint?: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  customHeaders?: Record<string, string>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 JPEG strings
}

export interface LLMResponse {
  content: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface LLMProvider {
  chat(messages: LLMMessage[], tier?: 'fast' | 'frontier'): Promise<LLMResponse>;
  testConnection(): Promise<{ success: boolean; message: string; latencyMs: number }>;
}

/**
 * Universal Multi-Provider LLM Client supporting Groq, OpenAI, OpenRouter, DeepSeek,
 * Cerebras, Ollama, Anthropic, Gemini, and any custom OpenAI-compatible endpoint.
 */
export class UniversalLLMProvider implements LLMProvider {
  private config: AIProviderConfig;

  constructor(config: Partial<AIProviderConfig> = {}) {
    const defaultPreset = PROVIDER_PRESETS[config.provider || 'groq'];
    this.config = {
      provider: config.provider || 'groq',
      endpoint: config.endpoint || defaultPreset.defaultEndpoint,
      apiKey: config.apiKey || process.env.AI_API_KEY || '',
      model: config.model || defaultPreset.defaultModel,
      temperature: config.temperature ?? 0.2,
      maxTokens: config.maxTokens ?? 2048,
      customHeaders: config.customHeaders || {}
    };
  }

  updateConfig(newConfig: Partial<AIProviderConfig>) {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.provider && !newConfig.endpoint) {
      this.config.endpoint = PROVIDER_PRESETS[newConfig.provider]?.defaultEndpoint || this.config.endpoint;
    }
  }

  getConfig(): AIProviderConfig {
    return { ...this.config };
  }

  async testConnection(): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const startTime = Date.now();
    try {
      const response = await this.chat([
        { role: 'user', content: 'Respond with the single word "READY" to verify clinical AI readiness and connectivity.' }
      ]);
      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        message: response.content.trim(),
        latencyMs
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Failed to connect to provider',
        latencyMs: Date.now() - startTime
      };
    }
  }

  async chat(messages: LLMMessage[], tier: 'fast' | 'frontier' = 'fast'): Promise<LLMResponse> {
    if (this.config.provider === 'gemini') {
      return this.callGemini(messages);
    }
    if (this.config.provider === 'anthropic') {
      return this.callAnthropic(messages);
    }
    return this.callOpenAICompatible(messages);
  }

  private async callOpenAICompatible(messages: LLMMessage[]): Promise<LLMResponse> {
    const url = `${this.config.endpoint?.replace(/\/$/, '')}/chat/completions`;

    const formattedMessages = messages.map(m => {
      if (m.images && m.images.length > 0) {
        return {
          role: m.role,
          content: [
            { type: 'text', text: m.content },
            ...m.images.map(b64 => ({
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${b64}` }
            }))
          ]
        };
      }
      return { role: m.role, content: m.content };
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.customHeaders
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages: formattedMessages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`[${this.config.provider}] API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    return {
      content,
      tokenUsage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens
      } : undefined
    };
  }

  private async callAnthropic(messages: LLMMessage[]): Promise<LLMResponse> {
    const url = `${this.config.endpoint?.replace(/\/$/, '')}/messages`;
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const formatted = conversationMessages.map(m => {
      if (m.images && m.images.length > 0) {
        return {
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: [
            { type: 'text', text: m.content },
            ...m.images.map(b64 => ({
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
            }))
          ]
        };
      }
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content };
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey || '',
      'anthropic-version': '2023-06-01',
      ...this.config.customHeaders
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        system: systemMessage,
        messages: formatted,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`[Anthropic] Error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const text = data.content?.map((c: any) => c.text).join('') || '';

    return {
      content: text,
      tokenUsage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens
      } : undefined
    };
  }

  private async callGemini(messages: LLMMessage[]): Promise<LLMResponse> {
    const model = this.config.model || 'gemini-2.5-flash';
    const url = `${this.config.endpoint?.replace(/\/$/, '')}/models/${model}:generateContent?key=${this.config.apiKey}`;

    const contents = messages.map(m => {
      const parts: any[] = [{ text: m.content }];
      if (m.images) {
        for (const b64 of m.images) {
          parts.push({
            inline_data: { mime_type: 'image/jpeg', data: b64 }
          });
        }
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts
      };
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: this.config.temperature,
          maxOutputTokens: this.config.maxTokens
        }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`[Gemini] Error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      content: text,
      tokenUsage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount
      } : undefined
    };
  }
}

/**
 * Smart Router: Supports custom test mocks or connects to the Universal Provider
 */
export class SmartLLMRouter implements LLMProvider {
  private universal: UniversalLLMProvider;

  constructor(
    private customHandler?: (messages: LLMMessage[], tier: 'fast' | 'frontier') => Promise<LLMResponse>,
    config?: Partial<AIProviderConfig>
  ) {
    this.universal = new UniversalLLMProvider(config);
  }

  getUniversal(): UniversalLLMProvider {
    return this.universal;
  }

  async testConnection() {
    return this.universal.testConnection();
  }

  async chat(messages: LLMMessage[], tier: 'fast' | 'frontier' = 'fast'): Promise<LLMResponse> {
    if (this.customHandler) {
      return this.customHandler(messages, tier);
    }
    return this.universal.chat(messages, tier);
  }
}
