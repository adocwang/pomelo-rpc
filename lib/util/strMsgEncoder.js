const exp = module.exports;
const IS_ARRAY = 11;
exp.makeDataArray = function (dataObj) {
    let msg = String.fromCharCode(IS_ARRAY);
    for (let piece of dataObj) {
        msg += makeDataPieceStr(piece) + "\n\n";
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

exp.makeDataPieceStr = function (dataObj, dataKey) {
    if (!dataKey) {
        dataKey = "resp";
    }
    let pieces = dataObj[dataKey];
    let str = dataObj.id + "\n";
    for (let piece of pieces) {
        if (typeof piece === "string") {
            str += piece + "\n";
        } else if (typeof piece === "undefined") {
            str += "null\n";
        } else {
            str += JSON.stringify(piece) + "\n";
        }
    }
    str = str.substr(0, str.length - 1);
    return str;
};

/**
 *
 * @param dataStr {string}
 */
exp.getDataPieceFromStr = function (dataStr, dataKey) {
    if (!dataKey) {
        dataKey = "resp";
    }
    let strings = dataStr.split("\n");
    let dataObj = {
        id: parseInt(strings[0])
    };
    let pieces = [];
    for (let i = 1; i < strings.length; i++) {
        if (i === 2) {
            pieces.push(strings[i]);
            continue;
        }
        pieces.push(JSON.parse(strings[i]));
    }
    dataObj[dataKey] = pieces;
    return dataObj;
};