from langchain.prompts import PromptTemplate
from langchain.schema import HumanMessage
from langchain.chat_models import ChatOpenAI
from langchain.output_parsers import PydanticOutputParser
from langchain.schema import OutputParserException
from pydantic import BaseModel, Field
from agents.agent_utils import format_list_data
from server_config import openai_api_key
from agents.search_tool_for_agents import (
    asearch_google_knowledge_graph,
    search_url_for_entity_async,
)
from Modules.LangchainSetup import *
import asyncio

proactive_rare_word_agent_prompt_blueprint = """
# Objective
Your role is to identify and define "Rare Entities (REs)" in a transcript. Types of REs include rare words, jargons, adages, concepts, people, places, organizations, events etc that are not well known to the average high schooler, in accordance to current trends. You can also intelligently detect REs that are described in the conversation but not explicitly mentioned.

# Criteria for Rare Entities in order of importance
1. Rarity: Select entities that are unlikely for an average high schooler to know. Well known entities are like Fortune 500 organizations, worldwide-known events, popular locations, and entities popularized by recent news or events such as "COVID-19", "Bitcoin", or "Generative AI".
2. Utility: Definition should help a user understand the conversation better and achieve their goals.
3. No Redundancy: Exclude definitions if already defined in the conversation.
4. Complexity: Choose phrases with non-obvious meanings, such that their meaning cannot be derived from simple words within the entity name, such as "Butterfly Effect" which has a totally different meaning from its base words, but not "Electric Car" nor "Lane Keeping System" as they're easily derived.
5. Definability: Must be clearly and succinctly definable in under 10 words.
6. Existance: Don't select entities if you have no knowledge of them

# Conversation Transcript:
<Transcript start>{conversation_context}<Transcript end>

# Output Guidelines:
Output an array of the entities using the following template: `[{{ name: string, definition: string, search_keyword: string }}]`
- name is the RE name shown to the user, if the name is mistranscribed, autocorrect it into the most well known form with proper spelling, capitalization and punctuation
- definition is concise (< 12 words) and uses simple words
- search_keyword is the best specific Internet search keywords to search for the RE, you might need to use their complete official RE name, or autocorrect RE name, or add additional context keywords (like the entity type) for better searchability, especially if the entity is ambiguous or has multiple meanings. Additionally, for rare words, add "definition" to the search keyword.
- it's OK to output an empty array - most of the time, the array will be empty, only include items if the fit all the requirements

## Additional Guidelines:
- Only define NOUNS.
- Select RE that have an entry in an encyclopedia, wikipedia, dictionary, or other reference material.
- Do not select a RE you yourself are unfamiliar with, you can infer the implied entity or autocorrect mistransribed names only if you are 99% confident, never select an entity if you will define it as "Unknown Entity".
- Multiple REs can be defined from one phrase, for example, "The Lugubrious Game" is a candidate to define, the rare word "lugubrious" is also a candidate.
- Limit results to {number_of_definitions} REs.
- Examples:
    - Completing incomplete name example: Conversation mentions "Balmer" and "Microsoft", the keyword is "Steve Balmer + person", and the name would be "Steve Balmer" because it is complete.
    - Replacing unofficial name example: Conversation mentions "Clay Institute", the keyword is "Clay Mathematics Institute + organization", using the official name.
    - Add context example: Conversation mentions "Theory of everything", the keyword needs context keywords such as "Theory of everything + concept", because there is a popular movie with the same name. 
    - Autocorrect transcript example: Conversation mentions "Coleman Sachs" in the context of finance, if you are confident it is supposed to be "Goldman Sachs", you autocorrect it and define "Goldman Sachs".

## Recent Definitions:
These REs have already been defined so don't define them again:
{definitions_history}

## Example Output:
entities: [{{ name: "80/20 Rule", definition: "Productivity concept; Majority of results come from few causes", search_keyword: "80/20 Rule + concept" }}]

{format_instructions} 
If there are no relevant entities, output an empty array.
"""
# 6. Searchability: Likely to have a specific and valid reference source: Wikipedia page, dictionary entry etc.
# - Entity names should be quoted from the conversation, so the output definitions can be referenced back to the conversation.


class Entity(BaseModel):
    name: str = Field(
        description="entity name",
    )
    definition: str = Field(
        description="entity definition",
    )
    search_keyword: str = Field(
        description="keyword to search for entity on the Internet",
    )


class ConversationEntities(BaseModel):
    entities: list[Entity] = Field(
        description="list of entities and their definitions", default=[]
    )


proactive_rare_word_agent_query_parser = PydanticOutputParser(
    pydantic_object=ConversationEntities
)


def run_proactive_definer_agent(
    conversation_context: str, definitions_history: list = []
):
    # start up GPT4 connection
    llm = get_langchain_gpt4()

    extract_proactive_rare_word_agent_query_prompt = PromptTemplate(
        template=proactive_rare_word_agent_prompt_blueprint,
        input_variables=[
            "conversation_context",
            "definitions_history",
        ],
        partial_variables={
            "format_instructions": proactive_rare_word_agent_query_parser.get_format_instructions(),
            "number_of_definitions": "3",  # this is a tradeoff between speed and results, 3 is faster than 5
        },
    )

    if len(definitions_history) > 0:
        definitions_history = format_list_data(definitions_history)
    else:
        definitions_history = "None"

    proactive_rare_word_agent_query_prompt_string = (
        extract_proactive_rare_word_agent_query_prompt.format_prompt(
            conversation_context=conversation_context,
            definitions_history=definitions_history,
        ).to_string()
    )

    # print("Proactive meta agent query prompt string", proactive_rare_word_agent_query_prompt_string)

    response = llm(
        [HumanMessage(content=proactive_rare_word_agent_query_prompt_string)]
    )

    print("Proactive meta agent response", response)

    try:
        res = proactive_rare_word_agent_query_parser.parse(response.content)
        # we still have unknown_entities to search for but we will do them next time
        res = search_entities(res.entities)
        return res
    except OutputParserException:
        return None


def search_entities(entities: list[Entity]):
    search_tasks = []
    for entity in entities:
        search_tasks.append(search_url_for_entity_async(entity.search_keyword))

    loop = asyncio.get_event_loop()
    responses = asyncio.gather(*search_tasks)
    responses = loop.run_until_complete(responses)

    entity_objs = []
    for entity, response in zip(entities, responses):
        # print("response", str(response))
        res = dict()
        res["name"] = entity.name
        res["summary"] = entity.definition
        res.update(response)

        # if response is None:
        #     continue

        # for item in response.item_list_element:
        #     result = item.get("result")

        #     # get mid and start entry - assuming we always get a mid
        #     mid = None
        #     for identifier in result.get("identifier"):
        #         if identifier.get('name') == 'googleKgMID':
        #             mid = identifier.get('value')
        #             break

        #     if mid is None:
        #         continue

        #     res["mid"] = mid

        #     # get google cloud id
        #     cloud_id = result.get('@id')

        #     # get image
        #     if result.get('image'):
        #         image_url = result.get('image').get('contentUrl')
        #         # convert to actual image url if it's a wikipedia image
        #         # if "wiki" in image_url:
        #         # image_url = self.wiki_image_parser(image_url)
        #         res["image_url"] = image_url

        #     # res["name"] = result.get('name')
        #     res["category"] = result.get('description')

        #     # set our own types
        #     if any(x in ['Place', 'City', 'AdministrativeArea'] for x in result.get('@type')):
        #         res["type"] = "LOCATION"
        #     else:
        #         res["type"] = result.get('@type')[0].upper()

        #     detailed_description = result.get("detailedDescription")
        #     if detailed_description:
        #         res["url"] = detailed_description.get('url')

        entity_objs.append(res)

    return entity_objs
