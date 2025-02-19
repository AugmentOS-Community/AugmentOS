import { AzureChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatVertexAI } from "@langchain/google-vertexai";
import { OPENAI_API_KEY, ANTHROPIC_API_KEY, LLM_MODEL, LLMModel, AZURE_OPENAI_API_INSTANCE_NAME, AZURE_OPENAI_API_DEPLOYMENT_NAME } from "@augmentos/config";

export class LLMProvider {
  static getLLM() {
    const model = LLM_MODEL || 'gpt-4o'; // Default to GPT-4

    switch (model) {
      case LLMModel.GPT4:
        return new AzureChatOpenAI({
          modelName: model,
          temperature: 0.3,
          maxTokens: 300,
          openAIApiKey: OPENAI_API_KEY,
          azureOpenAIApiInstanceName: AZURE_OPENAI_API_INSTANCE_NAME,
          azureOpenAIApiDeploymentName: AZURE_OPENAI_API_DEPLOYMENT_NAME,
          azureOpenAIApiVersion: "2024-10-01",
        });

      case 'claude-3':
        return new ChatAnthropic({
          modelName: model,
          temperature: 0.3,
          maxTokens: 300,
          anthropicApiKey: ANTHROPIC_API_KEY,
        });

      case 'gemini-pro':
        return new ChatVertexAI({
          modelName: model,
          temperature: 0.3,
        });

      default:
        throw new Error(`Unsupported LLM model: ${model}`);
    }
  }
}
