class LLMService {
  constructor() {
    this.useOllama = true;
    this.modelChangeCallback = null; // Callback for when model changes
    const requiredEnv = (process.env.OLLAMA_REQUIRED || 'true').toLowerCase();
    this.requireOllama = requiredEnv === '1' || requiredEnv === 'true' || requiredEnv === 'yes';

    const normalizeBase = (s) => {
      if (!s) return null;
      let base = s.trim();
      if (!/^https?:\/\//.test(base)) base = `http://${base}`;
      if (!/:\d+$/.test(base)) base = `${base}:11434`;
      return base.replace(/\/$/, '');
    };

    const manualHosts = ['192.168.1.54'];
    const manualBases = manualHosts.map(h => normalizeBase(h)).filter(Boolean);
    const envHosts = process.env.OLLAMA_HOSTS
      ? process.env.OLLAMA_HOSTS.split(',').map(h => normalizeBase(h)).filter(Boolean)
      : (process.env.OLLAMA_HOST ? [normalizeBase(process.env.OLLAMA_HOST)] : []);
    this.ollamaBases = manualBases.length > 0 ? manualBases : (envHosts.length > 0 ? envHosts : [normalizeBase('localhost:11434')]);
    console.log('[LLM] Ollama bases:', this.ollamaBases.join(', '));
    console.log('[LLM] OLLAMA_REQUIRED:', this.requireOllama);

    const modelFromEnv = process.env.LLM_MODEL && process.env.LLM_MODEL.trim();
    const modelListFromEnv = process.env.LLM_MODELS
      ? process.env.LLM_MODELS.split(',').map(m => m.trim()).filter(Boolean)
      : null;
    this.modelCandidates = modelListFromEnv || ['gemma3:270m', 'antconsales/antonio-gemma3-evo-q4'];
    this.modelName = modelFromEnv || 'antconsales/antonio-gemma3-evo-q4';

    this.generator = null;
    this.isInitialized = false;
    this.initializationPromise = null;

    // Initialize per-device queues and busy flags
    this.deviceQueues = {};
    this.deviceBusy = {};
    this.ollamaBases.forEach(base => {
      this.deviceQueues[base] = [];
      this.deviceBusy[base] = false;
    });
    // Track last used device for round-robin
    this.lastDeviceIndex = -1;
  }

  async initialize() {
    if (this.isInitialized) return;

    if (this.useOllama) {
      const basesToTry = [...this.ollamaBases];
      for (let i = 0; i < basesToTry.length; i++) {
        const base = basesToTry[i];
        try {
          console.log('[LLM] Checking Ollama connection at', base);
          const response = await fetch(`${base}/api/tags`, { method: 'GET' });
          if (response.ok) {
            this.isInitialized = true;
            console.log('[LLM] Ollama is ready at', base, 'model:', this.modelName);
            console.log('[LLM] Using Ollama with GPU acceleration enabled.');
            return;
          }
        } catch (err) {
          console.warn('[LLM] Ollama not reachable at', base, '-', err.message);
        }
      }
      if (this.requireOllama) {
        console.error('[LLM] No Ollama endpoints reachable and OLLAMA_REQUIRED is true.');
        throw new Error('Ollama required but no endpoints reachable');
      } else {
        console.warn('[LLM] No Ollama endpoints reachable; falling back to Transformers.js (CPU-only).');
        this.useOllama = false;
      }
    }

    if (this.initializationPromise) return this.initializationPromise;
    this.initializationPromise = (async () => {
      try {
        console.log('[LLM] Initializing Transformers.js (CPU-only)...');
        const { pipeline } = await import('@xenova/transformers');
        this.generator = await pipeline('text-generation', 'Xenova/gpt2', {
          quantized: true,
          progress_callback: (progress) => {
            if (progress.status === 'progress') {
              console.log(`[LLM] Loading model: ${Math.round(progress.progress)}%`);
            }
          },
        });
        this.isInitialized = true;
        console.log('[LLM] Transformers.js model loaded (CPU-only)');
      } catch (error) {
        console.error('[LLM] Error initializing model:', error);
        this.isInitialized = false;
        this.initializationPromise = null;
        throw error;
      }
    })();
    return this.initializationPromise;
  }

  async ensureTransformersReady() {
    if (this.generator) return;
    try {
      console.log('[LLM] Preparing Transformers.js generator (CPU-only)...');
      const { pipeline } = await import('@xenova/transformers');
      this.generator = await pipeline('text-generation', 'Xenova/gpt2', {
        quantized: true,
        progress_callback: (progress) => {
          if (progress.status === 'progress') {
            console.log(`[LLM] Loading model: ${Math.round(progress.progress)}%`);
          }
        },
      });
      console.log('[LLM] Transformers.js generator ready (CPU-only).');
    } catch (error) {
      console.error('[LLM] Failed to prepare Transformers.js generator:', error);
      throw error;
    }
  }

  buildContext(trainingData, llmKnowledge) {
    const contextParts = [];
    if (llmKnowledge && llmKnowledge.length > 0) {
      contextParts.push('Knowledge base:');
      llmKnowledge.forEach((knowledge, idx) => {
        contextParts.push(`${idx + 1}. ${knowledge}`);
      });
    }
    if (trainingData && trainingData.length > 0) {
      contextParts.push('\nTraining examples:');
      trainingData.forEach((data) => {
        contextParts.push(`Q: ${data.question}`);
        contextParts.push(`A: ${data.answer}`);
      });
    }
    return contextParts.join('\n');
  }

  async generateResponse(question, trainingData = [], llmKnowledge = []) {
    return new Promise((resolve) => {
      const request = { question, trainingData, llmKnowledge, resolve };
      // Round-robin device selection
      this.lastDeviceIndex = (this.lastDeviceIndex + 1) % this.ollamaBases.length;
      const selectedBase = this.ollamaBases[this.lastDeviceIndex];
      console.log('[LLM] Assigning request to device (round-robin):', selectedBase);
      this.deviceQueues[selectedBase].push(request);
      this.processDeviceQueue(selectedBase);
    });
  }

  findAvailableDevice() {
    // Deprecated in round-robin mode
    return null;
  }

  async processDeviceQueue(base) {
    if (this.deviceBusy[base] || this.deviceQueues[base].length === 0) return;
    
    this.deviceBusy[base] = true;
    const { question, trainingData, llmKnowledge, resolve } = this.deviceQueues[base].shift();
    
    console.log(`[LLM] Processing request on ${base} (queue: ${this.deviceQueues[base].length} remaining)`);
    
    try {
      if (!this.isInitialized) await this.initialize();
      const context = this.buildContext(trainingData, llmKnowledge);
      const response = this.useOllama
        ? await this.generateWithOllamaOnDevice(base, question, context)
        : await this.generateWithTransformers(question, context);
      resolve(response);
    } catch (error) {
      console.error('[LLM] Error generating response on', base, ':', error);
      resolve("I'm still learning. Please ask me again later!");
    } finally {
      this.deviceBusy[base] = false;
      
      // Continue processing this device's queue if there are more requests
      if (this.deviceQueues[base].length > 0) {
        console.log(`[LLM] ${base} processing next queued request`);
        this.processDeviceQueue(base);
      }
    }
  }

  async generateWithOllamaOnDevice(base, question, context) {
    try {
      const prompt = context
        ? `${context}\n\nQuestion: ${question}\nAnswer:`
        : `Question: ${question}\nAnswer:`;

      console.log('[LLM] Generating response with Ollama at', base);

      const tryRequest = async (path, body) => {
        const res = await fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return res;
      };

      const options = { temperature: 0.7, num_predict: 50, stop: ['\n', 'Question:', '?'], num_gpu: 99 };

      let response = await tryRequest('/api/generate', { model: this.modelName, prompt, stream: false, options });

      if (!response.ok) {
        const status = response.status;
        let bodyText = '';
        try { bodyText = await response.text(); } catch {}
        console.warn(`[LLM] /api/generate returned ${status} at ${base}: ${bodyText}`);

        if (status === 404 && this.modelCandidates.length > 0) {
          const currentIdx = this.modelCandidates.indexOf(this.modelName);
          const nextIdx = (currentIdx + 1) % this.modelCandidates.length;
          if (this.modelCandidates[nextIdx] !== this.modelName) {
            this.modelName = this.modelCandidates[nextIdx];
            console.warn('[LLM] Switching to fallback model:', this.modelName);
            if (this.modelChangeCallback) {
              this.modelChangeCallback(this.modelName);
            }
            response = await tryRequest('/api/generate', { model: this.modelName, prompt, stream: false, options });
          }
        }

        if (!response.ok) {
          const chatRes = await tryRequest('/api/chat', {
            model: this.modelName,
            messages: [context ? { role: 'system', content: context } : null, { role: 'user', content: `Question: ${question}\nAnswer:` }].filter(Boolean),
            stream: false,
            options,
          });
          response = chatRes;
        }
      }

      if (!response.ok) throw new Error(`Ollama request failed: ${response.status}`);

      const data = await response.json();
      let answer = (data.response || (data.message && data.message.content) || '').trim();
      if (!answer || answer.length < 3) answer = "I don't have enough information to answer that yet.";
      console.log('[LLM] Generated response:', answer);
      return answer;
    } catch (error) {
      console.error('[LLM] Ollama error on', base, ':', error);
      throw error;
    }
  }

  async generateWithTransformers(question, context) {
    try {
      await this.ensureTransformersReady();
      const prompt = context
        ? `${context}\n\nQuestion: ${question}\nAnswer:`
        : `Question: ${question}\nAnswer:`;

      console.log('[LLM] Generating response with Transformers.js (CPU)...');
      const result = await this.generator(prompt, {
        max_new_tokens: 50,
        temperature: 0.7,
        top_p: 0.9,
        do_sample: true,
        num_return_sequences: 1,
      });

      let response = result[0].generated_text;
      response = response.substring(prompt.length).trim();
      const stopIndex = response.search(/[\n\?]/);
      if (stopIndex !== -1) response = response.substring(0, stopIndex).trim();
      if (!response || response.length < 3) response = "I don't have enough information to answer that yet.";
      console.log('[LLM] Generated response:', response);
      return response;
    } catch (error) {
      console.error('[LLM] Transformers.js error:', error);
      return "I'm having trouble processing that question right now.";
    }
  }

  onModelChange(callback) {
    this.modelChangeCallback = callback;
  }

  getModelName() {
    return this.modelName;
  }
}

const llmService = new LLMService();

export default llmService;
