/**
 * The Alexa service provides capabilities for building your own Alexa skills!
 *
 * @service
 */
const Alexa = {};
const GetStorage = require('./storage');
const registerTypes = require('./types');
const h = require('./helpers');
const schemas = require('./schemas');
registerTypes();

Alexa.initialize = async function() {
    await h.registerOAuthClient();
};

/**
 * Create an Alexa Skill from a configuration.
 *
 * @param{Object} configuration
 * @param{String} configuration.name
 * @param{String} configuration.invocation
 * @param{String=} configuration.description
 * @param{String=} configuration.summary
 * @param{Array<Intent>} configuration.intents
 * @param{Array<String>=} configuration.examples
 * @returns{String} ID
 */
Alexa.createSkill = async function(configuration) {
    const smapiClient = await h.getAPIClient(this.caller);
    configuration = h.getConfigWithDefaults(configuration);
    const stage = 'development';

    const {vendors} = (await smapiClient.getVendorListV1());
    const vendorId = vendors[0].id;

    const manifest = schemas.manifest(vendorId, configuration);
    const interactionModel = schemas.interactionModel(configuration);
    const accountLinkingRequest = schemas.accountLinking();
    let skillId;
    try {
        skillId = (await smapiClient.createSkillForVendorV1(manifest, vendorId)).skillId;
        await h.sleep(5000);
        await smapiClient.setInteractionModelV1(skillId, stage, 'en-US', {interactionModel});
        await smapiClient.updateAccountLinkingInfoV1(skillId, stage, {accountLinkingRequest});
    } catch (err) {
        throw h.clarifyError(err);
    }

    const {skills} = GetStorage();
    await skills.updateOne({_id: skillId}, {
        $set: {
            config: configuration,
            context: this.caller,
            author: this.caller.username,
            createdAt: new Date()
        }
    }, {upsert: true});
    return skillId;
};

/**
 * Delete the given Alexa Skill (created within NetsBlox).
 *
 * @param{String} ID ID of the Alexa skill to delete
 */
Alexa.deleteSkill = async function(id) {
    const {skills} = GetStorage();
    const value = await skills.findOne({_id: id});

    if (!value) {
        throw new Error('Skill not found.');
    }
    if (value.author !== this.caller.username) {
        throw new Error('Unauthorized: Skills can only be deleted by the author.');
    }

    const smapiClient = await h.getAPIClient(this.caller);
    try {
        await smapiClient.deleteSkillV1(value._id);
        await skills.deleteOne({_id: value._id});
    } catch (err) {
        if (err.statusCode === 404) {
            await skills.deleteOne({_id: value._id});
        } else {
            throw err;
        }
    }
};

/**
 * List the IDs of all the Alexa Skills created in NetsBlox for the given user.
 *
 * @returns{Array<String>} IDs
 */
Alexa.listSkills = async function() {
    const {skills} = GetStorage();
    const skillConfigs = await skills.find({author: this.caller.username}).toArray();
    return skillConfigs.map(skill => skill._id);
};

/**
 * Get the configuration of the given Alexa Skill.
 *
 * @param{String} ID
 */
Alexa.getSkill = async function(id) {
    const {skills} = GetStorage();
    const value = await skills.findOne({_id: id});
    if (!value) {
        throw new Error('Skill not found.');
    }
    return value.config;
};

/**
 * Update skill configuration with the given ID.
 *
 * @param{String} ID ID of the skill to update
 * @param{Object} configuration
 * @param{String} configuration.name The name of the Alexa Skill
 * @param{String} configuration.invocation The name to use to invoke the skill
 * @param{String=} configuration.description A description of the skill
 * @param{String=} configuration.summary A summary of the skill
 * @param{Array<Intent>} configuration.intents A list of intents, or commands, for the skill to support
 * @param{Array<String>=} configuration.examples Example utterances to show in the skill description
 */
Alexa.updateSkill = async function(id, configuration) {
    const smapiClient = await h.getAPIClient(this.caller);
    configuration = h.getConfigWithDefaults(configuration);

    const {vendors} = (await smapiClient.getVendorListV1());
    const vendorId = vendors[0].id;

    const manifest = schemas.manifest(vendorId, configuration);
    const interactionModel = schemas.interactionModel(configuration);
    try {
        const stage = 'development';
        await smapiClient.updateSkillManifestV1(id, stage, manifest);
        await smapiClient.setInteractionModelV1(id, stage, 'en-US', {interactionModel});
    } catch (err) {
        throw h.clarifyError(err);
    }

    const {skills} = GetStorage();
    await skills.updateOne({_id: id}, {
        $set: {
            config: configuration,
            context: this.caller,
            author: this.caller.username,
            updatedAt: new Date()
        }
    }, {upsert: true});
};

Alexa.isSupported = () => {
    const isSupported = process.env.ALEXA_CLIENT_ID && process.env.ALEXA_CLIENT_SECRET;
    if (isSupported) {
        console.log('ALEXA_CLIENT_ID and ALEXA_CLIENT_SECRET must be set for Alexa capabilities.');
    }
    return isSupported;
};

module.exports = Alexa;
