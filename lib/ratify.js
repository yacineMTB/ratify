// Load modules

var RequestValidator = require('./RequestValidator.js'),
	SwaggerManager = require('./SwaggerManager.js'),
	Hoek = require('hoek'),
	Boom = require('boom'),
	defaults = {
		pluginName: 'ratify',
		auth: false,
		baseUrl: 'http://localhost',
		startingPath: '/api-docs',
		apiVersion: '',
		responseContentTypes: ['application/json'],
		log: function(){}
	};

// following is yanked from api2 
const asyncPreHandler = function(handler) {
  const asyncPreHandler = function(request, reply) {
    new Promise(resolve => resolve(handler(request)))
      .then(result => reply(result), err => reply(err))
      .done();
  };
  Object.defineProperty(asyncPreHandler, 'name', { value: handler.name || '' });
  return asyncPreHandler;
};

const flagMapping = {
  Organizations: 'organizations_api',
}

const throwNotImplementedIfFeatureFlagNotEnabled = (featureFlagName) => {
  return asyncPreHandler((req) => {
    // this is a hack, we should be able to get the tenant from req.context().tenant
    const tenant = req.info.host.split('.')[0];
    const route = req.params.path;
    const flag = route && flagMapping[route];
    if (!flag) {
      return new Promise.resolve();
    }
    return req
      .service('featureFlags')
      .getTenantFlags({ tenant }, [flag])
      .then((flags) => {
        const enabled = flags[flag];
        if (!enabled) {
          throw Boom.notImplemented(
            'This feature is not enabled for this tenant.'
          );
        }
      });
  });
};

function register(plugin, options) {

	const settings = Hoek.applyToDefaults(defaults, options || {});

	if (!options.disableSwagger) {
		const swaggerManager = new SwaggerManager(settings);
		plugin.route({
			method: 'GET',
			path: settings.startingPath + '/{path*}',
      pre: [throwNotImplementedIfFeatureFlagNotEnabled()],
			config: {
				auth: settings.auth,
				handler: function(request) {
					let routes = request.server.table();

					routes = routes.filter(function (item) {
						return (request.route.path !== item.path && item.method !== 'options');
					});

					if (!request.params.path) {
						return swaggerManager.getResourceListingModel(routes);
					}
					else if (request.params.path && swaggerManager.isValidApi(routes, request.params.path)) {
						return swaggerManager.getApiDeclarationModel(routes, request.params.path);
					}
					else {
						throw Boom.notFound();
					}
				}
			}
		});
	}

	RequestValidator(plugin, settings);
}

module.exports = {
	name: 'ratify',
	register
};
