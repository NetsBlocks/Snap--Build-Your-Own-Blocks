'use strict';
var R = require('ramda'),
    _ = require('lodash'),
    Q = require('q'),
    Utils = _.extend(require('../utils'), require('../server-utils.js')),
    PublicProjects = require('../storage/public-projects'),
    UserAPI = require('./users'),
    RoomAPI = require('./rooms'),
    ProjectAPI = require('./projects'),
    EXTERNAL_API = UserAPI
        .concat(ProjectAPI)
        .concat(RoomAPI)
        .filter(api => api.Service)
        .map(R.omit.bind(R, 'Handler'))
        .map(R.omit.bind(R, 'middleware')),

    debug = require('debug'),
    log = debug('netsblox:api:log'),
    middleware = require('./middleware'),
    SocketManager = require('../socket-manager'),
    saveLogin = middleware.saveLogin;

const SERIALIZED_API = Utils.serializeArray(EXTERNAL_API);
const BugReporter = require('../bug-reporter');
const Messages = require('../storage/messages');
const Projects = require('../storage/projects');

module.exports = [
    { 
        Method: 'get', 
        URL: 'ResetPW',
        Handler: function(req, res) {
            log('password reset request:', req.query.Username);
            var self = this,
                username = req.query.Username;

            // Look up the email
            self.storage.users.get(username)
                .then(user => {
                    if (user) {
                        delete user.hash;  // force tmp password creation
                        user.save();
                        return res.sendStatus(200);
                    } else {
                        log('Could not find user to reset password (user "'+username+'")');
                        return res.status(400).send('ERROR: could not find user "'+username+'"');
                    }
                })
                .catch(e => {
                    log('Server error when looking for user: "'+username+'". Error:', e);
                    return res.status(500).send('ERROR: ' + e);
                });
        }
    },
    { 
        Method: 'post',  // post would make more sense...
        URL: 'SignUp',
        Handler: function(req, res) {
            log('Sign up request:', req.body.Username, req.body.Email);
            var self = this,
                uname = req.body.Username,
                password = req.body.Password,
                email = req.body.Email;

            // Must have an email and username
            if (!email || !uname) {
                log('Invalid request to /SignUp');
                return res.status(400).send('ERROR: need both username and email!');
            }

            // validate username
            if (uname[0] === '_') {
                return res.status(400).send('ERROR: invalid username');
            }

            self.storage.users.get(uname)
                .then(user => {
                    if (!user) {
                        var newUser = self.storage.users.new(uname, email);
                        newUser.hash = password || null;
                        newUser.save();
                        return res.send('User Created!');
                    }
                    log('User "'+uname+'" already exists. Could not make new user.');
                    return res.status(401).send('ERROR: user exists');
                });
        }
    },
    { 
        Method: 'post',
        URL: 'SignUp/validate',
        Handler: function(req, res) {
            log('Signup/validate request:', req.body.Username, req.body.Email);
            var uname = req.body.Username,
                email = req.body.Email;

            // Must have an email and username
            if (!email || !uname) {
                log('Invalid request to /SignUp/validate');
                return res.status(400).send('ERROR: need both username and email!');
            }

            this.storage.users.get(uname)
                .then(user => {
                    if (!user) {
                        return res.send('Valid User Signup Request!');
                    }
                    log('User "'+uname+'" already exists.');
                    return res.status(401).send('ERROR: user exists');
                });
        }
    },
    { 
        Method: 'post', 
        URL: '',  // login method
        Handler: function(req, res) {
            const hash = req.body.__h;
            const projectId = req.body.projectId;
            const isUsingCookie = !req.body.__u;
            let loggedIn = false;
            let username = req.body.__u;

            // Should check if the user has a valid cookie. If so, log them in with it!
            // Explicit login
            return Q.nfcall(middleware.tryLogIn, req, res)
                .then(() => {
                    loggedIn = req.session && !!req.session.username;
                    username = username || req.session.username;

                    if (!username) {
                        log('"passive" login failed - no session found!');
                        if (req.body.silent) {
                            return res.sendStatus(204);
                        } else {
                            return res.sendStatus(403);
                        }
                    }
                    log(`Logging in as ${username}`);

                    return this.storage.users.get(username);
                })
                .then(user => {

                    if (!user) {  // incorrect username
                        log(`Could not find user "${username}"`);
                        return res.status(403).send(`Could not find user "${username}"`);
                    }

                    if (!loggedIn) {  // login, if needed
                        const correctPassword = user.hash === hash;
                        if (!correctPassword) {
                            log(`Incorrect password attempt for ${user.username}`);
                            return res.status(403).send('Incorrect password');
                        }
                        log(`"${user.username}" has logged in.`);
                    }

                    if (!isUsingCookie) {  // save the cookie, if needed
                        saveLogin(res, user, req.body.remember);
                    }

                    // We need to update the project owner regardless of the ws connection
                    // Associate the websocket with the username
                    const socket = SocketManager.getSocket(req.body.socketId);
                    if (socket) {  // websocket has already connected
                        socket.onLogin(user);
                    }

                    let updateProject = Q();
                    if (projectId) {
                        updateProject = Projects.getById(projectId)
                            .then(project => {
                                // Update the project owner, if needed
                                if (project && Utils.isSocketUuid(project.owner)) {
                                    return user.getNewName(project.name)
                                        .then(name => project.setName(name))
                                        .then(() => project.setOwner(username));
                                }
                            });
                    }

                    return updateProject
                        .then(() => {
                            user.recordLogin();
                            if (req.body.return_user) {
                                return res.status(200).json({
                                    username: username,
                                    admin: user.admin,
                                    email: user.email,
                                    api: req.body.api ? SERIALIZED_API : null
                                });
                            } else {
                                return res.status(200).send(SERIALIZED_API);
                            }
                        });
                })
                .catch(e => {
                    log(`Could not find user "${username}": ${e}`);
                    return res.status(500).send('ERROR: ' + e);
                });
        }
    },
    // get start/end network traces
    {
        Method: 'get',
        URL: 'trace/start/:socketId',
        Handler: function(req, res) {
            let {socketId} = req.params;

            let socket = SocketManager.getSocket(socketId);
            if (!socket) return res.status(401).send('ERROR: Could not find socket');

            let room = socket.getRoomSync();
            if (!room) {
                this._logger.error(`Could not find active room for "${socket.username}" - cannot get messages!`);
                return res.status(500).send('ERROR: room not found');
            }

            const project = room.getProject();
            return project.startRecordingMessages(socketId)
                .then(time => res.json(time));
        }
    },
    {
        Method: 'get',
        URL: 'trace/end/:socketId',
        Handler: function(req, res) {
            let {socketId} = req.params;

            let socket = SocketManager.getSocket(socketId);
            if (!socket) return res.status(401).send('ERROR: Could not find socket');

            let room = socket.getRoomSync();
            if (!room) {
                this._logger.error(`Could not find active room for "${socket.username}" - cannot get messages!`);
                return res.status(500).send('ERROR: room not found');
            }

            const project = room.getProject();
            const projectId = project.getId();
            const endTime = Date.now();
            return project.stopRecordingMessages(socketId)
                .then(startTime => startTime && Messages.get(projectId, startTime, endTime))
                .then(messages => {
                    messages = messages || [];
                    this._logger.trace(`Retrieved ${messages.length} network messages for ${projectId}`);
                    return res.json(messages);
                });
        }
    },
    // public projects
    {
        Method: 'get',
        URL: 'Projects/PROJECTS',
        Handler: function(req, res) {
            var start = +req.query.start || 0,
                end = Math.min(+req.query.end, start+1);

            return PublicProjects.list(start, end)
                .then(projects => res.send(projects));
        }
    },
    {
        Method: 'get',
        URL: 'Examples/EXAMPLES',
        Handler: function(req, res) {
            const isJson = req.query.metadata === 'true';
            return Q(this.getExamplesIndex(isJson))
                .then(result => {
                    if (isJson) {
                        return res.json(result);
                    } else {
                        return res.send(result);
                    }
                });
        }
    },
    // Bug reporting
    {
        Method: 'post',
        URL: 'BugReport',
        Handler: function(req, res) {
            var user = req.body.user,
                report = req.body;

            if (user) {
                this._logger.info(`Received bug report from ${user}`);
            } else {
                this._logger.info('Received anonymous bug report');
            }

            const socket = SocketManager.getSocket(report.clientUuid);
            BugReporter.reportClientBug(socket, report);

            return res.sendStatus(200);
        }
    }
];
