import { Agent } from './AgentInterface';
import { PromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { LLMProvider } from '../utils/LLMProvider';
import { SearchToolForAgents } from './tools/SearchToolForAgents';

interface QuestionAnswer {
  insight: string;
}

const agentPromptBlueprint = `You are an AI assistant that answers questions or uncertainties in conversations.
Use available tools when needed and follow these rules:

1. Analyze the conversation context for explicit questions or implicit uncertainties.
2. Use the "search" tool for factual verification or when additional information is needed.
3. Always maintain brevity (under 15 words) in final answers.
4. If no valid question exists, return "null".
5. When you need to use a tool, use this exact format:
   Action: search
   Action Input: {{"searchKeyword": "<query>", "includeImage": <true/false>}}
6. When you have enough information to answer, output your final answer on a new line prefixed by "Final Answer:" followed immediately by a JSON object exactly like:
   {{"insight": "<concise answer>"}}
7. Do not output any other text.

Conversation Context:
{input}
{tools}
{tool_names}
{agent_scratchpad}`;

export class QuestionAnswererAgent implements Agent {
  public agentId = 'question_answerer';
  public agentName = 'QuestionAnswerer';
  public agentDescription = 'Answers questions using verifiable knowledge and search tools';
  public agentPrompt = agentPromptBlueprint;
  public agentTools = [new SearchToolForAgents()];

  /**
   * Parses the final LLM output.
   * If the output contains a "Final Answer:" marker, the text after that marker is parsed as JSON.
   * Expects a JSON object with an "insight" key.
   */
  private parseOutput(text: string): QuestionAnswer {
    const finalMarker = "Final Answer:";
    if (text.includes(finalMarker)) {
      text = text.split(finalMarker)[1].trim();
    }
    try {
      const parsed = JSON.parse(text);
      // If the object has an "insight" key, return it.
      if (typeof parsed.insight === "string") {
        return { insight: parsed.insight };
      }
      // If the output is a tool call (e.g. has searchKeyword) or missing insight, return a null insight.
      if (parsed.searchKeyword) {
        return { insight: "null" };
      }
    } catch (e) {
      // Fallback attempt to extract an "insight" value from a string
      const match = text.match(/"insight"\s*:\s*"([^"]+)"/);
      if (match) {
        return { insight: match[1] };
      }
    }
    return { insight: "null" };
  }

  public async handleContext(userContext: Record<string, any>): Promise<any> {
    try {
      const conversationContext = userContext.conversation_context || "";
      if (!conversationContext.trim()) return { insight: "null" };

      const llm = LLMProvider.getLLM();
      const prompt = new PromptTemplate({
        template: this.agentPrompt,
        inputVariables: ["input", "tools", "tool_names", "agent_scratchpad"],
      });
      
      const agent = await createReactAgent({
        llm,
        tools: this.agentTools,
        prompt,
      });

      // Increase maxIterations so that the agent can complete all required steps.
      const executor = new AgentExecutor({
        agent,
        tools: this.agentTools,
        maxIterations: 10,
        verbose: process.env.NODE_ENV === 'development',
      });

      const toolNames = this.agentTools.map(tool => tool.name || "unknown");
      const agentScratchpad = ""; // initial scratchpad is empty

      const result = await executor.invoke({ 
        input: conversationContext,
        tools: this.agentTools,
        tool_names: toolNames,
        agent_scratchpad: agentScratchpad,
      });

      console.log(`[QuestionAnswererAgent] Result: ${JSON.stringify(result, null, 2)}`);
      return this.parseOutput(result.output);
    } catch (err) {
      console.error('[QuestionAnswererAgent] Error:', err);
      return { insight: "null" };
    }
  }
}
