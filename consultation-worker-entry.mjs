import { DurableObject } from 'cloudflare:workers';
import workerDefault from './cloudflare-worker-sw-proxy.js';
import { handleGeminiRelayRequest } from './consultation-worker.mjs';

export class KtnGeminiRelayDO extends DurableObject {
  async fetch(request) {
    return handleGeminiRelayRequest(request);
  }
}

export default workerDefault;
