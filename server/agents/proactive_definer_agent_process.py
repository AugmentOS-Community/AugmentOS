import time
import traceback
import asyncio
import uuid
import logging

#custom
from DatabaseHandler import DatabaseHandler
from agents.proactive_definer_agent import run_proactive_definer_agent
from logger_config import logger

check_time = 10

def proactive_definer_processing_loop():
    print("START DEFINER PROCESSING LOOP")
    dbHandler = DatabaseHandler(parent_handler=False)

    #wait for some transcripts to load in
    time.sleep(15)

    while True:
        if not dbHandler.ready:
            print("dbHandler not ready")
            time.sleep(0.1)
            continue
        
        #delay between loops
        time.sleep(5)

        try:
            pLoopStartTime = time.time()
            # Check for new transcripts
            print("RUNNING DEFINER LOOP")
            newTranscripts = dbHandler.get_recent_transcripts_from_last_nseconds_for_all_users(n=check_time)

            for transcript in newTranscripts:
                if len(transcript['text']) < 60: #80: # Around 20-30 words, like on a sentence level
                    print("Transcript too short, skipping...")
                    continue
                print("Run rare entity definition with... user_id: '{}' ... text: '{}'".format(
                    transcript['user_id'], transcript['text']))
                entityDefinerStartTime = time.time()
              

                try:
                    # STUDY CODE: Get the individual transcripts to get their timestamps. (This approach is a little hacky, probs don't keep)
                    individual_transcripts = dbHandler.get_transcripts_from_last_nseconds_for_user(transcript['user_id'], check_time + 1)
                    # definition_history = dbHandler.get_definer_history_for_user(transcript['user_id'])
                    definition_history = dbHandler.get_recent_nminutes_definer_history_for_user(transcript['user_id'], n_minutes=90)

                    logger.log(level=logging.DEBUG, msg="Definer history: {}".format(
                        definition_history))

                    # run proactive meta agent, get definition
                    entities = run_proactive_definer_agent(transcript['text'], definitions_history=definition_history)
                    
                    if entities is not None:
                        entities = [entity for entity in entities if entity is not None]

                        #save entities to the DB for the user
                        print("Adding entities in proactive definer process:")
                        print(entities)

                        # STUDY CODE: Populate the entity timestamps here
                        for entity in entities:
                            entity['timestamp'] = int(time.time())
                            for t in individual_transcripts:
                                if entity['name'].lower() in t['text'].lower():
                                    # Need timing offset...
                                    # If the entity occurs 1/3rd thru the transcript, delay extra
                                    # If the entity occurs 2/3rd thru the transcript, delay even more
                                    time_offset = 5
                                    entity_location = t['text'].index(entity['name'])
                                    if entity_location > (1 * (len(t['text']) / 3)): time_offset = 7
                                    if entity_location > (2 * (len(t['text']) / 3)): time_offset = 9
                                    entity['timestamp'] = t['timestamp'] + time_offset

                        dbHandler.add_agent_proactive_definition_results_for_user(transcript['user_id'], entities)

                except Exception as e:
                    print("Exception in entity definer:")
                    print(e)
                    traceback.print_exc()
                    continue
                entityDefinerEndTime = time.time()
                print("=== definer loop completed in {} seconds ===".format(
                    round(entityDefinerEndTime - entityDefinerStartTime, 2)))
        except Exception as e:
            print("Exception in entity definer...:")
            print(e)
            traceback.print_exc()
        finally:
            #lock.release()
            pLoopEndTime = time.time()
            # print("=== processing_loop completed in {} seconds overall ===".format(
            #     round(pLoopEndTime - pLoopStartTime, 2)))
    print("EXITING DEFINER PROCESS")
