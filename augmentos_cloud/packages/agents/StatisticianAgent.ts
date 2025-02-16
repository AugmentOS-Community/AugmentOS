import { Agent } from './AgentInterface';
import { PromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { LLMProvider } from '../utils/LLMProvider';
import { SearchToolForAgents } from './tools/SearchToolForAgents';

interface StatisticResponse {
  insight: string;
}

const agentPromptBlueprint = `You are a Statistician AI assistant.
Your task is to generate insights focusing on statistics and quantitative data.
Instructions:
1. Identify trends, correct inaccurate claims, and leverage quantitative data from the conversation.
2. Determine the single most important statistic or data point needed to generate the insight.
3. Use reputable sources (e.g., Statista, official statistics, academic publications) when necessary via the "search" tool.
4. If you don't have a strong statistic or data to provide, output "null" (do not provide watered-down or irrelevant stats).
5. Use the "search" tool for factual verification when needed. When using a tool, follow the exact format:
   Action: search
   Action Input: {{"searchKeyword": "<query>", "includeImage": <true/false>}}
6. Maintain brevity (under 15 words) in your final answer.
7. When you have enough information, output your final answer on a new line prefixed by "Final Answer:" followed immediately by a JSON object exactly like:
   {{"insight": "<concise insight>"}}
8. Do not output any other text.

Additional Guidelines:
- Agent Insight Type: generate insights which focus on statistics and quantitative data.
- Agent Plan: 1. Describe the general insight to generate. 2. Identify the most important quantitative data needed.
- Validation Criteria: must contain quantitative data.
- Proactive Tool Description: provide statistics, graphs, and data when useful.
- Proactive Tool Example:
   Conversation: Transcript compares the number of CS students in US and China.
   Insight: US: 6% HS students in CS, China: <1% K-12 in programming.
- Examples:
   1. Conversation: Transcript compares the number of CS students in US and China.
      Insight: US: 6% HS students in CS, China: <1% K-12 in programming.
   2. Conversation: Transcript mentions "Should we ban plastic straws?".
      Insight: 500mil straws in the US/day, 8.3bil straws pollute the world's beaches.
   3. Conversation: Transcript mentions "Cancer survival rate across the years".
      Insight: Cancer survival rate: 49% in mid-70s to 68% now.

Conversation Context:
{input}
{tools}
{tool_names}
{agent_scratchpad}`;

export class StatisticianAgent implements Agent {
  public agentId = 'statistician';
  public agentName = 'Statistician';
  public agentDescription = 'Generates insights using quantitative data and statistics from the conversation context';
  public agentPrompt = agentPromptBlueprint;
  public agentTools = [new SearchToolForAgents()];

  /**
   * Parses the final LLM output.
   * If the output contains a "Final Answer:" marker, the text after that marker is parsed as JSON.
   * Expects a JSON object with an "insight" key.
   */
  private parseOutput(text: string): StatisticResponse {
    const finalMarker = "Final Answer:";
    if (text.includes(finalMarker)) {
      text = text.split(finalMarker)[1].trim();
    }
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.insight === "string") {
        return { insight: parsed.insight };
      }
      // If output suggests a tool call, output null.
      if (parsed.searchKeyword) {
        return { insight: "null" };
      }
    } catch (e) {
      // Attempt to extract "insight" via regex if JSON parsing fails.
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

      const executor = new AgentExecutor({
        agent,
        tools: this.agentTools,
        maxIterations: 10,
        verbose: process.env.NODE_ENV === 'development',
      });

      const toolNames: string[] = this.agentTools.map(tool => tool.name || "unknown");
      const agentScratchpad = "";

      const result = await executor.invoke({
        input: conversationContext,
        tools: this.agentTools,
        tool_names: toolNames,
        agent_scratchpad: agentScratchpad,
      });

      console.log(`[StatisticianAgent] Result: ${JSON.stringify(result, null, 2)}`);
      return this.parseOutput(result.output);
    } catch (err) {
      console.error('[StatisticianAgent] Error:', err);
      return { insight: "null" };
    }
  }
}
