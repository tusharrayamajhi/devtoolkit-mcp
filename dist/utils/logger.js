"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setLogLevel = setLogLevel;
exports.getLogLevel = getLogLevel;
exports.sendLog = sendLog;
const LEVEL_PRIORITY = {
    debug: 0, info: 1, notice: 2, warning: 3,
    error: 4, critical: 5, alert: 6, emergency: 7,
};
let currentLevel = "info";
function setLogLevel(level) {
    currentLevel = level;
}
function getLogLevel() {
    return currentLevel;
}
async function sendLog(server, level, data, logger) {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel])
        return;
    try {
        await server.notification({
            method: "notifications/message",
            params: {
                level,
                logger: logger ?? "devtoolkit",
                data,
            },
        });
    }
    catch {
        // client may not support logging — silently ignore
    }
}
//# sourceMappingURL=logger.js.map