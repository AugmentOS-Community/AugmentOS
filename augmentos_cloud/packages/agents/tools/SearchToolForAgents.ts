// SearchTool.ts

import { Tool } from '@langchain/core/tools';
import { SerpAPI } from '@langchain/community/tools/serpapi';

interface SearchInput {
  searchKeyword: string;
  includeImage?: boolean;
}

/**
 * SearchTool is a LangChain Tool class that searches for additional information
 * about an entity using SerpAPI.
 *
 * To call this tool, pass a JSON string with the following format:
 * {
 *   "searchKeyword": "your search query",
 *   "includeImage": false  // optional, defaults to false
 * }
 *
 * The tool returns a JSON string with the search result details.
 */
export class SearchToolForAgents extends Tool {
  name = 'search';
  description = 'Searches for additional information for an entity using SerpAPI.';
  private serpApi: SerpAPI;

  constructor() {
    super();
    this.serpApi = new SerpAPI(process.env.SERPAPI_API_KEY || '');
  }

  /**
   * The main method to run the tool.
   * @param input A JSON string representing an object with searchKeyword and optionally includeImage.
   * @returns A JSON string with keys: url, snippet, and optionally imageUrl.
   */
  async _call(input: string): Promise<string> {
    let params: SearchInput;
    try {
      // Parse the input JSON string.
      params = JSON.parse(input);
    } catch (e) {
      // If parsing fails, treat the entire input as the search query.
      params = { searchKeyword: input, includeImage: false };
    }

    const { searchKeyword, includeImage = false } = params;

    try {
      // Invoke the SerpAPI call with the search query.
      const result = await this.serpApi.invoke(searchKeyword);
      const organicResults = result.organic_results || [];
      let url = `https://www.google.com/search?q=${encodeURIComponent(searchKeyword)}`;
      let snippet = `No relevant information found for ${searchKeyword}.`;

      if (organicResults.length > 0) {
        url = organicResults[0].link;
        snippet = organicResults[0].snippet || snippet;
      }

      let imageUrl: string | undefined = undefined;
      if (includeImage && result.image_results && result.image_results.length > 0) {
        imageUrl = result.image_results[0].thumbnail;
      }

      // Return the result as a JSON string.
      return JSON.stringify({ url, snippet, imageUrl });
    } catch (error) {
      console.error(`Error during search for "${searchKeyword}":`, error);
      return JSON.stringify({
        url: `https://www.google.com/search?q=${encodeURIComponent(searchKeyword)}`,
        snippet: `Error occurred while searching for ${searchKeyword}.`,
      });
    }
  }
}
