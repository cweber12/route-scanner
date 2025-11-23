// shared_state.js
// Module to hold shared state across modules in /orb and /pose
console.log('shared_state.js loaded', performance.now());
const state = {};

export function setShared(key, value) {
    state[key] = value;
}

export function getShared(key) {
    return state[key];
}