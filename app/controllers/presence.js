'use strict';

var util = require('util'),
    Connection = require('./../core/presence').Connection;

function SocketIoConnection(user, socket) {
    Connection.call(this, 'socket.io', user);
    this.socket = socket;
    // Socket.IO 1.x let us hang our LCB Connection off `socket.conn`, but
    // Socket.IO 4's `socket.conn` is a read-only getter that returns the
    // underlying engine.io Client. Use a custom-named property instead.
    socket.lcbConn = this;
    socket.on('disconnect', this.disconnect.bind(this));
}

util.inherits(SocketIoConnection, Connection);

SocketIoConnection.prototype.disconnect = function() {
    this.emit('disconnect');

    this.socket.lcbConn = null;
    this.socket = null;
};

module.exports = function() {
    var app = this.app,
        core = this.core,
        User = this.models.user;

    app.io.on('connection', function(socket) {
        var userId = socket.request.user._id;
        User.findById(userId, function (err, user) {
            if (err) {
                console.error(err);
                return;
            }
            var conn = new SocketIoConnection(user, socket);
            core.presence.connect(conn);
        });
    });
};
