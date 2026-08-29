"use strict";
var __dsPreview = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // ds-raw:__ds_raw__
  var require_ds_raw = __commonJS({
    "ds-raw:__ds_raw__"(exports, module) {
      init_define_import_meta_env();
      module.exports = window.Vestream;
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function np(p, k) {
        var o = {};
        for (var x in p) if (x !== "children") o[x] = p[x];
        if (k !== void 0) o.key = k;
        return o;
      }
      function jsx2(t, p, k) {
        var c = p && p.children;
        return c === void 0 ? R.createElement(t, np(p, k)) : R.createElement(t, np(p, k), c);
      }
      function jsxs(t, p, k) {
        return R.createElement.apply(R, [t, np(p, k)].concat(p.children));
      }
      module.exports = R;
      module.exports.jsx = jsx2;
      module.exports.jsxs = jsxs;
      module.exports.jsxDEV = function(t, p, k, s) {
        return (s ? jsxs : jsx2)(t, p, k);
      };
      module.exports.Fragment = R.Fragment;
    }
  });

  // .design-sync/previews/TrackInAppCTA.tsx
  var TrackInAppCTA_exports = {};
  __export(TrackInAppCTA_exports, {
    Default: () => Default,
    WithTokenContext: () => WithTokenContext
  });
  init_define_import_meta_env();

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  init_define_import_meta_env();
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.Vestream;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/_fixtures.ts
  init_define_import_meta_env();
  var DAY = 86400;
  var NOW = Math.floor(Date.parse("2024-05-15T12:00:00Z") / 1e3);
  var e18 = (n) => (BigInt(Math.round(n * 1e6)) * 10n ** 12n).toString();
  var RECIPIENT = "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f8b2e";
  var NOVA_STREAM = {
    id: "sablier-1-12345",
    protocol: "sablier",
    category: "vesting",
    chainId: 1,
    recipient: RECIPIENT,
    tokenAddress: "0x1a4cD8b2f9e0c7A6d5E4f3B2a1C0d9E8f7A6b2d8",
    tokenSymbol: "NOVA",
    tokenDecimals: 18,
    totalAmount: e18(5e5),
    withdrawnAmount: e18(18e4),
    claimableNow: e18(42500),
    lockedAmount: e18(277500),
    startTime: NOW - 240 * DAY,
    endTime: NOW + 360 * DAY,
    cliffTime: NOW - 150 * DAY,
    isFullyVested: false,
    nextUnlockTime: NOW + 3 * DAY,
    cancelable: true,
    shape: "linear"
  };
  var FLUX_STREAM = {
    ...NOVA_STREAM,
    id: "hedgey-8453-9876",
    protocol: "hedgey",
    chainId: 8453,
    tokenSymbol: "FLUX",
    tokenAddress: "0x9B8a7C6d5E4f3A2b1C0d9E8f7A6b5C4d3E2f1A0b",
    totalAmount: e18(12e5),
    withdrawnAmount: e18(3e5),
    claimableNow: e18(0),
    lockedAmount: e18(9e5),
    nextUnlockTime: NOW + 21 * DAY,
    shape: "steps"
  };
  var VEST_STREAM = {
    ...NOVA_STREAM,
    id: "uncx-56-4410",
    protocol: "sablier",
    chainId: 56,
    tokenSymbol: "VEST",
    tokenAddress: "0x5D4c3B2a1F0e9D8c7B6a5F4e3D2c1B0a9F8e7D6c",
    totalAmount: e18(9e4),
    withdrawnAmount: e18(9e4),
    claimableNow: e18(0),
    lockedAmount: e18(0),
    isFullyVested: true,
    nextUnlockTime: null,
    endTime: NOW - 30 * DAY
  };
  var KLAR_STREAM = {
    ...NOVA_STREAM,
    id: "unvest-137-2280",
    protocol: "unvest",
    chainId: 137,
    tokenSymbol: "KLAR",
    tokenAddress: "0x7E6d5C4b3A2f1E0d9C8b7A6f5E4d3C2b1A0f9E8d",
    totalAmount: e18(25e4),
    withdrawnAmount: e18(25e3),
    claimableNow: e18(12e3),
    lockedAmount: e18(213e3),
    nextUnlockTime: NOW + 9 * DAY
  };

  // .design-sync/previews/TrackInAppCTA.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  var Default = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TrackInAppCTA, { surface: "find_vestings", walletAddress: RECIPIENT });
  var WithTokenContext = () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.TrackInAppCTA, { surface: "explore", walletAddress: RECIPIENT, tokenSymbol: "NOVA", children: "Track NOVA in the app →" });
  return __toCommonJS(TrackInAppCTA_exports);
})();
