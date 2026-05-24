//
// In-tree replacement for the `express.oi` package (npm, 0.0.21, unmaintained
// since 2017). express.oi wrapped Express 4 + Socket.IO 1.x to dispatch the
// same handler from either HTTP routes or Socket.IO events:
//
//   app.post('/account/login', function(req) { req.io.route('account:login'); });
//   app.io.route('account:login', function(req, res) { ... res.json(...); });
//
// We do the same trick directly on top of native Express 5 + Socket.IO 4
// here, so the existing controllers in app/controllers/ don't need to
// change. The auth bridge (session/cookie -> socket.request.user) is set
// up by the caller via app.io.session(sessionMiddleware) and by
// app/auth/index.js (which also handles bearer-token sockets).
//
// Why a compat layer vs a native rewrite: the dual-dispatch trick has 30
// HTTP -> io.route dispatch sites and 8 io.route blocks across 12
// controllers. Preserving the API lets us upgrade Express + Socket.IO and
// lift the residual CVE chain without touching any handler code, mirroring
// the sweetalert and bootstrap-modal shims we've already accepted. A future
// project can drop this file and rewrite controllers natively if/when the
// upside is worth the churn.
//

'use strict';

var http = require('http');
var https = require('https');
var express = require('express');
var SocketIOServer = require('socket.io').Server;

// Patch a req with the helpers express.oi added: `req.io.route(name)` to
// dispatch into a socket-style handler, and `req.param(name, default)` to
// pull a value from params/body/query (Express 5 removed `req.param()`).
function attachReqHelpers(req, res, router) {
    req.isSocket = false;
    req.io = req.io || {};
    req.io.route = function(name) {
        var handler = router[name];
        if (!handler) {
            console.warn('[express-oi-compat] no io.route handler: ' + name);
            return res.sendStatus(404);
        }
        return handler(req, res);
    };
    if (!req.param) {
        req.param = function(name, defaultValue) {
            var params = req.params || {};
            var body = req.body || {};
            var query = req.query || {};
            if (params[name] != null && Object.prototype.hasOwnProperty.call(params, name)) {
                return params[name];
            }
            if (body[name] != null) { return body[name]; }
            if (query[name] != null) { return query[name]; }
            return defaultValue;
        };
    }
}

// Build a request shim for the Socket.IO side: looks like an Express req
// enough for the controllers to work. Carries the socket, session, and
// authenticated user so handlers can access them the same way.
function makeIoRequest(socket, data, io, router) {
    var clientReq = socket.client.request;
    var req = {
        isSocket: true,
        data: data,
        socket: socket,
        handshake: socket.handshake,
        session: socket.handshake.session ||
                 (clientReq && clientReq.session),
        sessionID: socket.handshake.sessionID ||
                   (clientReq && clientReq.sessionID),
        headers: clientReq ? clientReq.headers : {},
        query: clientReq ? clientReq._query : socket.handshake.query,
        cookies: clientReq ? clientReq.cookies : {},
        signedCookies: clientReq ? clientReq.signedCookies : {},
        url: clientReq ? clientReq.url : undefined,
        user: clientReq && clientReq.user ? clientReq.user : socket.request.user
    };
    req.param = function(name, defaultValue) {
        var d = req.data || {};
        var q = req.query || {};
        if (d != null && typeof d === 'object' && d[name] != null) { return d[name]; }
        if (q && q[name] != null) { return q[name]; }
        return defaultValue;
    };
    req.io = {
        route: function(name) {
            var handler = router[name];
            if (handler) { return handler(req, makeIoResponse()); }
        }
    };
    return req;
}

// Build a response shim for the Socket.IO side: .json/.send/.sendStatus
// forward the body to the ack callback. .status() is a no-op chain. This
// matches what express.oi did.
function makeIoResponse(ack) {
    var sent = false;
    function send(body) {
        if (sent) { return; }
        sent = true;
        if (typeof ack === 'function') { ack(body); }
    }
    var res = {
        json: send,
        jsonp: send,
        send: send,
        sendStatus: function(code) {
            send(http.STATUS_CODES[code] || String(code));
        },
        status: function() { return res; }
    };
    return res;
}

// Wire socket-side dispatch: for every (name -> handler) in the router,
// listen on the socket and invoke the handler with shimmed req/res.
function attachSocketDispatch(socket, io, router) {
    Object.keys(router).forEach(function(name) {
        socket.on(name, function(data, ack) {
            // `data` is optional in express.oi's calling convention -- if
            // only an ack is passed, it shifts into the second slot.
            if (typeof data === 'function') {
                ack = data;
                data = undefined;
            }
            var req = makeIoRequest(socket, data, io, router);
            var res = makeIoResponse(ack);
            router[name](req, res);
        });
    });
}

// Public entry point. Returns an Express 5 app with the express.oi-style
// .http() / .https() / .io() methods, and a patched .listen() that uses
// the underlying HTTP server (so Socket.IO can attach).
module.exports = function createApp() {
    var app = express();
    var router = {}; // shared between HTTP req.io.route() and Socket.IO dispatch

    app.http = function() {
        this.server = http.createServer(this);
        return this;
    };

    app.https = function(options) {
        this.server = https.createServer(options, this);
        return this;
    };

    app.io = function() {
        if (!this.server) { this.http(); }

        var io = new SocketIOServer(this.server, {
            // Allow same-origin XHR-polling fallback; default is locked down.
            cors: { origin: false }
        });

        // Expose express.oi-shaped helpers on the Socket.IO instance.
        // (Replaces what `app.io` would have been under express.oi 0.0.21.)
        io.route = function(name, handler) {
            if (typeof handler === 'function') {
                router[name] = handler;
                return;
            }
            // Treat handler as a map: { action: fn, 'a:b': fn } -> "name:action"
            for (var key in handler) {
                if (Object.prototype.hasOwnProperty.call(handler, key)) {
                    router[name + ':' + key] = handler[key];
                }
            }
        };

        // Wire express-session into Socket.IO so socket.request.session is set.
        // The middleware is also installed onto the Express app for HTTP.
        io.session = function(sessionMiddleware) {
            app.use(sessionMiddleware);
            // engine.use was added in Socket.IO 4.6.0 and is the canonical
            // way to install Express middleware on every Socket.IO handshake.
            io.engine.use(sessionMiddleware);
        };

        // Each new socket connection: register all the io.route() handlers.
        io.on('connection', function(socket) {
            attachSocketDispatch(socket, io, router);
        });

        // Patch every HTTP request with req.io.route() + req.param().
        app.use(function(req, res, next) {
            attachReqHelpers(req, res, router);
            next();
        });

        // Stash for HTTP-side reference.
        app.io = io;
        return this;
    };

    // express.oi-style listen: if no server has been created yet, default
    // to plain HTTP and listen on the underlying server (the bare Express
    // app.listen would skip Socket.IO).
    var originalListen = express.application.listen;
    app.listen = function() {
        if (!this.server) { this.http(); }
        return this.server.listen.apply(this.server, arguments);
    };
    // Squelch unused warning on `originalListen` -- we intentionally don't
    // chain through it; the express.application listen() doesn't know about
    // our HTTP server.
    void originalListen;

    return app;
};

// Re-export the things app.js / controllers grabbed off the old
// `express.oi` module besides the constructor.
module.exports.static = express.static;
module.exports.Router = express.Router;
module.exports.json = express.json;
module.exports.urlencoded = express.urlencoded;
