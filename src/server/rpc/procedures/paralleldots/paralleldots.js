/** 
 * Uses ParallelDots AI to process or compare text for a variety of features.
 * See the API documentation, at 
 * http://apis.paralleldots.com/text_docs/index.html
 * 
 * Terms of use: https://www.paralleldots.com/terms-and-conditions
 * @service
 * @category Language
 */

const ApiConsumer = require('../utils/api-consumer');
const ParallelDots = new ApiConsumer('ParallelDots', 'https://apis.paralleldots.com/v4',{cache: {ttl: 5*60}});
const key = process.env.PARALLELDOTS_KEY;

const toLowerCaseKeys = object => {
    const result = {};
    // Correct inconsistencies in capitalization from ParallelDots
    Object.entries(object).forEach(entry => {
        const [key, value] = entry;
        result[key.toLowerCase()] = value;
    });
    return result;
};

ParallelDots._parallelDotsRequest = function(query, text){
    let body = `api_key=${key}&text=${encodeURI(text)}`;
    return this._sendAnswer({
        queryString: query,
        method: 'POST',
        headers: {'Content-Type' : 'application/x-www-form-urlencoded'},
        body: body
    });
};

/**
 * Find the overall sentiment of the given text along with the confidence score.
 *
 * @param {String} text
 */
ParallelDots.getSentiment = async function(text) {
    const result = await this._parallelDotsRequest('/sentiment', text);
    return result.sentiment;
};

/**
 * Find the similarity between two snippets of text.
 *
 * @param {String} text1 Long text (more than 2 words)
 * @param {String} text2 Long text (more than 2 words)
 */
ParallelDots.getSimilarity = async function(text1, text2) {
    const body = `api_key=${key}&text_1=${encodeURI(text1)}&text_2=${encodeURI(text2)}`;
    const result = await this._sendAnswer({
        queryString: '/similarity', method: 'POST',
        headers: {'Content-Type' : 'application/x-www-form-urlencoded'},
        body: body
    });
    return result.similarity_score;
};

/**
 * Identify named entities in the given text.
 *
 * @param {String} text
 */
ParallelDots.getNamedEntities = async function(text) {
    const result = await this._parallelDotsRequest('/ner', text);
    return result.entities;
};

/**
 * Extract keywords from the given text along with their confidence score.
 *
 * @param {String} text
 */
ParallelDots.getKeywords = async function(text) {
    const result = await this._parallelDotsRequest('/keywords', text);
    return result.keywords;
};

/**
 * Classify the given text into IAB categories.
 *
 * For more information about IAB categories, see
 * https://www.iab.com/guidelines/iab-quality-assurance-guidelines-qag-taxonomy/
 *
 * @param {String} text
 */
ParallelDots.getTaxonomy = async function(text) {
    const result = await this._parallelDotsRequest('/taxonomy', text);
    return result.taxonomy;
};

/**
 * Find the emotion in the given text.
 *
 * @param {String} text
 */
ParallelDots.getEmotion = async function(text) {
    const result = await this._parallelDotsRequest('/emotion', text);
    return toLowerCaseKeys(result.emotion);
};

/**
 * Compute the probability of sarcasm for the given text.
 *
 * @param {String} text
 */
ParallelDots.getSarcasmProbability = async function(text) {
    const result = await this._parallelDotsRequest('/sarcasm', text);
    return result.Sarcastic;
};

/**
 * Get the intent of the given text along with the confidence score.
 *
 * @param {String} text
 */
ParallelDots.getIntent = async function(text) {
    const result = await this._parallelDotsRequest('/intent', text);
    return result.intent;
};

/**
 * Classify the given text as abuse, hate speech, or neither.
 *
 * @param {String} text
 */
ParallelDots.getAbuse = function(text) {
    return this._parallelDotsRequest('/abuse', text);
};


ParallelDots.isSupported = () => {
    if(!key){
        /* eslint-disable no-console*/
        console.error('PARALLELDOTS_KEY is missing.');
        /* eslint-enable no-console*/
    }
    return !!key;
};

module.exports = ParallelDots;
