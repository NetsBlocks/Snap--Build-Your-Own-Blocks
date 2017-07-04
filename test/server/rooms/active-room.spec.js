describe('active-room', function() {
    const Projects = require('../../../src/server/storage/projects');
    var ROOT_DIR = '../../../',
        _ = require('lodash'),
        RoomManager = require(ROOT_DIR + 'src/server/rooms/room-manager'),
        ActiveRoom = require(ROOT_DIR + 'src/server/rooms/active-room'),
        Constants = require(ROOT_DIR + 'src/common/constants'),
        assert = require('assert'),
        Logger = require(ROOT_DIR + 'src/server/logger'),
        logger = new Logger('active-room'),
        utils = require(ROOT_DIR + 'test/assets/utils'),
        owner = {
            username: 'test',
            _messages: [],
            send: msg => owner._messages.push(msg)
        },
        room;
    
    before(function() {
        RoomManager.init(new Logger('active-room-test'), {}, ActiveRoom);
    });

    describe('sendToEveryone', function() {
        var socket = {},
            msg;

        beforeEach(function() {
            room = new ActiveRoom(logger, 'sendToEveryoneTest', owner);
            room.sockets = () => [socket];
            msg = {
                type: 'message',
                msgType: 'message',
                dstId: 'test',
                content: {msg: 'test'}
            };
        });

        it('should set dstId if not set', function() {
            delete msg.dstId;
            socket.send = msg => {
                assert.equal(Constants.EVERYONE, msg.dstId);
            };
            room.sendToEveryone(msg);
        });

        it('should not set dstId if set', function() {
            var initialDst = msg.dstId;
            socket.send = msg => {
                assert.equal(initialDst, msg.dstId);
            };
            room.sendToEveryone(msg);
        });

        it('should call "send" on sockets w/ the msg', function(done) {
            socket.send = m => {
                assert.equal(m, msg);
                done();
            };
            room.sendToEveryone(msg);
        });
    });

    // Things to test:
    //   - add
    //   - getUnoccupiedRole
    it('should return the unoccupied role', function() {
        let room = utils.createRoom({
            name: 'test-room',
            owner: 'brian',
            roles: {
                p1: ['brian', 'cassie'],
                p2: ['todd', null],
                third: null
            }
        });

        let name = room.getUnoccupiedRole();
        assert.equal(name, 'third');
    });

    describe('close', function() {
        it('should send "project-closed" message to all sockets', function() {
            let room = utils.createRoom({
                name: 'test-room',
                owner: 'brian',
                roles: {
                    p1: ['brian', 'cassie'],
                    p2: ['todd', null],
                    third: null
                }
            });

            const sockets = room.sockets();
            room.close();

            sockets.map(s => s._socket)
                .forEach(socket => {
                    const msg = socket.message(-1);
                    assert.equal(msg.type, 'project-closed');
                });
        });

        it('should invoke "destroy"', function(done) {
            room = new ActiveRoom(logger, 'closeTest', owner);
            room.destroy = done;
            room.close();
        });
        
    });

    describe('get sockets at role', function() {
        let room = null;

        before(function() {
            room = utils.createRoom({
                name: 'move-test',
                owner: 'first',
                roles: {
                    role1: ['first'],
                    role2: [],
                }
            });
        });

        it('should return the sockets for a given role', function() {
            const sockets = room.getSocketsAt('role1');
            assert.equal(sockets.length, 1);
            assert.equal(sockets[0].username, 'first');
        });

        it('should return empty array if no sockets', function() {
            const sockets = room.getSocketsAt('role2');
            assert.equal(sockets.length, 0);
        });
    });

    describe('changing roles', function() {
        let room = null;
        let s1 = null;

        before(function() {
            room = utils.createRoom({
                name: 'move-test',
                owner: 'first',
                roles: {
                    role1: ['first'],
                    role2: [],
                }
            });
            s1 = room.getSocketsAt('role1')[0];
            room.add(s1, 'role2');
        });

        it('should send update message on changing roles', function() {
            const msg = s1._socket.message(-1);
            assert.equal(msg.type, 'room-roles');
            assert.equal(msg.occupants.role2[0], 'first');
        });

        it('should remove the socket from the original role', function() {
            assert.equal(room.getSocketsAt('role1').length, 0);
        });

        it('should add the socket to new role', function() {
            assert.equal(room.getSocketsAt('role2')[0], s1);
        });
    });

    describe('add', function() {
        var s1, s2;

        before(function() {
            let room = utils.createRoom({
                name: 'add-test',
                owner: 'first',
                roles: {
                    role1: [],
                    role2: [],
                }
            });
            s1 = utils.createSocket('role1');
            room.add(s1, 'role1');
            s2 = utils.createSocket('role2');
            room.add(s2, 'role2');
        });

        it('should update the roleId', function() {
            assert.equal(s1.roleId, 'role1');
            assert.equal('role2', s2.roleId);
        });

        it('should send update messages to each socket', function() {
            assert(s1._socket.messages().find(msg => msg.type === 'room-roles'));
            assert(s2._socket.messages().find(msg => msg.type === 'room-roles'));
        });

        it('should send same updated room to each socket', function() {
            assert(_.isEqual(s1._socket.message(-1), s2._socket.message(-1)));
        });

        it('should send updated room', function() {
            var expected = {
                role1: [s1.username],
                role2: [s2.username]
            };
            const actual = s1._socket.message(-1).occupants;
            assert(_.isEqual(actual, expected));
        });
    });

    describe('join role', function() {
        var alice, bob;

        before(function() {
            let room = utils.createRoom({
                name: 'add-test',
                owner: 'alice',
                collaborators: ['alice', 'bob'],
                roles: {
                    role1: ['alice'],
                    role2: ['bob'],
                }
            });
            alice = room.getSocketsAt('role1')[0];
            bob = room.getSocketsAt('role2')[0];

            room.add(alice, 'role2');
        });

        it('should both receive update messages', function() {
            assert(alice._socket.message(-1));
            assert(_.isEqual(alice._socket.message(-1), bob._socket.message(-1)));
        });

        it('should send correct update message', function() {
            const usersAtRole2 = alice._socket.message(-1).occupants.role2;
            assert(_.isEqual(usersAtRole2, ['bob', 'alice']));
        });

    });

    describe('editable', function() {
        let room = null;
        before(function() {
            room = utils.createRoom({
                name: 'add-test',
                owner: 'alice',
                collaborators: ['bob'],
                roles: {
                    role1: ['alice'],
                    role2: ['bob', 'eve'],
                }
            });
        });

        it('should be editable to owner', function() {
            assert(room.isEditableFor('alice'));
        });

        it('should be editable to collaborators', function() {
            room.getCollaborators = () => ['bob'];
            assert(room.isEditableFor('bob'));
        });

        it('should be not be editable to guests', function() {
            assert(!room.isEditableFor('eve'));
        });

    });
    
    let defaultConfig = {
        name: 'test',
        owner: 'alice',
        roles: {
            role1: ['alice'],
            role2: ['bob', 'eve']
        }
    };
    
    describe('without projects', function() {
        let room = null;
        let alice, bob;
        before(function() {
            room = utils.createRoom(defaultConfig);
            alice = room.getSocketsAt('role1')[0];
            bob = room.getSocketsAt('role2')[0];
        });
        
        describe('remove', function() {
            it('should remove a socket', function() {
                room.remove(alice);
                assert.deepEqual(room.getSocketsAt('role1'), []);
            });
        
            it('should receive update messages', function() {
                room.remove(bob);
                assert(alice._socket.message(-1));
            });
        });
        
        describe('change name', function() {
            it('should change name of the room', function(done) {
                room.changeName('abc').then((name) => {
                    assert.equal(name, 'abc');
                    done();
                });
            });
        });
    
        describe('owner', function() { //TODO: set up user storage

        });
    });
    
    describe('with projects', function() {
        before(function(done) {
            utils.connect().then(() => done()).catch(() => done());
        });
    
        let project = null;
        let r = null;
        
        beforeEach(function(done) {
            utils.getRoom(defaultConfig).then(room => {
                project = room.getProject();
                r = room;
                done();
            }).catch(() => done());
        });
    
        afterEach(function(done) {
            project.destroy()
            .then(() => done())
            .catch(done);
        });
        
        describe('collaborators', function() {
            it('should add one collaborator', function(done) {
                r.addCollaborator('bob').then(() => {
                    assert.equal(r.getCollaborators().length, 1);
                    done();
                }).catch(() => done());
            });
        
            it('should remove one collaborator', function(done) {
                r.addCollaborator('bob').then(() => {
                    r.removeCollaborator('bob').then(() => {
                        assert.equal(r.getCollaborators().length, 0);
                        done();
                    }).catch(() => done());
                }).catch(() => done());
            });
        
            it('should not remove collaborator if username is wrong', function(done) {
                r.addCollaborator('bob').then(() => {
                    r.removeCollaborator('wrong').then(() => {
                        assert.equal(r.getCollaborators().length, 1);
                        done();
                    });
                }).catch(() => done());
            });
        
        });
    
        describe('collaborators', function() {
            it('should add one collaborator', function(done) {
                r.addCollaborator('bob').then(() => {
                    assert.equal(r.getCollaborators().length, 1);
                    done();
                }).catch(() => done());
            });
        
            it('should remove one collaborator', function(done) {
                r.addCollaborator('bob').then(() => {
                    r.removeCollaborator('bob').then(() => {
                        assert.equal(r.getCollaborators().length, 0);
                        done();
                    }).catch(() => done());
                }).catch(() => done());
            });
        
            it('should remove no collaborator if username is wrong', function(done) {
                r.addCollaborator('bob').then(() => {
                    r.removeCollaborator('wrong').then(() => {
                        assert.equal(r.getCollaborators().length, 1);
                        done();
                    });
                }).catch(() => done());
            });
        
        });
        
        describe('roles', function() {
            it('should check whether has a role', function() {
                assert(r.hasRole('role1'));
                assert(!(r.hasRole('role3')));
            });
    
            it('should return right roles array', function() {
                assert.equal(r.getRoleNames().length, 2);
            });
    
            it('should return a role', function(done) {
                r.getRole('role1').then((data) => {
                    assert.equal(data.ProjectName, 'role1');
                    done();
                }).catch(() => done());
            });
            
            it('should create a role', function(done) {
                r.createRole('role3').then(() => {
                    assert.equal(r.getRoleNames().length, 3);
                    done();
                })
                .catch(() => done());
            });
    
            it('should remove a role', function(done) {
                r.removeRole('role1').then(() => {
                    assert.equal(r.getRoleNames().length, 2);
                    done();
                })
                .catch(() => done());
            });
    
            it('should rename a role', function(done) {
                r.renameRole('role1', 'roleNew').then(() => {
                    assert.equal(r.getRoleNames()[1], 'roleNew');
                    done();
                })
                .catch(() => done());
            });
        });
    });
    
});
