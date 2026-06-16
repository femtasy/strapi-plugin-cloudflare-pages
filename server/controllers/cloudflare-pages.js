'use strict';

const axios = require('axios');
const pluginId = require('../../admin/src/pluginId');

module.exports = ({ strapi }) => ({
  index: async (ctx) => {
    const instances = strapi.plugins[pluginId].config('instances');
    const buildsService = strapi.plugin(pluginId).service('cloudflareBuilds');

    ctx.send({
      instances: (instances || []).map((instance, id) => ({
        id,
        name: instance.name,
        buildMonitor: buildsService.isConfigured(instance.build_monitor),
      })),
    });
  },

  publish: async (ctx) => {
    const { id } = ctx.request.body;
    const instances = strapi.plugins[pluginId].config('instances');
    const hookUrl = instances?.[id]?.hook_url;

    if (!hookUrl) {
      return ctx.badRequest('Missing deployment hook URL. Set CLOUDFLARE_PAGES_DEPLOYMENT_HOOK_URL.');
    }

    try {
      await axios.post(hookUrl);
    } catch (error) {
      return ctx.badRequest(error.message);
    }

    ctx.send({
      message: 'ok',
    });
  },

  status: async (ctx) => {
    const { id } = ctx.params;
    const instances = strapi.plugins[pluginId].config('instances');
    const instance = instances?.[Number(id)];

    if (!instance) {
      return ctx.notFound();
    }

    const monitor = instance.build_monitor;
    const buildsService = strapi.plugin(pluginId).service('cloudflareBuilds');

    if (!buildsService.isConfigured(monitor)) {
      return ctx.send({ configured: false, build: null });
    }

    try {
      const { activeBuild, lastDeployment } = await buildsService.getBuildStatus(monitor);
      ctx.send({
        configured: true,
        build: buildsService.serializeBuild(activeBuild),
        lastDeployment: buildsService.serializeLastDeployment(lastDeployment),
      });
    } catch (error) {
      ctx.badRequest(error.message);
    }
  },
});
