import type { GlossaryEntry } from './types';

export const glossary: GlossaryEntry[] = [
    {
        slug: 'autonomous-agent',
        term: 'Autonomous Agent',
        shortDef:
            'An AI system that perceives its environment, makes decisions, and takes actions without continuous human input.',
        body: 'An autonomous agent is a software entity powered by a large language model (LLM) that operates independently toward a goal. Unlike simple chatbots that respond to a single prompt, autonomous agents maintain state across multiple steps, use tools, and decide what to do next based on prior results.\n\nIn multi-agent systems like SUBCULT OPS, each agent has a distinct persona, memory, and set of capabilities. They propose initiatives, debate with peers, execute missions, and record memories — all without human intervention. The loop runs continuously: perceive → reason → act → reflect.',
        category: 'concept',
        related: ['multi-agent-system', 'agent-orchestration', 'agent-memory'],
    },
    {
        slug: 'agent-chaining',
        term: 'Agent Chaining',
        shortDef:
            'Connecting multiple AI agents in sequence so the output of one becomes the input of the next.',
        body: 'Agent chaining is a design pattern where tasks are decomposed into steps, each handled by a specialized agent. The output of one agent flows into the next, forming a pipeline. This is analogous to Unix pipes but for AI reasoning.\n\nChaining allows you to break complex workflows into manageable units. A research agent gathers information, a synthesis agent summarizes it, and a writing agent produces the final output. Each agent can use different models, prompts, and tools optimized for its role.\n\nCompare this with agent orchestration, where a central coordinator dispatches work to agents dynamically rather than in a fixed sequence.',
        category: 'pattern',
        related: ['agent-orchestration', 'multi-agent-system', 'tool-use'],
    },
    {
        slug: 'tool-use',
        term: 'Tool Use (Function Calling)',
        shortDef:
            'The ability of an LLM to invoke external functions — APIs, databases, code execution — as part of its reasoning.',
        body: 'Tool use, also called function calling, lets an LLM go beyond text generation. Instead of only producing words, the model outputs structured requests to call specific tools — search the web, query a database, run code, or hit an API.\n\nThe model receives a list of available tools with their schemas. During generation, it can choose to call one or more tools, receive the results, and continue reasoning. This grounds LLM output in real data and enables agents to take actions in the world.\n\nMajor providers implement this differently: OpenAI uses a tools array with JSON Schema, Anthropic uses tool_use content blocks, and the MCP protocol standardizes tool discovery across providers.',
        category: 'concept',
        related: ['function-calling', 'mcp-protocol', 'autonomous-agent'],
    },
    {
        slug: 'function-calling',
        term: 'Function Calling',
        shortDef:
            'A provider-specific API feature that lets models output structured calls to predefined functions.',
        body: 'Function calling is the mechanism by which LLM APIs expose tool use. When you send a request to an LLM API, you include a list of function definitions (name, description, parameters as JSON Schema). The model can then respond with a function call instead of — or alongside — text.\n\nOpenAI introduced function calling in June 2023, and it quickly became a standard pattern. Anthropic, Google, and other providers followed with their own implementations. The key challenge is reliability: models must output valid JSON matching the schema, choose the right function, and know when not to call any function at all.\n\nFunction calling is the foundation of agent tool use, enabling everything from web search to code execution to database queries.',
        category: 'concept',
        related: ['tool-use', 'mcp-protocol', 'openclaw'],
    },
    {
        slug: 'mcp-protocol',
        term: 'Model Context Protocol (MCP)',
        shortDef:
            'An open standard by Anthropic for connecting AI models to external tools and data sources.',
        body: 'The Model Context Protocol (MCP) is an open-source standard that provides a universal way for AI applications to connect with external data sources and tools. Think of it as a USB-C port for AI — one standardized interface instead of custom integrations for every tool.\n\nMCP uses a client-server architecture. An MCP client (like Claude Desktop or an agent framework) connects to MCP servers that expose tools, resources, and prompts. The protocol handles discovery, invocation, and response formatting.\n\nThis matters because without MCP, every AI application needs custom code for every tool it uses. With MCP, a tool written once can be used by any compatible client. OpenClaw is one implementation that uses MCP-compatible tool definitions.',
        category: 'concept',
        related: ['tool-use', 'openclaw', 'function-calling'],
    },
    {
        slug: 'multi-agent-system',
        term: 'Multi-Agent System',
        shortDef:
            'An architecture where multiple AI agents collaborate, compete, or coordinate to accomplish tasks.',
        body: 'A multi-agent system (MAS) uses two or more AI agents that interact with each other. Each agent has its own persona, capabilities, and objectives. They can collaborate on shared goals, debate opposing viewpoints, or specialize in different aspects of a workflow.\n\nMulti-agent systems offer several advantages over single-agent approaches: specialization (each agent masters its domain), robustness (failure of one agent does not collapse the system), and emergent behavior (agent interactions produce outcomes no single agent would reach).\n\nSUBCULT OPS runs six agents — Chora, Subrosa, Thaum, Praxis, Mux, and Primus — in a continuous loop. They hold roundtable conversations, vote on proposals, and form memories that shape future decisions. Frameworks like AutoGen, CrewAI, and LangGraph provide building blocks for creating your own multi-agent systems.',
        category: 'concept',
        related: [
            'autonomous-agent',
            'agent-orchestration',
            'roundtable-conversation',
        ],
    },
    {
        slug: 'agent-orchestration',
        term: 'Agent Orchestration',
        shortDef:
            'Coordinating multiple agents dynamically — routing tasks, managing state, and handling failures.',
        body: 'Agent orchestration is the control layer that decides which agent runs, when, and with what context. Unlike simple chaining (A → B → C), an orchestrator can route tasks dynamically based on content, run agents in parallel, handle retries, and aggregate results.\n\nOrchestration patterns range from simple (round-robin, priority queue) to complex (hierarchical delegation, auction-based routing). The orchestrator maintains conversation state, manages tool permissions, and ensures agents have the context they need.\n\nIn SUBCULT OPS, the roundtable orchestrator selects participants, manages turn-taking, handles errors per-turn, and synthesizes artifacts from the conversation. Each conversation format (debate, briefing, brainstorm) has its own orchestration rules.',
        category: 'pattern',
        related: [
            'multi-agent-system',
            'agent-chaining',
            'roundtable-conversation',
        ],
    },
    {
        slug: 'agent-memory',
        term: 'Agent Memory',
        shortDef:
            'Persistent storage that lets agents recall past interactions, learn from experience, and build context over time.',
        body: 'Agent memory is what separates a stateful agent from a stateless chatbot. Memory systems store past interactions, learned facts, and agent reflections so they can be retrieved and used in future reasoning.\n\nCommon memory architectures include: short-term (conversation buffer), long-term (vector database for semantic retrieval), episodic (specific past events), and procedural (learned workflows). Many systems combine multiple types.\n\nIn SUBCULT OPS, agents store memories in PostgreSQL with vector embeddings for semantic search. Memories are tagged by agent, type (observation, reflection, initiative), and importance. A memory archaeology system periodically surfaces old memories for re-evaluation, preventing knowledge from going stale.',
        category: 'concept',
        related: ['autonomous-agent', 'multi-agent-system', 'prompt-engineering'],
    },
    {
        slug: 'prompt-engineering',
        term: 'Prompt Engineering',
        shortDef:
            'The practice of designing inputs to LLMs to reliably produce desired outputs.',
        body: 'Prompt engineering is the craft of writing instructions, examples, and context that guide an LLM toward useful behavior. It ranges from simple (clear instructions) to sophisticated (few-shot examples, chain-of-thought reasoning, structured output formats).\n\nKey techniques include: system prompts (persistent instructions), few-shot examples (showing desired input/output pairs), chain-of-thought (asking the model to reason step by step), and output formatting (JSON, XML, or structured templates).\n\nFor agent systems, prompt engineering is critical. Each agent needs a system prompt that defines its persona, capabilities, and constraints. Tool descriptions must be precise enough for the model to use them correctly. The quality of prompts directly determines agent reliability.',
        category: 'pattern',
        related: ['autonomous-agent', 'tool-use', 'llm-routing'],
    },
    {
        slug: 'llm-routing',
        term: 'LLM Routing',
        shortDef:
            'Directing requests to different language models based on task requirements, cost, or availability.',
        body: 'LLM routing is the practice of sending different requests to different models based on criteria like task complexity, cost, latency, or model capabilities. Instead of using one model for everything, a router selects the best model for each request.\n\nRouting strategies include: capability-based (use GPT-4 for reasoning, Claude for analysis), cost-based (use smaller models for simple tasks), fallback chains (try the preferred model, fall back to alternatives on failure), and load balancing.\n\nOpenRouter provides API-level routing across dozens of models. SUBCULT OPS uses a models array for native fallback routing — if the primary model fails or returns empty, the system automatically tries the next model in the list. This ensures high availability without manual intervention.',
        category: 'pattern',
        related: ['model-fallback', 'openrouter', 'ollama'],
    },
    {
        slug: 'model-fallback',
        term: 'Model Fallback',
        shortDef:
            'Automatically switching to an alternative LLM when the primary model fails, is unavailable, or returns empty.',
        body: 'Model fallback is a reliability pattern where your system tries multiple models in order until one succeeds. If model A times out, returns an error, or produces empty output, the system automatically retries with model B, then model C.\n\nThis is essential for production agent systems. No single model has 100% uptime, and different models have different failure modes. A well-designed fallback chain might try: local Ollama model → Claude via OpenRouter → GPT-4 via OpenRouter → smaller fallback model.\n\nImplementation details matter. The OpenRouter SDK supports a models array for native API-level fallback (limited to 3 models). For longer chains, client-side fallback logic tries each model individually. Empty response detection is critical — some models return 200 OK with empty content.',
        category: 'pattern',
        related: ['llm-routing', 'openrouter', 'ollama'],
    },
    {
        slug: 'openclaw',
        term: 'OpenClaw',
        shortDef:
            'An open-source gateway that connects AI agents to tools and skills across messaging platforms.',
        body: 'OpenClaw is an open-source AI gateway that provides agents with access to tools (called skills) across multiple messaging channels — Discord, Telegram, WhatsApp, and more. It acts as middleware between your agent and the outside world.\n\nThe gateway exposes an OpenAI-compatible HTTP API, so any agent framework that speaks the OpenAI protocol can use OpenClaw as a backend. Skills are not directly callable via API — instead, you send a chat message that prompts the agent to invoke the appropriate skill.\n\nSUBCULT OPS uses OpenClaw to give agents access to web search, file operations, and other capabilities. The gateway runs as a systemd service and communicates over WebSocket (primary) and HTTP (secondary).',
        category: 'tool',
        related: ['mcp-protocol', 'tool-use', 'function-calling'],
    },
    {
        slug: 'openrouter',
        term: 'OpenRouter',
        shortDef:
            'A unified API gateway that provides access to hundreds of LLMs from multiple providers through a single endpoint.',
        body: 'OpenRouter is an API service that aggregates language models from OpenAI, Anthropic, Google, Meta, Mistral, and dozens of other providers behind a single API. You send requests to one endpoint and specify which model you want.\n\nBeyond simple proxying, OpenRouter provides: model fallback (try multiple models in sequence), provider routing (choose the fastest or cheapest provider for a given model), usage tracking, and rate limit management.\n\nSUBCULT OPS uses the OpenRouter SDK (@openrouter/sdk) for all cloud LLM calls. The models array feature enables native fallback routing — if one model fails, the API automatically tries the next. This is combined with client-side fallback for longer model chains.',
        category: 'tool',
        related: ['llm-routing', 'model-fallback', 'ollama'],
    },
    {
        slug: 'ollama',
        term: 'Ollama',
        shortDef:
            'A tool for running open-source LLMs locally — download, configure, and serve models on your own hardware.',
        body: 'Ollama makes it easy to run large language models on local hardware. It handles model downloading, quantization, and serving behind an API. You can run models like Llama, Mistral, Qwen, and DeepSeek without sending data to external services.\n\nOllama provides two API styles: a native API (/api/chat) with features like think mode control, and an OpenAI-compatible API (/v1/chat/completions) for drop-in compatibility with existing tools. The native API is preferred for models like Qwen that need specific parameter control.\n\nIn hybrid architectures, Ollama handles tasks that work well with local models (simple generation, classification) while cloud providers handle tasks needing frontier capabilities (complex reasoning, tool use). SUBCULT OPS uses Ollama as the first model in its fallback chain.',
        category: 'tool',
        related: ['openrouter', 'llm-routing', 'model-fallback'],
    },
    {
        slug: 'roundtable-conversation',
        term: 'Roundtable Conversation',
        shortDef:
            'A structured multi-agent dialogue format where agents take turns discussing a topic, guided by an orchestrator.',
        body: 'A roundtable conversation is a structured dialogue format used in multi-agent systems. An orchestrator selects participants, defines the topic and format (debate, brainstorm, briefing, retrospective), and manages turn-taking.\n\nEach participant contributes based on their persona and the conversation context. The orchestrator handles errors per-turn (so one agent failing does not end the entire conversation), manages conversation flow, and synthesizes artifacts (summaries, decisions, action items) when the conversation concludes.\n\nSUBCULT OPS supports 16 conversation formats and runs roundtable sessions continuously. Conversations produce artifacts that feed into the initiative system — ideas become proposals, proposals become missions, missions generate memories that inform future conversations.',
        category: 'pattern',
        related: [
            'multi-agent-system',
            'agent-orchestration',
            'autonomous-agent',
        ],
    },
];

export const glossaryLabelMap: Record<string, string> = Object.fromEntries(
    glossary.map(e => [e.slug, e.term])
);
