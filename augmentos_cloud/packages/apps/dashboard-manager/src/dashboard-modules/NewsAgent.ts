import { Agent } from '../../../../agents/AgentInterface';
import axios from 'axios';
import { PromptTemplate } from "@langchain/core/prompts";
import { JsonOutputFunctionsParser } from 'langchain/output_parsers';
import { LLMProvider } from '../../../../utils/LLMProvider'; // Utility to easily swap LLMs

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
  public agentType = 'news';

  /**
   * Main method from the `Agent`