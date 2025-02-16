import { Agent } from './AgentInterface';
import { PromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { LLMProvider } from '../utils/LLMProvider';
import { SearchToolForAgents } from './tools/SearchToolForAgents';

interface QuestionAnswer {
  insight: string;
}

const agentPromptBlueprint = `You are a Devil's Advocate AI assistant.
Your task is to assess the point of view taken in the conversation and steel-man a contrary position. You purposefully disagree with the interlocutors' arguments to stimulate thought. Provide your argument in simple, easy to understand language.

Instructions:
1. Identify a main argument or point of view in the conversation. If none exists, return "null".
2. Think of insightful perspectives and generate a devil's advocate response.
3. Use the "search" tool for factual verification if needed. When using a tool, use the exact format:
   Action: search
   Action Input: {{"searchKeyword": "<query>", "includeImage": <true/false>}}
4. Maintain brevity (under 15 words) in your final answer.
5. When you have enough information, output your final answer on a new line prefixed by "Final Answer:" followed immediately by a JSON object exactly like:
   {{"insight": "<concise answer>"}}
6. Do not output any other text.

Additional Guidelines:
- Agent Insight Type: assess the point of view being taken in the conversation and steel-man a contrary position.
- Agent Plan: 1. Find the main argument. 2. Generate a devil's advocate response.
- Validation Criteria: give an interesting perspective but not too controversial.
- Proactive Tool Description: offer a devil's advocate opinion when useful.
- Proactive Tool Example: 
   Conversation: Transcript mentions "Climate change is a hoax."
   Insight: Most scientists confirm climate change's reality; evidence is in global trends.
- Examples:
   1. Conversation: Transcript mentions "Climate change is a hoax."
      Insight: Most scientists confirm climate change's reality; evidence is in global trends.
   2. Conversation: Transcript mentions "Vaccines cause autism".
      Insight: Numerous studies show no vaccine-autism link; vaccines prevent disease outbreaks.
   3. Conversation: Transcript mentions "Artificial intelligence will replace all human jobs."
      Insight: AI will create new jobs and industries, not just replace old ones.

Conversation Context:
{input}
{tools}
{tool_names}
{agent_scratchpad}`;


export class DevilsAdvocateAgent implements Agent {
  public agentId = 'devils_advocate';
  public agentName = 'DevilsAdvocate';
  public agentDescription = 'Provides a devil\'s advocate perspective to challenge current viewpoints';
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
      if (typeof parsed.insight === "string") {
        return { insight: parsed.insight };
      }
      if (parsed.searchKeyword) {
        return { insight: "null" };
      }
    } catch (e) {
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

      const toolNames = this.agentTools.map(tool => tool.name || "unknown");
      const agentScratchpad = "";

      const result = await executor.invoke({
        input: conversationContext,
        tools: this.agentTools,
        tool_names: toolNames,
        agent_scratchpad: agentScratchpad,
      });

      console.log(`[DevilsAdvocateAgent] Result: ${JSON.stringify(result, null, 2)}`);
      return this.parseOutput(result.output);
    } catch (err) {
      console.error('[DevilsAdvocateAgent] Error:', err);
      return { insight: "null" };
    }
  }
}
