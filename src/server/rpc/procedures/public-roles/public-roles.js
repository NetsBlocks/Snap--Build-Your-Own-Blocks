// This is a key value store that can be used across tables
'use strict';

var debug = require('debug'),
    trace = debug('netsblox:rpc:public-roles:trace');

module.exports = {

    // This is very important => Otherwise it will try to instantiate this
    isStateless: true,

    // These next two functions are the same from the stateful RPC's
    getPath: function() {
        return '/publicRoles';
    },

    requestPublicRoleId: function() {
        var room = this.socket._room,
            owner = room.owner.username,
            roomName = room.name,
            roleId = this.socket.roleId;

        trace(`${this.socket.username} has requested public id`);
        return [
            roleId,
            roomName,
            owner
        ].join('@');
    }
};
