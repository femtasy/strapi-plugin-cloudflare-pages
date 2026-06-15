'use strict';

const axios = require('axios');

const API_BASE = 'https://api.cloudflare.com/client/v4';
const ACTIVE_STATUSES = new Set(['queued', 'initializing', 'running']);
const SUCCESSFUL_DEPLOYMENT_STATUSES = new Set(['stopped']);
const workerTagCache = new Map();

const getApiToken = (monitor) => {
  const envKey = monitor.api_token_env || 'CLOUDFLARE_BUILDS_API_TOKEN';
  const token = process.env[envKey];
  if (!token) {
    throw new Error(`Missing API token env var: ${envKey}`);
  }
  return token;
};

module.exports = ({ strapi }) => ({
  isConfigured(monitor) {
    return Boolean(
      monitor?.account_id && (monitor.worker_name || monitor.worker_tag)
    );
  },

  async getWorkerTag(monitor) {
    if (monitor.worker_tag) {
      return monitor.worker_tag;
    }

    const cacheKey = `${monitor.account_id}:${monitor.worker_name}`;
    if (workerTagCache.has(cacheKey)) {
      return workerTagCache.get(cacheKey);
    }

    const apiToken = getApiToken(monitor);
    const response = await axios.get(
      `${API_BASE}/accounts/${monitor.account_id}/workers/scripts`,
      { headers: { Authorization: `Bearer ${apiToken}` } }
    );

    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || 'Cloudflare API error');
    }

    const worker = response.data.result.find((script) => script.id === monitor.worker_name);
    if (!worker?.tag) {
      throw new Error(`Worker not found: ${monitor.worker_name}`);
    }

    workerTagCache.set(cacheKey, worker.tag);
    return worker.tag;
  },

  async fetchBuilds(monitor) {
    const apiToken = getApiToken(monitor);
    const workerTag = await this.getWorkerTag(monitor);
    const response = await axios.get(
      `${API_BASE}/accounts/${monitor.account_id}/builds/workers/${workerTag}/builds`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
        params: { per_page: 20 },
      }
    );

    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || 'Cloudflare API error');
    }

    return response.data.result || [];
  },

  async getBuildStatus(monitor) {
    const builds = await this.fetchBuilds(monitor);

    const activeBuild = builds
      .filter((build) => ACTIVE_STATUSES.has(build.status))
      .sort((a, b) => new Date(b.created_on) - new Date(a.created_on))[0] || null;

    const lastDeployment = builds
      .filter(
        (build) =>
          SUCCESSFUL_DEPLOYMENT_STATUSES.has(build.status) && build.build_outcome === 'success'
      )
      .sort(
        (a, b) =>
          new Date(b.stopped_on || b.modified_on || b.created_on) -
          new Date(a.stopped_on || a.modified_on || a.created_on)
      )[0] || null;

    return { activeBuild, lastDeployment };
  },

  serializeBuild(build) {
    if (!build) {
      return null;
    }

    return {
      build_uuid: build.build_uuid,
      status: build.status,
      branch: build.build_trigger_metadata?.branch || null,
      commit_hash: build.build_trigger_metadata?.commit_hash || null,
      author: build.build_trigger_metadata?.author || null,
      created_on: build.created_on || null,
    };
  },

  serializeLastDeployment(build) {
    if (!build) {
      return null;
    }

    return {
      deployed_on: build.stopped_on || build.modified_on || build.created_on || null,
    };
  },
});
