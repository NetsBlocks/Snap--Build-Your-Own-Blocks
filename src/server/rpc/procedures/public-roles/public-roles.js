// This is a key value store that can be used across tables
'use strict';

const logger = require('../utils/logger')('public-roles');
const Projects = require('../../../storage/projects');
const PublicRoles = {};

/**
 * Get the public role ID for the current role.
 */
PublicRoles.getPublicRoleId = function() {
    const {projectId, roleId} = this.caller;
    return Projects.getRawProjectById(projectId)
        .then(metadata => {
            if (!metadata) {
                throw new Error(`Project not found. Has it been deleted?`);
            }

            if (!metadata.roles[roleId]) {
                throw new Error(`Role not found. Has it been deleted?`);
            }

            const roleName = metadata.roles[roleId].ProjectName;
            const {name, owner} = metadata;
            return `${roleName}@${name}@${owner}`;
        });
};

/**
 * Get the public role ID for the current role.
 * @deprecated
 */
PublicRoles.requestPublicRoleId = function() {
    return PublicRoles.getPublicRoleId.call(this);
};

module.exports = PublicRoles;
