# check the frequency of all words in a list, return list of words with frequency below constant
import pandas as pd
from nltk.corpus import wordnet
import word_define
from word_define import *
import re

#how rare should a word be for us to consider it rare?
low_freq_threshold_google = 0.0922 #the percentage of the line number needed to be considered a rare word - the higher, the more rare the word has to be to be defined
low_freq_threshold_norvig = 0.901
google_lines = 333334
norvig_lines = 30000
low_freq_constant_google =  low_freq_threshold_google * google_lines
low_freq_line_constant_norvig = low_freq_threshold_norvig * norvig_lines

#load index
print("Loading word frequency indexes...")
df_google_word_freq = pd.read_csv("./english_word_freq_list/unigram_freq.csv")
df_norvig_word_freq = pd.read_csv("./english_word_freq_list/30k.csv", header=0)
idx_google_dict_word_freq = df_google_word_freq.groupby(by='word').apply(lambda x: x.index.tolist()).to_dict()
idx_norvig_dict_word_freq = df_norvig_word_freq.groupby(by='word').apply(lambda x: x.index.tolist()).to_dict()

df_google_word_freq.iloc[idx_google_dict_word_freq["golgw"]] # run once to build the index
#print(df_norvig_word_freq)
df_norvig_word_freq.iloc[idx_norvig_dict_word_freq["whereabouts"]] # run once to build the index
print("--- Word frequency index loaded.")

#we use this funny looking thing for fast string search, thanks to: https://stackoverflow.com/questions/44058097/optimize-a-string-query-with-pandas-large-data
def find_low_freq_words(words):
    low_freq_words = list()
    for word in words:
        word = word.lower()
        #find word in google
        try:
            i_word_google = idx_google_dict_word_freq[word][0]
            #print("Google score of |{} == {}|".format(word, i_word_google / google_lines))
        except KeyError as e:
            #if we didn't find the word in giant google dataset, then it's rare, so define it if we have it
            low_freq_words.append(word)
            continue
        #find word in norvig
        i_word_norvig = None
        try:
            i_word_norvig = idx_norvig_dict_word_freq[word][0]
            #print("Norvig score of |{} == {}|".format(word, i_word_norvig / norvig_lines))
        except KeyError as e:
            #if we didn't find the word in norvig, it might not be rare (e.g. "habitual")
            print("Word '{}' not found in norvig word frequency database.".format(word))
        if (i_word_google > low_freq_constant_google):
            low_freq_words.append(word)
            continue
        elif (i_word_norvig != None) and (i_word_norvig > low_freq_line_constant_norvig):
            low_freq_words.append(word)
            continue

    #print("low freq words: {}".format(low_freq_words))
    return low_freq_words


def find_acronyms(words):
    acronyms = list()
    for word in words:
        # an acronym is usually short and capitalized
        if (1 < len(word) < 5) and ("'" not in word) and word.isupper():
            # print("111 Found acronym: {}".format(word))
            acronyms.append(word)
            continue
        # if the word is very short it might still be an acronym even if it isn't all uppercase
#        elif len(word) < 4:
#            # check wether the word is in the is in the wordnet database
#            syns = wordnet.synsets(word)
#
#            try:
#                definition = syns[0].definition()
#                print("This is a word: {}".format(word))
#            # if wordnet can't find a definition for the word assume it's an acronym
#            except IndexError as e:       
#                print("222 Found acronym: {}".format(word))
#                acronyms.append(word)
#                continue 
    return acronyms

def rare_word_define_string(text):
    #clean text and split text into words
    text = text.replace(".", " ").strip()
    text = re.sub(r'[0-9]', '', text)
    word_list = text.split(' ')

    #remove words with apostrophes
    word_list = [word for word in word_list if "'" not in word]

    #get list of acronyms
    acronyms = find_acronyms(word_list)

    #list of words without acronyms
    word_list_no_acronyms = list(set(word_list) - set(acronyms))
    print("word_list_no_acronyms: ")
    print(word_list_no_acronyms)

    #get list of rare words
    rare_words = find_low_freq_words(word_list_no_acronyms)

    all_to_define = rare_words + acronyms

    #define acronyms
    acro_definitions = [define_acronym(a) for a in acronyms]
    acro_definitions = [ad for ad in acro_definitions if ad is not None]

    #define rare words
    rare_word_definitions = [define_word(w) for w in rare_words]
    rare_word_definitions = [wd for wd in rare_word_definitions if wd is not None]
    rare_word_definitions = [shorten_definition(d) for d in rare_word_definitions]

    #combine definitions
    definitions = acro_definitions + rare_word_definitions

    return definitions

if __name__ == "__main__":
    print(rare_word_define_string("CSE existential LLM spectroscopy this is a test and preposterous NSA people might amicably proliferate OUR tungsten arcane ark USA botanical bonsai ASR gynecologist esoteric multi-processing"))
