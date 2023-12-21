"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var PacketType;
(function (PacketType) {
    PacketType[PacketType["Negotiate"] = 0] = "Negotiate";
    PacketType[PacketType["SessionSetup"] = 1] = "SessionSetup";
    PacketType[PacketType["LogOff"] = 2] = "LogOff";
    PacketType[PacketType["TreeConnect"] = 3] = "TreeConnect";
    PacketType[PacketType["TreeDisconnect"] = 4] = "TreeDisconnect";
    PacketType[PacketType["Create"] = 5] = "Create";
    PacketType[PacketType["Close"] = 6] = "Close";
    PacketType[PacketType["Flush"] = 7] = "Flush";
    PacketType[PacketType["Read"] = 8] = "Read";
    PacketType[PacketType["Write"] = 9] = "Write";
    PacketType[PacketType["Lock"] = 10] = "Lock";
    PacketType[PacketType["InputOutputControl"] = 11] = "InputOutputControl";
    PacketType[PacketType["Cancel"] = 12] = "Cancel";
    PacketType[PacketType["Echo"] = 13] = "Echo";
    PacketType[PacketType["QueryDirectory"] = 14] = "QueryDirectory";
    PacketType[PacketType["ChangeNotify"] = 15] = "ChangeNotify";
    PacketType[PacketType["QueryInfo"] = 16] = "QueryInfo";
    PacketType[PacketType["SetInfo"] = 17] = "SetInfo";
    PacketType[PacketType["OplockBreak"] = 18] = "OplockBreak";
})(PacketType || (PacketType = {}));
;
exports.default = PacketType;
