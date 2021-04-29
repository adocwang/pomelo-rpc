const exp = module.exports;
exp.encodeSend = function (msg) {
    if (typeof msg !== "string") {
        return '{"topic":"rpc","payload":"' + JSON.stringify(msg) + '"}';
    }
    return '{"topic":"rpc","payload":"' + msg + '"}';
};