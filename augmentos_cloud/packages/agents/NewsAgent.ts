import { Agent } from './AgentInterface';
import axios from 'axios';
import { PromptTemplate } from "@langchain/core/prompts";
import { JsonOutputFunctionsParser } from 'langchain/output_parsers';
import { LLMProvider } from '../utils/LLMProvider'; // Utility to easily swap LLMs

/** 
 * Minimal interface for a news article as returned by NewsAPI.
 */
interface Article {
  title: string;
  description: string;
  publishedAt: string;
}

/** 
 * The JSON structure we expect from the model's output. 
 */
interface NewsSummaries {
  news_summaries: string[];
}

/**
 * The NewsSummarizeAgent fetches recent news articles and generates
 * short bullet summaries for each, returning them as a list of strings.
 */
export class NewsAgent implements Agent {
  public agentId = 'news_summarize';
  public agentName = 'News Summarizer';
  public agentDescription = 'Fetches and summarizes recent news articles';

  /**
   * Main method from the `Agent` interface.
   * Calls an LLM (GPT, Claude, etc.) via LangChain to summarize the latest news.
   */
  public async handleContext(userContext: Record<string, any>): Promise<any> {
    try {
      // 1) Fetch the articles
      const articles = await this.fetchNewsArticles();

      if (!articles.length) {
        console.log(`[NewsSummarizeAgent] No articles found.`);
        return { news_summaries: [] };
      }

      // 2) Run the LangChain prompt + LLM model
      const summaries = await this.summarizeArticlesWithLLM(articles);
      return summaries || { news_summaries: [] };

    } catch (err) {
      console.error(`[NewsSummarizeAgent] Error handling context:`, err);
      return { news_summaries: [] };
    }
  }

  /**
   * Fetch top headlines (tech news, in this example) from the NewsAPI.
   * Replace the query or category as you wish. 
   */
  private async fetchNewsArticles(): Promise<Article[]> {
    const apiKey = process.env.NEWS_API_KEY || 'YOUR_NEWS_API_KEY_HERE';
    const url = `https://newsapi.org/v2/top-headlines?q=Tech&apiKey=${apiKey}`;
    
    try {
      const response = await axios.get(url);
      const data = response.data || {};
      const rawArticles = data.articles || [];

      // Filter each article to only include relevant keys
      return rawArticles.map((article: any) => ({
        title: article.title || '',
        description: article.description || '',
        publishedAt: article.publishedAt || '',
      }));
    } catch (err) {
      console.error('[NewsSummarizeAgent] Error fetching news articles:', err);
      return [];
    }
  }

  /**
   * Uses LangChainJS to process articles via an LLM and return structured summaries.
   */
  private async summarizeArticlesWithLLM(articles: Article[]): Promise<NewsSummaries | null> {
    try {
      // Initialize LLM via `LLMProvider`
      const llm = LLMProvider.getLLM(); // Returns a `ChatOpenAI` or another model

      // Define the structured output parser (forces JSON format)
      const outputParser = new JsonOutputFunctionsParser({
        argsOnly: true,
      });

      // Define the prompt
      const prompt = new PromptTemplate({
        template: `
You are an AI assistant that provides a one-liner summary for each news article.

You are given a context of news articles (title, description, publishedAt) below.

Your output must be valid JSON with a single key:
"news_summaries" — an array of one-line summaries, each corresponding to one news article.

News Articles Context:
{news_articles}

Requirements:
- Each summary must be under 20 characters.
- Each summary should capture the key point of the corresponding breaking news.
- Output exactly one summary per news article, in the order of the news articles provided.

Output Example:
{{
  "news_summaries": [
    "Earthquake in SF.",
    "Market dips amid fears."
  ]
}}
        `,
        inputVariables: ['news_articles'],
      });

      // Format prompt with news articles
      const formattedPrompt = await prompt.format({
        news_articles: JSON.stringify(articles, null, 2),
      });

      // Run LLM
      const response = await llm.invoke(formattedPrompt);
      const responseText = response.content.toString();
      
      // Parse JSON output and ensure it matches NewsSummaries interface
      const parsed = await outputParser.parse(responseText) as { news_summaries?: string[] };
      return {
        news_summaries: parsed.news_summaries || []
      };

    } catch (err) {
      console.error('[NewsSummarizeAgent] Error calling LangChain LLM:', err);
      return null;
    }
  }
}
