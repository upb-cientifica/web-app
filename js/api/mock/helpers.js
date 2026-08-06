import { MOCK_LATENCY_MS } from '../../config.js';

export const delay = (ms = MOCK_LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms));

export const genId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const clone = (value) => JSON.parse(JSON.stringify(value));
