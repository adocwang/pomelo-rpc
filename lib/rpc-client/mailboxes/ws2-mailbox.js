var EventEmitter = require('events').EventEmitter;
var util = require('util');
var utils = require('../../util/utils');
var wsClient = require('ws');
var zlib = require('zlib');
var Tracer = require('../../util/tracer');
var StrMsgEncoder = require('../../util/strMsgEncoder');
var DEFAULT_CALLBACK_TIMEOUT = 10 * 1000;
var DEFAULT_INTERVAL = 50;

var KEEP_ALIVE_TIMEOUT = 10 * 1000;
var KEEP_ALIVE_INTERVAL = 30 * 1000;

var DEFAULT_ZIP_LENGTH = 1024 * 10;
var useZipCompress = false;

var MailBox = function (server, opts) {
    EventEmitter.call(this);
    this.id = server.id;
    this.host = server.host;
    this.port = server.port;
    this.requests = {};
    this.timeout = {};
    this.curId = 0;
    this.queue = [];
    this.rpcDebugLog = opts.rpcDebugLog;
    this.bufferMsg = opts.bufferMsg;
    this.interval = opts.interval || DEFAULT_INTERVAL;
    this.timeoutValue = opts.timeout || DEFAULT_CALLBACK_TIMEOUT;
    this.connected = false;
    this.closed = false;
    this.opts = opts;
    this._KPinterval = null;
    this._KP_last_ping_time = -1;
    this._KP_last_pong_time = -1;
    DEFAULT_ZIP_LENGTH = opts.doZipLength || DEFAULT_ZIP_LENGTH;
    useZipCompress = opts.useZipCompress || false;
};
util.inherits(MailBox, EventEmitter);

var pro = MailBox.prototype;

pro.connect = function (tracer, cb) {
    tracer && tracer.info('client', __filename, 'connect', 'ws-mailbox try to connect');
    if (tracer && tracer.isEnabled) {
        this.rpcDebugLog = true;
    } else {
        this.rpcDebugLog = false;
    }
    if (this.connected) {
        tracer && tracer.error('client', __filename, 'connect', 'mailbox has already connected');
        cb(new Error('mailbox has already connected.'));
        return;
    }

    this.socket = new wsClient('ws://' + this.host + ':' + this.port);
    //this.socket = wsClient.connect(this.host + ':' + this.port, {'force new connection': true, 'reconnect': false});

    var self = this;
    this.socket.on('message', function (msg, flags) {
        try {
            if (this.rpcDebugLog) {
                msg = JSON.parse(msg);
                if (msg instanceof Array) {
                    processMsgs(self, msg);
                } else {
                    processMsg(self, msg);
                }
            } else {
                if (StrMsgEncoder.isArrayData(msg)) {
                    processMsgs(self, StrMsgEncoder.splitMsgIntoArray(msg));
                } else {
                    processMsg(self, msg);
                }
            }
        } catch (e) {
            console.error('ws rpc client process message with error: %j', e.stack);
        }
    });

    this.socket.on('open', function () {
        if (self.connected) {
            //ignore reconnect
            return;
        }
        // success to connect
        self.connected = true;
        if (self.bufferMsg) {
            // start flush interval
            self._interval = setInterval(function () {
                flush(self);
            }, self.interval);
        }
        self._KPinterval = setInterval(function () {
            checkKeepAlive(self);
        }, KEEP_ALIVE_INTERVAL);
        utils.invokeCallback(cb);
    });

    this.socket.on('error', function (err) {
        utils.invokeCallback(cb, err);
        self.close();
    });

    this.socket.on('close', function (code, message) {
        var reqs = self.requests,
            cb;
        for (var id in reqs) {
            cb = reqs[id];
            utils.invokeCallback(cb, new Error('disconnect with remote server.'));
        }
        self.emit('close', self.id);
        self.close();
    });

    //  this.socket.on('ping', function (data, flags) {
    //  });
    this.socket.on('pong', function (data, flags) {
        ////console.log('ws received pong: %s', data);
        self._KP_last_pong_time = Date.now();
    });

};

var checkKeepAlive = function (mailbox) {
    if (mailbox.closed) {
        return;
    }
    var now = Date.now();
    if (mailbox._KP_last_ping_time > 0) {
        if (mailbox._KP_last_pong_time < mailbox._KP_last_ping_time) {
            if (now - mailbox._KP_last_ping_time > KEEP_ALIVE_TIMEOUT) {
                console.error('ws rpc client checkKeepAlive error because > KEEP_ALIVE_TIMEOUT');
                mailbox.close();
                return;
            } else {
                return;
            }
        }
        if (mailbox._KP_last_pong_time >= mailbox._KP_last_ping_time) {
            mailbox.socket.ping();
            mailbox._KP_last_ping_time = Date.now();
            return;
        }
    } else {
        mailbox.socket.ping();
        mailbox._KP_last_ping_time = Date.now();
    }
};

/**
 * close mailbox
 */
pro.close = function () {
    if (this.closed) {
        return;
    }
    this.closed = true;
    this.connected = false;
    if (this._interval) {
        clearInterval(this._interval);
        this._interval = null;
    }
    if (this._KPinterval) {
        clearInterval(this._KPinterval);
        this._KPinterval = null;
    }
    this.socket.close();
    this._KP_last_ping_time = -1;
    this._KP_last_pong_time = -1;
};

/**
 * send message to remote server
 *
 * @param msg {service:"", method:"", args:[]}
 * @param opts {} attach info to send method
 * @param cb declaration decided by remote interface
 */
pro.send = function (tracer, msg, opts, cb) {
    tracer && tracer.info('client', __filename, 'send', 'ws-mailbox try to send');
    if (!this.connected) {
        tracer && tracer.error('client', __filename, 'send', 'ws-mailbox not init');
        cb(tracer, new Error('not init.'));
        return;
    }

    if (this.closed) {
        tracer && tracer.error('client', __filename, 'send', 'mailbox alread closed');
        cb(tracer, new Error('mailbox alread closed.'));
        return;
    }

    var id = this.curId++;
    this.requests[id] = cb;
    setCbTimeout(this, id);

    var pkg;
    if (tracer && tracer.isEnabled) {
        pkg = {
            traceId: tracer.id,
            seqId: tracer.seq,
            source: tracer.source,
            remote: tracer.remote,
            id: id,
            msg: msg
        };
    } else {
        pkg = {
            id: id,
            msg: msg
        };
    }
    if (this.bufferMsg) {
        enqueue(this, pkg);
    } else {
        if (this.rpcDebugLog) {
            doSend(this.socket, JSON.stringify(pkg));
        } else {
            doSend(this.socket, StrMsgEncoder.makeDataPieceStr(pkg, "msg"));
        }
        //this.socket.send(JSON.stringify({body: pkg}));
    }
};

var enqueue = function (mailbox, msg) {
    mailbox.queue.push(msg);
};

var flush = function (mailbox) {
    if (mailbox.closed || !mailbox.queue.length) {
        return;
    }
    let pieces = [];
    for (let dataObj of mailbox.queue) {
        if (this.rpcDebugLog) {
            pieces.push(JSON.stringify(dataObj));
        } else {
            pieces.push(StrMsgEncoder.makeDataPieceStr(dataObj, "msg"))
        }
    }
    doSend(mailbox.socket, StrMsgEncoder.makeDataArray(pieces));
    mailbox.queue = [];
};

var doSend = function (socket, dataObj) {
    socket.send(dataObj);
};

var processMsgs = function (mailbox, pkgs) {
    for (var i = 0, l = pkgs.length; i < l; i++) {
        processMsg(mailbox, pkgs[i]);
    }
};

var processMsg = function (mailbox, pkg) {
    var tracer = null;
    var sendErr = null;
    if (this.rpcDebugLog) {
        tracer = new Tracer(mailbox.opts.rpcLogger, mailbox.opts.rpcDebugLog, mailbox.opts.clientId, pkg.source, pkg.resp, pkg.traceId, pkg.seqId);
        pkg = JSON.parse(pkg);
    } else {
        pkg = StrMsgEncoder.getDataPieceFromStr(pkg);
    }
    clearCbTimeout(mailbox, pkg.id);
    var cb = mailbox.requests[pkg.id];
    if (!cb) {
        return;
    }
    delete mailbox.requests[pkg.id];
    var pkgResp = pkg.resp;
    // var args = [tracer, null];

    // pkg.resp.forEach(function(arg){
    //   args.push(arg);
    // });

    cb(tracer, sendErr, pkgResp);
};

var setCbTimeout = function (mailbox, id) {
    var timer = setTimeout(function () {
        clearCbTimeout(mailbox, id);
        if (!!mailbox.requests[id]) {
            delete mailbox.requests[id];
        }
    }, mailbox.timeoutValue);
    mailbox.timeout[id] = timer;
};

var clearCbTimeout = function (mailbox, id) {
    if (!mailbox.timeout[id]) {
        console.warn('timer is not exsits, id: %s', id);
        return;
    }
    clearTimeout(mailbox.timeout[id]);
    delete mailbox.timeout[id];
};

/**
 * Factory method to create mailbox
 *
 * @param {Object} server remote server info {id:"", host:"", port:""}
 * @param {Object} opts construct parameters
 *                      opts.bufferMsg {Boolean} msg should be buffered or send immediately.
 *                      opts.interval {Boolean} msg queue flush interval if bufferMsg is true. default is 50 ms
 */
module.exports.create = function (server, opts) {
    return new MailBox(server, opts || {});
};