import { Agent } from './AgentInterface';
import { PromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { LLMProvider } from '../utils/LLMProvider';

interface IdeaResponse {
  insight: string;
}

const agentPromptBlueprint = `You are an IdeaGenerator AI assistant.
Your task is to propose a novel idea using context from the current conversation that stimulates further thought. 
Your idea should be somewhat relevant to the conversation, expressed in simple and easy to understand language, and always posed as a question.

Instructions:
1. Read the conversation thus far.
2. Think deeply about a contextually relevant, provocative question that the conversationalists haven't considered yet.
3. Do not propose something broad.
4. Maintain brevity (under 15 words) in your final answer.
5. When you have enough information, output your final answer on a new line prefixed by "Final Answer:" followed immediately by a JSON object exactly like:
   {{"insight": "<your idea as a question>"}}
6. If no valid idea can be generated, output "null".
7. Do not output any other text.

Conversation Context:
{input}
{tools}
{tool_names}
{agent_scratchpad}`;

export class IdeaGeneratorAgent implements Agent {
  public agentId = 'idea_generator';
  public agentName = 'IdeaGenerator';
  public agentDescription = 'Proposes novel ideas as thought-provoking questions based on the conversation context';
  public agentPrompt = agentPromptBlueprint;
  // This agent does not require any tools.
  public agentTools: any[] = [];

  /**
   * Parses the final LLM output.
   * If the output contains a "Final Answer:" marker, the text after that marker is parsed as JSON.
   * Expects a JSON object with an "insight" key.
   */
  private parseOutput(text: string): IdeaResponse {
    const finalMarker = "Final Answer:";
    if (text.includes(finalMarker)) {
      text = text.split(finalMarker)[1].trim();
    }
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.insight === "string") {
        return { insight: parsed.insight };
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

      const toolNames: string[] = this.agentTools.map(tool => tool.name || "unknown");
      const agentScratchpad = "";

      const result = await executor.invoke({
        input: conversationContext,
        tools: this.agentTools,
        tool_names: toolNames,
        agent_scratchpad: agentScratchpad,
      });

      console.log(`[IdeaGeneratorAgent] Result: ${JSON.stringify(result, null, 2)}`);
      return this.parseOutput(result.output);
    } catch (err) {
      console.error('[IdeaGeneratorAgent] Error:', err);
      return { insight: "null" };
    }
  }
}
