// shared_state.js
// Module to hold shared state across modules in /orb and /pose

const state = {};

export function setShared(key, value) {
    state[key] = value;
}

export function getShared(key) {
    return state[key];
}