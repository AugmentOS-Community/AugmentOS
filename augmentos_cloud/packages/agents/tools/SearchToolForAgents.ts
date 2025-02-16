import { Tool } from '@langchain/core/tools';

interface SearchInput {
  searchKeyword: string;
  includeImage?: boolean;
}

interface OrganicResult {
  position: number;
  title: string;
  snippet: string;
}

/**
 * SearchToolForAgents is a LangChain Tool that searches for additional information
 * using SerpAPI directly via HTTP fetch.
 *
 * To call this tool, pass a JSON string with the following format:
 * {
 *   "searchKeyword": "your search query",
 *   "includeImage": false  // optional, defaults to false
 * }
 */
export class SearchToolForAgents extends Tool {
  name = 'search';
  description = 'Searches for additional information for an entity using SerpAPI.';

  // Replace with your actual SerpAPI key.
  private apiKey: string = "1e6ffdde675fd92a8fa47cc47a2afb66b7264fbd18c1d69a46716607e09fa391";

  async _call(input: string): Promise<string> {
    console.log(`[SearchToolForAgents] Input: ${input}`);

    // Parse the input JSON; if parsing fails, treat the input as the search keyword.
    let params: SearchInput;
    try {
      params = JSON.parse(input);
    } catch (e) {
      params = { searchKeyword: input, includeImage: false };
    }

    const { searchKeyword, includeImage = false } = params;

    // Construct the URL with query parameters.
    const url = new URL("https://serpapi.com/search");
    url.searchParams.append("engine", "google");
    url.searchParams.append("q", searchKeyword);
    url.searchParams.append("api_key", this.apiKey);
    url.searchParams.append("num", "5");
    url.searchParams.append("hl", "en");
    url.searchParams.append("gl", "us");

    try {
      // Perform the HTTP GET request.
      const response = await fetch(url.toString());
      const result = await response.json();

      // Process organic results.
      const organicResults: OrganicResult[] = (result.organic_results || []).map((item: any) => ({
        position: item.position,
        title: item.title,
        snippet: item.snippet
      }));

      // Optionally include an image URL if requested and available.
      let imageUrl: string | undefined = undefined;
      if (includeImage && result.image_results && result.image_results.length > 0) {
        imageUrl = result.image_results[0].thumbnail;
      }

      const formattedResponse = {
        organicResults,
        ...(includeImage && imageUrl ? { imageUrl } : {})
      };

      console.log(
        `[SearchToolForAgents] Formatted Response: ${JSON.stringify(formattedResponse, null, 2)}`
      );

      return JSON.stringify(formattedResponse, null, 2);
    } catch (error) {
      console.error(`Error during search for "${searchKeyword}":`, error);
      return JSON.stringify({
        url: `https://www.google.com/search?q=${encodeURIComponent(searchKeyword)}`,
        snippet: `Error occurred while searching for ${searchKeyword}.`,
      });
    }
  }
}
