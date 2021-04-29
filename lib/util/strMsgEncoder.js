const exp = module.exports;
const IS_ARRAY = 11;
exp.makeDataArray = function (dataObj) {
    let msg = String.fromCharCode(IS_ARRAY);
    for (let piece of dataObj) {
        msg += makeDataPieceStr(piece.id, piece.resp) + "\n\n";
    }
    return msg.substr(0, msg.length - 2);
};
/**
 *
 * @param dataStr {string}
 * @return {{}}
 */
exp.splitMsgIntoArray = function (dataStr) {
    let dataObj = [];
    let strings = dataStr.substr(1).split("\n\n");
    for (let string of strings) {
        dataObj.push(getDataPieceFromStr(string));
    }
    return dataObj;
};
/**
 *
 * @param dataStr {string}
 * @return {{}}
 */
exp.isArrayData = function (dataStr) {
    return dataStr.charCodeAt(0) === IS_ARRAY;
};

exp.makeDataPieceStr = function (dataObj) {
    let str = dataObj.id + "\n";
    for (let respPiece of dataObj.resp) {
        if (typeof respPiece !== "string") {
            respPiece = JSON.stringify(respPiece);
        }
        str += respPiece + "\n";
    }
    str = str.substr(0, str.length - 1);
    return str;
};

/**
 *
 * @param dataStr {string}
 */
exp.getDataPieceFromStr = function (dataStr) {
    let dataObj = {};
    let strings = dataStr.split("\n");
    dataObj.resp = strings.splice(1).join("\n");
    dataObj.id = parseInt(strings[0]);
    return dataObj;
};