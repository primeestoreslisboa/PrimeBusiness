// Compatibility shim for browsers/environments trying to load /env.mjs directly.
// Some cached/injected clients expect __DEFINES__ to exist.
if (typeof globalThis.__DEFINES__ === 'undefined') {
  globalThis.__DEFINES__ = {};
}

export const __DEFINES__ = globalThis.__DEFINES__;
export default __DEFINES__;
