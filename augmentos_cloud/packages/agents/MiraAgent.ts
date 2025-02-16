import { Agent } from "./AgentInterface";
import { PromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { LLMProvider } from "../utils/LLMProvider";
import { SearchToolForAgents } from "./tools/SearchToolForAgents";

const agentPromptBlueprint = `You are an intelligent assistant that is running on the smart glasses of a user. They sometimes directly talk to you by saying a wake word and then making query. Answer the User Query to the best of your ability. The query may contain some extra unrelated speech not related to the query - ignore any noise to answer just the user's intended query. Make your answer concise, leave out filler words, make the answer high entropy, answer in 10 words or less (no newlines), but don't be overly brief (e.g. for weather, give temp. and rain). Use telegraph style writing.

Utilize available tools when necessary and adhere to the following guidelines:
1. Invoke the "search" tool for confirming facts or retrieving extra details.
2. Keep your final answer brief (fewer than 15 words).
3. When calling a tool, use this precise format:
   Action: search
   Action Input: {{"searchKeyword": "<query>", "includeImage": <true/false>}}
4. Once ready, output your final answer on a new line starting with "Final Answer:" immediately followed by a JSON object exactly as follows:
   {{"insight": "<succinct answer>"}}
5. As soon as you receive a successful response, you must return 'Final Answer: Running: <user facing custom function string>'
6. If the query is empty, return "Final Answer: No query provided."

User Query:
{query}

Live Conversation Transcript:
{transcript_history}
Prior Inputs & Responses:
{insight_history}

Tools:
{tools}
Tool Names:
{tool_names}
Agent Scratchpad:
{agent_scratchpad}`;

export class MiraAgent implements Agent {
  public agentId = "mira_agent";
  public agentName = "MiraAgent";
  public agentDescription =
    "Answers user queries from smart glasses using conversation context and history.";
  public agentPrompt = agentPromptBlueprint;
  public agentTools = [new SearchToolForAgents()];

  /**
   * Parses the LLM output. Expects a final answer string starting with "Final Answer:".
   */
  private parseOutput(text: string): string {
    const finalMarker = "Final Answer:";
    if (text.includes(finalMarker)) {
      return text.split(finalMarker)[1].trim();
    }
    return text.trim();
  }

  public async handleContext(userContext: Record<string, any>): Promise<any> {
    try {
      // Extract required fields from the userContext.
      const transcriptHistory = userContext.transcript_history || "";
      const insightHistory = userContext.insight_history || "";
      const query = userContext.query || "";

      // If query is empty, return default response.
      if (!query.trim()) {
        return { result: "No query provided." };
      }

      const llm = LLMProvider.getLLM();
      const prompt = new PromptTemplate({
        template: this.agentPrompt,
        inputVariables: ["transcript_history", "insight_history", "query"],
      });

      const agent = await createReactAgent({
        llm,
        tools: this.agentTools,
        prompt,
      });

      const executor = new AgentExecutor({
        agent,
        tools: this.agentTools,
        maxIterations: 5,
        verbose: process.env.NODE_ENV === "development",
      });

      const toolNames = this.agentTools.map((tool) => tool.name || "unknown");
      const agentScratchpad = "";

      const result = await executor.invoke({
        transcript_history: transcriptHistory,
        insight_history: insightHistory,
        query,
        tools: this.agentTools,
        tool_names: toolNames,
        agent_scratchpad: agentScratchpad,
      });

      const parsedResult = this.parseOutput(result.output);
      return { result: parsedResult };
    } catch (err) {
      console.error("[MiraAgent] Error:", err);
      return { result: "Error processing query." };
    }
  }
}
