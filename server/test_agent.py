from agents.proactive_meta_agent import run_proactive_meta_agent_and_experts
from agents.language_learning_agent import run_language_learning_agent
from agents.ll_context_convo_agent import run_question_asker_agent
from agents.helpers.get_nearby_places import get_user_location, get_nearby_places

to_test_string1 = """" right? And now, the key is that whenever we hit that one, you know, by assumption, it has to solve the problem, it has to find the solution, and once it claims to find a solution, then we can check that ourselves, right? Because these are NP problems, then we can check it. Now, this is utterly impractical, right? You know, you'd have to do this enormous exhaustive search among all the algorithms, but from a certain theoretical standpoint, that is merely a constant prefactor, right? That's merely a multiplier of your running time. So, there are tricks like that one can do to say that, in some sense, the algorithm would have to be constructive. But, you know, in the human sense, you know, it is possible that to, you know, it's conceivable that one could prove such a thing via a nonconstructive method. Is that likely? I don't think so. Not personally. So, that's P and NP, but the complexity zoo is full of wonderful creatures. Well, it's got about 500 of them. 500. So, how do you get, yeah, how do you get more? I mean, just for starters, there is everything that we could do with a conventional computer with a polynomial amount of memory, okay, but possibly an exponential amount of time, because we get to reuse the same memory over and over again. Okay, that is called P space, okay? And that's actually, we think, an even larger class than NP. Okay, well, P is contained in NP, which is contained in P space. And we think that those containments are strict. And the constraint there is on the memory. The memory has to grow polynomially with the size of the process. That's right. That's right. But in P space, we now have interesting things that were not in NP, like as a famous example, you know, from a given position in chess, you know, does white or black have the win? Let's say, assuming provided that the game lasts only for a reasonable number of moves, okay? Or likewise,"""
word_rank = {"and": 2, "the": 4, "beautiful": 100, "library": 200, "house": 300}


if __name__ == "__main__":
    # insights = run_proactive_meta_agent_and_experts(to_test_string1)
    # print(insights)
    # words = run_language_learning_agent(to_test_string1, word_rank)
    # print(words)
    location = get_user_location()
    places = get_nearby_places(location)
    print("PLACES #########################")
    print(places)
    places = ["name: Withworth Park, types: ['locality', 'park']", "name: Green Restaurant, types: ['locality', 'restaurant']"]
    questions = run_question_asker_agent(places)
    print("QUESTIONS TO ASK #########################")
    for question in questions:
        print(question)
