"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _defaults = _interopRequireDefault(require("./defaults"));
var logging = _interopRequireWildcard(require("./logger"));
var _Config = _interopRequireDefault(require("./Config"));
var _PromiseRouter = _interopRequireDefault(require("./PromiseRouter"));
var _requiredParameter = _interopRequireDefault(require("./requiredParameter"));
var _AnalyticsRouter = require("./Routers/AnalyticsRouter");
var _ClassesRouter = require("./Routers/ClassesRouter");
var _FeaturesRouter = require("./Routers/FeaturesRouter");
var _FilesRouter = require("./Routers/FilesRouter");
var _FunctionsRouter = require("./Routers/FunctionsRouter");
var _GlobalConfigRouter = require("./Routers/GlobalConfigRouter");
var _GraphQLRouter = require("./Routers/GraphQLRouter");
var _HooksRouter = require("./Routers/HooksRouter");
var _IAPValidationRouter = require("./Routers/IAPValidationRouter");
var _InstallationsRouter = require("./Routers/InstallationsRouter");
var _LogsRouter = require("./Routers/LogsRouter");
var _ParseLiveQueryServer = require("./LiveQuery/ParseLiveQueryServer");
var _PagesRouter = require("./Routers/PagesRouter");
var _PublicAPIRouter = require("./Routers/PublicAPIRouter");
var _PushRouter = require("./Routers/PushRouter");
var _CloudCodeRouter = require("./Routers/CloudCodeRouter");
var _RolesRouter = require("./Routers/RolesRouter");
var _SchemasRouter = require("./Routers/SchemasRouter");
var _SessionsRouter = require("./Routers/SessionsRouter");
var _UsersRouter = require("./Routers/UsersRouter");
var _PurgeRouter = require("./Routers/PurgeRouter");
var _AudiencesRouter = require("./Routers/AudiencesRouter");
var _AggregateRouter = require("./Routers/AggregateRouter");
var _ParseServerRESTController = require("./ParseServerRESTController");
var controllers = _interopRequireWildcard(require("./Controllers"));
var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");
var _SecurityRouter = require("./Routers/SecurityRouter");
var _CheckRunner = _interopRequireDefault(require("./Security/CheckRunner"));
var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));
var _DefinedSchemas = require("./SchemaMigrations/DefinedSchemas");
var _Definitions = _interopRequireDefault(require("./Options/Definitions"));
var _TestUtils = require("./TestUtils");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
  express = require('express'),
  middlewares = require('./middlewares'),
  Parse = require('parse/node').Parse,
  {
    parse
  } = require('graphql'),
  path = require('path'),
  fs = require('fs');
// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

// Track connections to destroy them on shutdown
const connections = new _TestUtils.Connections();

// ParseServer works like a constructor of an express app.
// https://parseplatform.org/parse-server/api/master/ParseServerOptions.html
class ParseServer {
  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options) {
    // Scan for deprecated Parse Server options
    _Deprecator.default.scanParseServerOptions(options);
    const interfaces = JSON.parse(JSON.stringify(_Definitions.default));
    function getValidObject(root) {
      const result = {};
      for (const key in root) {
        if (Object.prototype.hasOwnProperty.call(root[key], 'type')) {
          if (root[key].type.endsWith('[]')) {
            result[key] = [getValidObject(interfaces[root[key].type.slice(0, -2)])];
          } else {
            result[key] = getValidObject(interfaces[root[key].type]);
          }
        } else {
          result[key] = '';
        }
      }
      return result;
    }
    const optionsBlueprint = getValidObject(interfaces['ParseServerOptions']);
    function validateKeyNames(original, ref, name = '') {
      let result = [];
      const prefix = name + (name !== '' ? '.' : '');
      for (const key in original) {
        if (!Object.prototype.hasOwnProperty.call(ref, key)) {
          result.push(prefix + key);
        } else {
          if (ref[key] === '') {
            continue;
          }
          let res = [];
          if (Array.isArray(original[key]) && Array.isArray(ref[key])) {
            const type = ref[key][0];
            original[key].forEach((item, idx) => {
              if (typeof item === 'object' && item !== null) {
                res = res.concat(validateKeyNames(item, type, prefix + key + `[${idx}]`));
              }
            });
          } else if (typeof original[key] === 'object' && typeof ref[key] === 'object') {
            res = validateKeyNames(original[key], ref[key], prefix + key);
          }
          result = result.concat(res);
        }
      }
      return result;
    }
    const diff = validateKeyNames(options, optionsBlueprint);
    if (diff.length > 0) {
      const logger = logging.logger;
      logger.error(`Invalid key(s) found in Parse Server configuration: ${diff.join(', ')}`);
    }

    // Set option defaults
    injectDefaults(options);
    const {
      appId = (0, _requiredParameter.default)('You must provide an appId!'),
      masterKey = (0, _requiredParameter.default)('You must provide a masterKey!'),
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!')
    } = options;
    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    _Config.default.validateOptions(options);
    const allControllers = controllers.getControllers(options);
    options.state = 'initialized';
    this.config = _Config.default.put(Object.assign({}, options, allControllers));
    this.config.masterKeyIpsStore = new Map();
    this.config.maintenanceKeyIpsStore = new Map();
    logging.setLogger(allControllers.loggerController);
  }

  /**
   * Starts Parse Server as an express app; this promise resolves when Parse Server is ready to accept requests.
   */

  async start() {
    try {
      if (this.config.state === 'ok') {
        return this;
      }
      this.config.state = 'starting';
      _Config.default.put(this.config);
      const {
        databaseController,
        hooksController,
        cacheController,
        cloud,
        security,
        schema,
        liveQueryController
      } = this.config;
      try {
        await databaseController.performInitialization();
      } catch (e) {
        if (e.code !== Parse.Error.DUPLICATE_VALUE) {
          throw e;
        }
      }
      const pushController = await controllers.getPushController(this.config);
      await hooksController.load();
      const startupPromises = [this.config.loadMasterKey?.()];
      if (schema) {
        startupPromises.push(new _DefinedSchemas.DefinedSchemas(schema, this.config).execute());
      }
      if (cacheController.adapter?.connect && typeof cacheController.adapter.connect === 'function') {
        startupPromises.push(cacheController.adapter.connect());
      }
      startupPromises.push(liveQueryController.connect());
      await Promise.all(startupPromises);
      if (cloud) {
        addParseCloud();
        if (typeof cloud === 'function') {
          await Promise.resolve(cloud(Parse));
        } else if (typeof cloud === 'string') {
          let json;
          if (process.env.npm_package_json) {
            json = require(process.env.npm_package_json);
          }
          if (process.env.npm_package_type === 'module' || json?.type === 'module') {
            await import(path.resolve(process.cwd(), cloud));
          } else {
            require(path.resolve(process.cwd(), cloud));
          }
        } else {
          throw "argument 'cloud' must either be a string or a function";
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      if (security && security.enableCheck && security.enableCheckLog) {
        new _CheckRunner.default(security).run();
      }
      this.config.state = 'ok';
      this.config = {
        ...this.config,
        ...pushController
      };
      _Config.default.put(this.config);
      return this;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      this.config.state = 'error';
      throw error;
    }
  }
  get app() {
    if (!this._app) {
      this._app = ParseServer.app(this.config);
    }
    return this._app;
  }

  /**
   * Stops the parse server, cancels any ongoing requests and closes all connections.
   *
   * Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM
   * if it has client connections that haven't timed out.
   * (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
   *
   * @returns {Promise<void>} a promise that resolves when the server is stopped
   */
  async handleShutdown() {
    const serverClosePromise = (0, _TestUtils.resolvingPromise)();
    const liveQueryServerClosePromise = (0, _TestUtils.resolvingPromise)();
    const promises = [];
    this.server.close(error => {
      /* istanbul ignore next */
      if (error) {
        // eslint-disable-next-line no-console
        console.error('Error while closing parse server', error);
      }
      serverClosePromise.resolve();
    });
    if (this.liveQueryServer?.server?.close && this.liveQueryServer.server !== this.server) {
      this.liveQueryServer.server.close(error => {
        /* istanbul ignore next */
        if (error) {
          // eslint-disable-next-line no-console
          console.error('Error while closing live query server', error);
        }
        liveQueryServerClosePromise.resolve();
      });
    } else {
      liveQueryServerClosePromise.resolve();
    }
    const {
      adapter: databaseAdapter
    } = this.config.databaseController;
    if (databaseAdapter && typeof databaseAdapter.handleShutdown === 'function') {
      promises.push(databaseAdapter.handleShutdown());
    }
    const {
      adapter: fileAdapter
    } = this.config.filesController;
    if (fileAdapter && typeof fileAdapter.handleShutdown === 'function') {
      promises.push(fileAdapter.handleShutdown());
    }
    const {
      adapter: cacheAdapter
    } = this.config.cacheController;
    if (cacheAdapter && typeof cacheAdapter.handleShutdown === 'function') {
      promises.push(cacheAdapter.handleShutdown());
    }
    if (this.liveQueryServer) {
      promises.push(this.liveQueryServer.shutdown());
    }
    await Promise.all(promises);
    connections.destroyAll();
    await Promise.all([serverClosePromise, liveQueryServerClosePromise]);
    if (this.config.serverCloseComplete) {
      this.config.serverCloseComplete();
    }
  }

  /**
   * @static
   * Create an express app for the parse server
   * @param {Object} options let you specify the maxUploadSize when creating the express app  */
  static app(options) {
    const {
      maxUploadSize = '20mb',
      appId,
      directAccess,
      pages,
      rateLimit = []
    } = options;
    // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
    var api = express();
    //api.use("/apps", express.static(__dirname + "/public"));
    api.use(middlewares.allowCrossDomain(appId));
    api.use(middlewares.allowDoubleForwardSlash);
    // File handling needs to be before default middlewares are applied
    api.use('/', new _FilesRouter.FilesRouter().expressRouter({
      maxUploadSize: maxUploadSize
    }));
    api.use('/health', function (req, res) {
      res.status(options.state === 'ok' ? 200 : 503);
      if (options.state === 'starting') {
        res.set('Retry-After', 1);
      }
      res.json({
        status: options.state
      });
    });
    api.use('/', express.urlencoded({
      extended: false
    }), pages.enableRouter ? new _PagesRouter.PagesRouter(pages).expressRouter() : new _PublicAPIRouter.PublicAPIRouter().expressRouter());
    api.use(express.json({
      type: '*/*',
      limit: maxUploadSize
    }));
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);
    api.set('query parser', 'extended');
    const routes = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const route of routes) {
      middlewares.addRateLimit(route, options);
    }
    api.use(middlewares.handleParseSession);
    const appRouter = ParseServer.promiseRouter({
      appId
    });
    api.use(appRouter.expressRouter());
    api.use(middlewares.handleParseErrors);

    // run the following when not testing
    if (!process.env.TESTING) {
      //This causes tests to spew some useless warnings, so disable in test
      /* istanbul ignore next */
      process.on('uncaughtException', err => {
        if (err.code === 'EADDRINUSE') {
          // user-friendly message for this common error
          process.stderr.write(`Unable to listen on port ${err.port}. The port is already in use.`);
          process.exit(0);
        } else {
          if (err.message) {
            process.stderr.write('An uncaught exception occurred: ' + err.message);
          }
          if (err.stack) {
            process.stderr.write('Stack Trace:\n' + err.stack);
          } else {
            process.stderr.write(err);
          }
          process.exit(1);
        }
      });
      // verify the server url after a 'mount' event is received
      /* istanbul ignore next */
      api.on('mount', async function () {
        await new Promise(resolve => setTimeout(resolve, 1000));
        ParseServer.verifyServerUrl();
      });
    }
    if (process.env.PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS === '1' || directAccess) {
      Parse.CoreManager.setRESTController((0, _ParseServerRESTController.ParseServerRESTController)(appId, appRouter));
    }
    return api;
  }
  static promiseRouter({
    appId
  }) {
    const routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter(), new _FeaturesRouter.FeaturesRouter(), new _GlobalConfigRouter.GlobalConfigRouter(), new _GraphQLRouter.GraphQLRouter(), new _PurgeRouter.PurgeRouter(), new _HooksRouter.HooksRouter(), new _CloudCodeRouter.CloudCodeRouter(), new _AudiencesRouter.AudiencesRouter(), new _AggregateRouter.AggregateRouter(), new _SecurityRouter.SecurityRouter()];
    const routes = routers.reduce((memo, router) => {
      return memo.concat(router.routes);
    }, []);
    const appRouter = new _PromiseRouter.default(routes, appId);
    batch.mountOnto(appRouter);
    return appRouter;
  }

  /**
   * starts the parse server's express app
   * @param {ParseServerOptions} options to use to start the server
   * @returns {ParseServer} the parse server instance
   */

  async startApp(options) {
    try {
      await this.start();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error on ParseServer.startApp: ', e);
      throw e;
    }
    const app = express();
    if (options.middleware) {
      let middleware;
      if (typeof options.middleware == 'string') {
        middleware = require(path.resolve(process.cwd(), options.middleware));
      } else {
        middleware = options.middleware; // use as-is let express fail
      }
      app.use(middleware);
    }
    app.use(options.mountPath, this.app);
    if (options.mountGraphQL === true || options.mountPlayground === true) {
      let graphQLCustomTypeDefs = undefined;
      if (typeof options.graphQLSchema === 'string') {
        graphQLCustomTypeDefs = parse(fs.readFileSync(options.graphQLSchema, 'utf8'));
      } else if (typeof options.graphQLSchema === 'object' || typeof options.graphQLSchema === 'function') {
        graphQLCustomTypeDefs = options.graphQLSchema;
      }
      const parseGraphQLServer = new _ParseGraphQLServer.ParseGraphQLServer(this, {
        graphQLPath: options.graphQLPath,
        playgroundPath: options.playgroundPath,
        graphQLCustomTypeDefs
      });
      if (options.mountGraphQL) {
        parseGraphQLServer.applyGraphQL(app);
      }
      if (options.mountPlayground) {
        parseGraphQLServer.applyPlayground(app);
      }
    }
    const server = await new Promise(resolve => {
      app.listen(options.port, options.host, function () {
        resolve(this);
      });
    });
    this.server = server;
    connections.track(server);
    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = await ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions, options);
      if (this.liveQueryServer.server !== this.server) {
        connections.track(this.liveQueryServer.server);
      }
    }
    if (options.trustProxy) {
      app.set('trust proxy', options.trustProxy);
    }
    /* istanbul ignore next */
    if (!process.env.TESTING) {
      configureListeners(this);
    }
    this.expressApp = app;
    return this;
  }

  /**
   * Creates a new ParseServer and starts it.
   * @param {ParseServerOptions} options used to start the server
   * @returns {ParseServer} the parse server instance
   */
  static async startApp(options) {
    const parseServer = new ParseServer(options);
    return parseServer.startApp(options);
  }

  /**
   * Helper method to create a liveQuery server
   * @static
   * @param {Server} httpServer an optional http server to pass
   * @param {LiveQueryServerOptions} config options for the liveQueryServer
   * @param {ParseServerOptions} options options for the ParseServer
   * @returns {Promise<ParseLiveQueryServer>} the live query server instance
   */
  static async createLiveQueryServer(httpServer, config, options) {
    if (!httpServer || config && config.port) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }
    const server = new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config, options);
    await server.connect();
    return server;
  }
  static async verifyServerUrl() {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
      const isValidHttpUrl = string => {
        let url;
        try {
          url = new URL(string);
        } catch (_) {
          return false;
        }
        return url.protocol === 'http:' || url.protocol === 'https:';
      };
      const url = `${Parse.serverURL.replace(/\/$/, '')}/health`;
      if (!isValidHttpUrl(url)) {
        // eslint-disable-next-line no-console
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}' as the URL is invalid.` + ` Cloud code and push notifications may be unavailable!\n`);
        return;
      }
      const request = require('./request');
      const response = await request({
        url
      }).catch(response => response);
      const json = response.data || null;
      const retry = response.headers?.['retry-after'];
      if (retry) {
        await new Promise(resolve => setTimeout(resolve, retry * 1000));
        return this.verifyServerUrl();
      }
      if (response.status !== 200 || json?.status !== 'ok') {
        /* eslint-disable no-console */
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}'.` + ` Cloud code and push notifications may be unavailable!\n`);
        /* eslint-enable no-console */
        return;
      }
      return true;
    }
  }
}
function addParseCloud() {
  const ParseCloud = require('./cloud-code/Parse.Cloud');
  const ParseServer = require('./cloud-code/Parse.Server');
  Object.defineProperty(Parse, 'Server', {
    get() {
      const conf = _Config.default.get(Parse.applicationId);
      return {
        ...conf,
        ...ParseServer
      };
    },
    set(newVal) {
      newVal.appId = Parse.applicationId;
      _Config.default.put(newVal);
    },
    configurable: true
  });
  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}
function injectDefaults(options) {
  Object.keys(_defaults.default).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(options, key)) {
      options[key] = _defaults.default[key];
    }
  });
  if (!Object.prototype.hasOwnProperty.call(options, 'serverURL')) {
    options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
  }

  // Reserved Characters
  if (options.appId) {
    const regex = /[!#$%'()*+&/:;=?@[\]{}^,|<>]/g;
    if (options.appId.match(regex)) {
      // eslint-disable-next-line no-console
      console.warn(`\nWARNING, appId that contains special characters can cause issues while using with urls.\n`);
    }
  }

  // Backwards compatibility
  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING && console.warn(`\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`);
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(new Set([...(_defaults.default.userSensitiveFields || []), ...(options.userSensitiveFields || [])]));

    // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.
    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({
        _User: []
      }, options.protectedFields);
    }
    options.protectedFields['_User']['*'] = Array.from(new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields]));
  }

  // Merge protectedFields options with defaults.
  Object.keys(_defaults.default.protectedFields).forEach(c => {
    const cur = options.protectedFields[c];
    if (!cur) {
      options.protectedFields[c] = _defaults.default.protectedFields[c];
    } else {
      Object.keys(_defaults.default.protectedFields[c]).forEach(r => {
        const unq = new Set([...(options.protectedFields[c][r] || []), ..._defaults.default.protectedFields[c][r]]);
        options.protectedFields[c][r] = Array.from(unq);
      });
    }
  });
}

// Those can't be tested as it requires a subprocess
/* istanbul ignore next */
function configureListeners(parseServer) {
  const handleShutdown = function () {
    process.stdout.write('Termination signal received. Shutting down.');
    parseServer.handleShutdown();
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}
var _default = exports.default = ParseServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZGVmYXVsdHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsImxvZ2dpbmciLCJfaW50ZXJvcFJlcXVpcmVXaWxkY2FyZCIsIl9Db25maWciLCJfUHJvbWlzZVJvdXRlciIsIl9yZXF1aXJlZFBhcmFtZXRlciIsIl9BbmFseXRpY3NSb3V0ZXIiLCJfQ2xhc3Nlc1JvdXRlciIsIl9GZWF0dXJlc1JvdXRlciIsIl9GaWxlc1JvdXRlciIsIl9GdW5jdGlvbnNSb3V0ZXIiLCJfR2xvYmFsQ29uZmlnUm91dGVyIiwiX0dyYXBoUUxSb3V0ZXIiLCJfSG9va3NSb3V0ZXIiLCJfSUFQVmFsaWRhdGlvblJvdXRlciIsIl9JbnN0YWxsYXRpb25zUm91dGVyIiwiX0xvZ3NSb3V0ZXIiLCJfUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJfUGFnZXNSb3V0ZXIiLCJfUHVibGljQVBJUm91dGVyIiwiX1B1c2hSb3V0ZXIiLCJfQ2xvdWRDb2RlUm91dGVyIiwiX1JvbGVzUm91dGVyIiwiX1NjaGVtYXNSb3V0ZXIiLCJfU2Vzc2lvbnNSb3V0ZXIiLCJfVXNlcnNSb3V0ZXIiLCJfUHVyZ2VSb3V0ZXIiLCJfQXVkaWVuY2VzUm91dGVyIiwiX0FnZ3JlZ2F0ZVJvdXRlciIsIl9QYXJzZVNlcnZlclJFU1RDb250cm9sbGVyIiwiY29udHJvbGxlcnMiLCJfUGFyc2VHcmFwaFFMU2VydmVyIiwiX1NlY3VyaXR5Um91dGVyIiwiX0NoZWNrUnVubmVyIiwiX0RlcHJlY2F0b3IiLCJfRGVmaW5lZFNjaGVtYXMiLCJfRGVmaW5pdGlvbnMiLCJfVGVzdFV0aWxzIiwiZSIsInQiLCJXZWFrTWFwIiwiciIsIm4iLCJfX2VzTW9kdWxlIiwibyIsImkiLCJmIiwiX19wcm90b19fIiwiZGVmYXVsdCIsImhhcyIsImdldCIsInNldCIsImhhc093blByb3BlcnR5IiwiY2FsbCIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwiYmF0Y2giLCJleHByZXNzIiwibWlkZGxld2FyZXMiLCJQYXJzZSIsInBhcnNlIiwicGF0aCIsImZzIiwiYWRkUGFyc2VDbG91ZCIsImNvbm5lY3Rpb25zIiwiQ29ubmVjdGlvbnMiLCJQYXJzZVNlcnZlciIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsIkRlcHJlY2F0b3IiLCJzY2FuUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaW50ZXJmYWNlcyIsIkpTT04iLCJzdHJpbmdpZnkiLCJPcHRpb25zRGVmaW5pdGlvbnMiLCJnZXRWYWxpZE9iamVjdCIsInJvb3QiLCJyZXN1bHQiLCJrZXkiLCJwcm90b3R5cGUiLCJ0eXBlIiwiZW5kc1dpdGgiLCJzbGljZSIsIm9wdGlvbnNCbHVlcHJpbnQiLCJ2YWxpZGF0ZUtleU5hbWVzIiwib3JpZ2luYWwiLCJyZWYiLCJuYW1lIiwicHJlZml4IiwicHVzaCIsInJlcyIsIkFycmF5IiwiaXNBcnJheSIsImZvckVhY2giLCJpdGVtIiwiaWR4IiwiY29uY2F0IiwiZGlmZiIsImxlbmd0aCIsImxvZ2dlciIsImVycm9yIiwiam9pbiIsImluamVjdERlZmF1bHRzIiwiYXBwSWQiLCJyZXF1aXJlZFBhcmFtZXRlciIsIm1hc3RlcktleSIsImphdmFzY3JpcHRLZXkiLCJzZXJ2ZXJVUkwiLCJpbml0aWFsaXplIiwiQ29uZmlnIiwidmFsaWRhdGVPcHRpb25zIiwiYWxsQ29udHJvbGxlcnMiLCJnZXRDb250cm9sbGVycyIsInN0YXRlIiwiY29uZmlnIiwicHV0IiwiYXNzaWduIiwibWFzdGVyS2V5SXBzU3RvcmUiLCJNYXAiLCJtYWludGVuYW5jZUtleUlwc1N0b3JlIiwic2V0TG9nZ2VyIiwibG9nZ2VyQ29udHJvbGxlciIsInN0YXJ0IiwiZGF0YWJhc2VDb250cm9sbGVyIiwiaG9va3NDb250cm9sbGVyIiwiY2FjaGVDb250cm9sbGVyIiwiY2xvdWQiLCJzZWN1cml0eSIsInNjaGVtYSIsImxpdmVRdWVyeUNvbnRyb2xsZXIiLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJjb2RlIiwiRXJyb3IiLCJEVVBMSUNBVEVfVkFMVUUiLCJwdXNoQ29udHJvbGxlciIsImdldFB1c2hDb250cm9sbGVyIiwibG9hZCIsInN0YXJ0dXBQcm9taXNlcyIsImxvYWRNYXN0ZXJLZXkiLCJEZWZpbmVkU2NoZW1hcyIsImV4ZWN1dGUiLCJhZGFwdGVyIiwiY29ubmVjdCIsIlByb21pc2UiLCJhbGwiLCJyZXNvbHZlIiwianNvbiIsInByb2Nlc3MiLCJlbnYiLCJucG1fcGFja2FnZV9qc29uIiwibnBtX3BhY2thZ2VfdHlwZSIsImN3ZCIsInNldFRpbWVvdXQiLCJlbmFibGVDaGVjayIsImVuYWJsZUNoZWNrTG9nIiwiQ2hlY2tSdW5uZXIiLCJydW4iLCJjb25zb2xlIiwiYXBwIiwiX2FwcCIsImhhbmRsZVNodXRkb3duIiwic2VydmVyQ2xvc2VQcm9taXNlIiwicmVzb2x2aW5nUHJvbWlzZSIsImxpdmVRdWVyeVNlcnZlckNsb3NlUHJvbWlzZSIsInByb21pc2VzIiwic2VydmVyIiwiY2xvc2UiLCJsaXZlUXVlcnlTZXJ2ZXIiLCJkYXRhYmFzZUFkYXB0ZXIiLCJmaWxlQWRhcHRlciIsImZpbGVzQ29udHJvbGxlciIsImNhY2hlQWRhcHRlciIsInNodXRkb3duIiwiZGVzdHJveUFsbCIsInNlcnZlckNsb3NlQ29tcGxldGUiLCJtYXhVcGxvYWRTaXplIiwiZGlyZWN0QWNjZXNzIiwicGFnZXMiLCJyYXRlTGltaXQiLCJhcGkiLCJ1c2UiLCJhbGxvd0Nyb3NzRG9tYWluIiwiYWxsb3dEb3VibGVGb3J3YXJkU2xhc2giLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJyZXEiLCJzdGF0dXMiLCJ1cmxlbmNvZGVkIiwiZXh0ZW5kZWQiLCJlbmFibGVSb3V0ZXIiLCJQYWdlc1JvdXRlciIsIlB1YmxpY0FQSVJvdXRlciIsImxpbWl0IiwiYWxsb3dNZXRob2RPdmVycmlkZSIsImhhbmRsZVBhcnNlSGVhZGVycyIsInJvdXRlcyIsInJvdXRlIiwiYWRkUmF0ZUxpbWl0IiwiaGFuZGxlUGFyc2VTZXNzaW9uIiwiYXBwUm91dGVyIiwicHJvbWlzZVJvdXRlciIsImhhbmRsZVBhcnNlRXJyb3JzIiwiVEVTVElORyIsIm9uIiwiZXJyIiwic3RkZXJyIiwid3JpdGUiLCJwb3J0IiwiZXhpdCIsIm1lc3NhZ2UiLCJzdGFjayIsInZlcmlmeVNlcnZlclVybCIsIlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MiLCJDb3JlTWFuYWdlciIsInNldFJFU1RDb250cm9sbGVyIiwiUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciIsInJvdXRlcnMiLCJDbGFzc2VzUm91dGVyIiwiVXNlcnNSb3V0ZXIiLCJTZXNzaW9uc1JvdXRlciIsIlJvbGVzUm91dGVyIiwiQW5hbHl0aWNzUm91dGVyIiwiSW5zdGFsbGF0aW9uc1JvdXRlciIsIkZ1bmN0aW9uc1JvdXRlciIsIlNjaGVtYXNSb3V0ZXIiLCJQdXNoUm91dGVyIiwiTG9nc1JvdXRlciIsIklBUFZhbGlkYXRpb25Sb3V0ZXIiLCJGZWF0dXJlc1JvdXRlciIsIkdsb2JhbENvbmZpZ1JvdXRlciIsIkdyYXBoUUxSb3V0ZXIiLCJQdXJnZVJvdXRlciIsIkhvb2tzUm91dGVyIiwiQ2xvdWRDb2RlUm91dGVyIiwiQXVkaWVuY2VzUm91dGVyIiwiQWdncmVnYXRlUm91dGVyIiwiU2VjdXJpdHlSb3V0ZXIiLCJyZWR1Y2UiLCJtZW1vIiwicm91dGVyIiwiUHJvbWlzZVJvdXRlciIsIm1vdW50T250byIsInN0YXJ0QXBwIiwibWlkZGxld2FyZSIsIm1vdW50UGF0aCIsIm1vdW50R3JhcGhRTCIsIm1vdW50UGxheWdyb3VuZCIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsInVuZGVmaW5lZCIsImdyYXBoUUxTY2hlbWEiLCJyZWFkRmlsZVN5bmMiLCJwYXJzZUdyYXBoUUxTZXJ2ZXIiLCJQYXJzZUdyYXBoUUxTZXJ2ZXIiLCJncmFwaFFMUGF0aCIsInBsYXlncm91bmRQYXRoIiwiYXBwbHlHcmFwaFFMIiwiYXBwbHlQbGF5Z3JvdW5kIiwibGlzdGVuIiwiaG9zdCIsInRyYWNrIiwic3RhcnRMaXZlUXVlcnlTZXJ2ZXIiLCJsaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIiwiY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyIiwidHJ1c3RQcm94eSIsImNvbmZpZ3VyZUxpc3RlbmVycyIsImV4cHJlc3NBcHAiLCJwYXJzZVNlcnZlciIsImh0dHBTZXJ2ZXIiLCJjcmVhdGVTZXJ2ZXIiLCJQYXJzZUxpdmVRdWVyeVNlcnZlciIsImlzVmFsaWRIdHRwVXJsIiwic3RyaW5nIiwidXJsIiwiVVJMIiwiXyIsInByb3RvY29sIiwicmVwbGFjZSIsIndhcm4iLCJyZXF1ZXN0IiwicmVzcG9uc2UiLCJjYXRjaCIsImRhdGEiLCJyZXRyeSIsImhlYWRlcnMiLCJQYXJzZUNsb3VkIiwiY29uZiIsImFwcGxpY2F0aW9uSWQiLCJuZXdWYWwiLCJjb25maWd1cmFibGUiLCJDbG91ZCIsImdsb2JhbCIsImtleXMiLCJkZWZhdWx0cyIsInJlZ2V4IiwibWF0Y2giLCJ1c2VyU2Vuc2l0aXZlRmllbGRzIiwiZnJvbSIsIlNldCIsInByb3RlY3RlZEZpZWxkcyIsIl9Vc2VyIiwiYyIsImN1ciIsInVucSIsInN0ZG91dCIsIl9kZWZhdWx0IiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBQYXJzZVNlcnZlciAtIG9wZW4tc291cmNlIGNvbXBhdGlibGUgQVBJIFNlcnZlciBmb3IgUGFyc2UgYXBwc1xuXG52YXIgYmF0Y2ggPSByZXF1aXJlKCcuL2JhdGNoJyksXG4gIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyksXG4gIG1pZGRsZXdhcmVzID0gcmVxdWlyZSgnLi9taWRkbGV3YXJlcycpLFxuICBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZSxcbiAgeyBwYXJzZSB9ID0gcmVxdWlyZSgnZ3JhcGhxbCcpLFxuICBwYXRoID0gcmVxdWlyZSgncGF0aCcpLFxuICBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucywgTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi9kZWZhdWx0cyc7XG5pbXBvcnQgKiBhcyBsb2dnaW5nIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi9Db25maWcnO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCB7IEFuYWx5dGljc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BbmFseXRpY3NSb3V0ZXInO1xuaW1wb3J0IHsgQ2xhc3Nlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbGFzc2VzUm91dGVyJztcbmltcG9ydCB7IEZlYXR1cmVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZlYXR1cmVzUm91dGVyJztcbmltcG9ydCB7IEZpbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZpbGVzUm91dGVyJztcbmltcG9ydCB7IEZ1bmN0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgR2xvYmFsQ29uZmlnUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dsb2JhbENvbmZpZ1JvdXRlcic7XG5pbXBvcnQgeyBHcmFwaFFMUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dyYXBoUUxSb3V0ZXInO1xuaW1wb3J0IHsgSG9va3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSG9va3NSb3V0ZXInO1xuaW1wb3J0IHsgSUFQVmFsaWRhdGlvblJvdXRlciB9IGZyb20gJy4vUm91dGVycy9JQVBWYWxpZGF0aW9uUm91dGVyJztcbmltcG9ydCB7IEluc3RhbGxhdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSW5zdGFsbGF0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBMb2dzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0xvZ3NSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfSBmcm9tICcuL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlcic7XG5pbXBvcnQgeyBQYWdlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9QYWdlc1JvdXRlcic7XG5pbXBvcnQgeyBQdWJsaWNBUElSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVibGljQVBJUm91dGVyJztcbmltcG9ydCB7IFB1c2hSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVzaFJvdXRlcic7XG5pbXBvcnQgeyBDbG91ZENvZGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xvdWRDb2RlUm91dGVyJztcbmltcG9ydCB7IFJvbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1JvbGVzUm91dGVyJztcbmltcG9ydCB7IFNjaGVtYXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBTZXNzaW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TZXNzaW9uc1JvdXRlcic7XG5pbXBvcnQgeyBVc2Vyc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgeyBQdXJnZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXJnZVJvdXRlcic7XG5pbXBvcnQgeyBBdWRpZW5jZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQXVkaWVuY2VzUm91dGVyJztcbmltcG9ydCB7IEFnZ3JlZ2F0ZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9BZ2dyZWdhdGVSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciB9IGZyb20gJy4vUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcic7XG5pbXBvcnQgKiBhcyBjb250cm9sbGVycyBmcm9tICcuL0NvbnRyb2xsZXJzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9IGZyb20gJy4vR3JhcGhRTC9QYXJzZUdyYXBoUUxTZXJ2ZXInO1xuaW1wb3J0IHsgU2VjdXJpdHlSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2VjdXJpdHlSb3V0ZXInO1xuaW1wb3J0IENoZWNrUnVubmVyIGZyb20gJy4vU2VjdXJpdHkvQ2hlY2tSdW5uZXInO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuaW1wb3J0IHsgRGVmaW5lZFNjaGVtYXMgfSBmcm9tICcuL1NjaGVtYU1pZ3JhdGlvbnMvRGVmaW5lZFNjaGVtYXMnO1xuaW1wb3J0IE9wdGlvbnNEZWZpbml0aW9ucyBmcm9tICcuL09wdGlvbnMvRGVmaW5pdGlvbnMnO1xuaW1wb3J0IHsgcmVzb2x2aW5nUHJvbWlzZSwgQ29ubmVjdGlvbnMgfSBmcm9tICcuL1Rlc3RVdGlscyc7XG5cbi8vIE11dGF0ZSB0aGUgUGFyc2Ugb2JqZWN0IHRvIGFkZCB0aGUgQ2xvdWQgQ29kZSBoYW5kbGVyc1xuYWRkUGFyc2VDbG91ZCgpO1xuXG4vLyBUcmFjayBjb25uZWN0aW9ucyB0byBkZXN0cm95IHRoZW0gb24gc2h1dGRvd25cbmNvbnN0IGNvbm5lY3Rpb25zID0gbmV3IENvbm5lY3Rpb25zKCk7XG5cbi8vIFBhcnNlU2VydmVyIHdvcmtzIGxpa2UgYSBjb25zdHJ1Y3RvciBvZiBhbiBleHByZXNzIGFwcC5cbi8vIGh0dHBzOi8vcGFyc2VwbGF0Zm9ybS5vcmcvcGFyc2Utc2VydmVyL2FwaS9tYXN0ZXIvUGFyc2VTZXJ2ZXJPcHRpb25zLmh0bWxcbmNsYXNzIFBhcnNlU2VydmVyIHtcbiAgX2FwcDogYW55O1xuICBjb25maWc6IGFueTtcbiAgc2VydmVyOiBhbnk7XG4gIGV4cHJlc3NBcHA6IGFueTtcbiAgbGl2ZVF1ZXJ5U2VydmVyOiBhbnk7XG4gIC8qKlxuICAgKiBAY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdGhlIHBhcnNlIHNlcnZlciBpbml0aWFsaXphdGlvbiBvcHRpb25zXG4gICAqL1xuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICAvLyBTY2FuIGZvciBkZXByZWNhdGVkIFBhcnNlIFNlcnZlciBvcHRpb25zXG4gICAgRGVwcmVjYXRvci5zY2FuUGFyc2VTZXJ2ZXJPcHRpb25zKG9wdGlvbnMpO1xuXG4gICAgY29uc3QgaW50ZXJmYWNlcyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoT3B0aW9uc0RlZmluaXRpb25zKSk7XG5cbiAgICBmdW5jdGlvbiBnZXRWYWxpZE9iamVjdChyb290KSB7XG4gICAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICAgIGZvciAoY29uc3Qga2V5IGluIHJvb3QpIHtcbiAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyb290W2tleV0sICd0eXBlJykpIHtcbiAgICAgICAgICBpZiAocm9vdFtrZXldLnR5cGUuZW5kc1dpdGgoJ1tdJykpIHtcbiAgICAgICAgICAgIHJlc3VsdFtrZXldID0gW2dldFZhbGlkT2JqZWN0KGludGVyZmFjZXNbcm9vdFtrZXldLnR5cGUuc2xpY2UoMCwgLTIpXSldO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHRba2V5XSA9IGdldFZhbGlkT2JqZWN0KGludGVyZmFjZXNbcm9vdFtrZXldLnR5cGVdKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0W2tleV0gPSAnJztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBjb25zdCBvcHRpb25zQmx1ZXByaW50ID0gZ2V0VmFsaWRPYmplY3QoaW50ZXJmYWNlc1snUGFyc2VTZXJ2ZXJPcHRpb25zJ10pO1xuXG4gICAgZnVuY3Rpb24gdmFsaWRhdGVLZXlOYW1lcyhvcmlnaW5hbCwgcmVmLCBuYW1lID0gJycpIHtcbiAgICAgIGxldCByZXN1bHQgPSBbXTtcbiAgICAgIGNvbnN0IHByZWZpeCA9IG5hbWUgKyAobmFtZSAhPT0gJycgPyAnLicgOiAnJyk7XG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiBvcmlnaW5hbCkge1xuICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZWYsIGtleSkpIHtcbiAgICAgICAgICByZXN1bHQucHVzaChwcmVmaXggKyBrZXkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChyZWZba2V5XSA9PT0gJycpIHsgY29udGludWU7IH1cbiAgICAgICAgICBsZXQgcmVzID0gW107XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkob3JpZ2luYWxba2V5XSkgJiYgQXJyYXkuaXNBcnJheShyZWZba2V5XSkpIHtcbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSByZWZba2V5XVswXTtcbiAgICAgICAgICAgIG9yaWdpbmFsW2tleV0uZm9yRWFjaCgoaXRlbSwgaWR4KSA9PiB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcgJiYgaXRlbSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcy5jb25jYXQodmFsaWRhdGVLZXlOYW1lcyhpdGVtLCB0eXBlLCBwcmVmaXggKyBrZXkgKyBgWyR7aWR4fV1gKSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIG9yaWdpbmFsW2tleV0gPT09ICdvYmplY3QnICYmIHR5cGVvZiByZWZba2V5XSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHJlcyA9IHZhbGlkYXRlS2V5TmFtZXMob3JpZ2luYWxba2V5XSwgcmVmW2tleV0sIHByZWZpeCArIGtleSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5jb25jYXQocmVzKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBjb25zdCBkaWZmID0gdmFsaWRhdGVLZXlOYW1lcyhvcHRpb25zLCBvcHRpb25zQmx1ZXByaW50KTtcbiAgICBpZiAoZGlmZi5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBsb2dnZXIgPSAobG9nZ2luZyBhcyBhbnkpLmxvZ2dlcjtcbiAgICAgIGxvZ2dlci5lcnJvcihgSW52YWxpZCBrZXkocykgZm91bmQgaW4gUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb246ICR7ZGlmZi5qb2luKCcsICcpfWApO1xuICAgIH1cblxuICAgIC8vIFNldCBvcHRpb24gZGVmYXVsdHNcbiAgICBpbmplY3REZWZhdWx0cyhvcHRpb25zKTtcbiAgICBjb25zdCB7XG4gICAgICBhcHBJZCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGFuIGFwcElkIScpLFxuICAgICAgbWFzdGVyS2V5ID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBtYXN0ZXJLZXkhJyksXG4gICAgICBqYXZhc2NyaXB0S2V5LFxuICAgICAgc2VydmVyVVJMID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBzZXJ2ZXJVUkwhJyksXG4gICAgfSA9IG9wdGlvbnM7XG4gICAgLy8gSW5pdGlhbGl6ZSB0aGUgbm9kZSBjbGllbnQgU0RLIGF1dG9tYXRpY2FsbHlcbiAgICBQYXJzZS5pbml0aWFsaXplKGFwcElkLCBqYXZhc2NyaXB0S2V5IHx8ICd1bnVzZWQnLCBtYXN0ZXJLZXkpO1xuICAgIFBhcnNlLnNlcnZlclVSTCA9IHNlcnZlclVSTDtcbiAgICBDb25maWcudmFsaWRhdGVPcHRpb25zKG9wdGlvbnMpO1xuICAgIGNvbnN0IGFsbENvbnRyb2xsZXJzID0gY29udHJvbGxlcnMuZ2V0Q29udHJvbGxlcnMob3B0aW9ucyk7XG5cbiAgICAob3B0aW9ucyBhcyBhbnkpLnN0YXRlID0gJ2luaXRpYWxpemVkJztcbiAgICB0aGlzLmNvbmZpZyA9IENvbmZpZy5wdXQoT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywgYWxsQ29udHJvbGxlcnMpKTtcbiAgICB0aGlzLmNvbmZpZy5tYXN0ZXJLZXlJcHNTdG9yZSA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLmNvbmZpZy5tYWludGVuYW5jZUtleUlwc1N0b3JlID0gbmV3IE1hcCgpO1xuICAgIGxvZ2dpbmcuc2V0TG9nZ2VyKGFsbENvbnRyb2xsZXJzLmxvZ2dlckNvbnRyb2xsZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIFN0YXJ0cyBQYXJzZSBTZXJ2ZXIgYXMgYW4gZXhwcmVzcyBhcHA7IHRoaXMgcHJvbWlzZSByZXNvbHZlcyB3aGVuIFBhcnNlIFNlcnZlciBpcyByZWFkeSB0byBhY2NlcHQgcmVxdWVzdHMuXG4gICAqL1xuXG4gIGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dGhpcz4ge1xuICAgIHRyeSB7XG4gICAgICBpZiAodGhpcy5jb25maWcuc3RhdGUgPT09ICdvaycpIHtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9XG4gICAgICB0aGlzLmNvbmZpZy5zdGF0ZSA9ICdzdGFydGluZyc7XG4gICAgICBDb25maWcucHV0KHRoaXMuY29uZmlnKTtcbiAgICAgIGNvbnN0IHtcbiAgICAgICAgZGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgICBob29rc0NvbnRyb2xsZXIsXG4gICAgICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICAgICAgY2xvdWQsXG4gICAgICAgIHNlY3VyaXR5LFxuICAgICAgICBzY2hlbWEsXG4gICAgICAgIGxpdmVRdWVyeUNvbnRyb2xsZXIsXG4gICAgICB9ID0gdGhpcy5jb25maWc7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBkYXRhYmFzZUNvbnRyb2xsZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmIChlLmNvZGUgIT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IHB1c2hDb250cm9sbGVyID0gYXdhaXQgY29udHJvbGxlcnMuZ2V0UHVzaENvbnRyb2xsZXIodGhpcy5jb25maWcpO1xuICAgICAgYXdhaXQgaG9va3NDb250cm9sbGVyLmxvYWQoKTtcbiAgICAgIGNvbnN0IHN0YXJ0dXBQcm9taXNlcyA9IFt0aGlzLmNvbmZpZy5sb2FkTWFzdGVyS2V5Py4oKV07XG4gICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgIHN0YXJ0dXBQcm9taXNlcy5wdXNoKG5ldyBEZWZpbmVkU2NoZW1hcyhzY2hlbWEsIHRoaXMuY29uZmlnKS5leGVjdXRlKCkpO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICBjYWNoZUNvbnRyb2xsZXIuYWRhcHRlcj8uY29ubmVjdCAmJlxuICAgICAgICB0eXBlb2YgY2FjaGVDb250cm9sbGVyLmFkYXB0ZXIuY29ubmVjdCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIHN0YXJ0dXBQcm9taXNlcy5wdXNoKGNhY2hlQ29udHJvbGxlci5hZGFwdGVyLmNvbm5lY3QoKSk7XG4gICAgICB9XG4gICAgICBzdGFydHVwUHJvbWlzZXMucHVzaChsaXZlUXVlcnlDb250cm9sbGVyLmNvbm5lY3QoKSk7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChzdGFydHVwUHJvbWlzZXMpO1xuICAgICAgaWYgKGNsb3VkKSB7XG4gICAgICAgIGFkZFBhcnNlQ2xvdWQoKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbG91ZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZShjbG91ZChQYXJzZSkpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjbG91ZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBsZXQganNvbjtcbiAgICAgICAgICBpZiAocHJvY2Vzcy5lbnYubnBtX3BhY2thZ2VfanNvbikge1xuICAgICAgICAgICAganNvbiA9IHJlcXVpcmUocHJvY2Vzcy5lbnYubnBtX3BhY2thZ2VfanNvbik7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChwcm9jZXNzLmVudi5ucG1fcGFja2FnZV90eXBlID09PSAnbW9kdWxlJyB8fCBqc29uPy50eXBlID09PSAnbW9kdWxlJykge1xuICAgICAgICAgICAgYXdhaXQgaW1wb3J0KHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBjbG91ZCkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBjbG91ZCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBcImFyZ3VtZW50ICdjbG91ZCcgbXVzdCBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgYSBmdW5jdGlvblwiO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuICAgICAgfVxuICAgICAgaWYgKHNlY3VyaXR5ICYmIHNlY3VyaXR5LmVuYWJsZUNoZWNrICYmIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nKSB7XG4gICAgICAgIG5ldyBDaGVja1J1bm5lcihzZWN1cml0eSkucnVuKCk7XG4gICAgICB9XG4gICAgICB0aGlzLmNvbmZpZy5zdGF0ZSA9ICdvayc7XG4gICAgICB0aGlzLmNvbmZpZyA9IHsgLi4udGhpcy5jb25maWcsIC4uLnB1c2hDb250cm9sbGVyIH07XG4gICAgICBDb25maWcucHV0KHRoaXMuY29uZmlnKTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgY29uc29sZS5lcnJvcihlcnJvcik7XG4gICAgICB0aGlzLmNvbmZpZy5zdGF0ZSA9ICdlcnJvcic7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBnZXQgYXBwKCkge1xuICAgIGlmICghdGhpcy5fYXBwKSB7XG4gICAgICB0aGlzLl9hcHAgPSBQYXJzZVNlcnZlci5hcHAodGhpcy5jb25maWcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fYXBwO1xuICB9XG5cbiAgLyoqXG4gICAqIFN0b3BzIHRoZSBwYXJzZSBzZXJ2ZXIsIGNhbmNlbHMgYW55IG9uZ29pbmcgcmVxdWVzdHMgYW5kIGNsb3NlcyBhbGwgY29ubmVjdGlvbnMuXG4gICAqXG4gICAqIEN1cnJlbnRseSwgZXhwcmVzcyBkb2Vzbid0IHNodXQgZG93biBpbW1lZGlhdGVseSBhZnRlciByZWNlaXZpbmcgU0lHSU5UL1NJR1RFUk1cbiAgICogaWYgaXQgaGFzIGNsaWVudCBjb25uZWN0aW9ucyB0aGF0IGhhdmVuJ3QgdGltZWQgb3V0LlxuICAgKiAoVGhpcyBpcyBhIGtub3duIGlzc3VlIHdpdGggbm9kZSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvMjY0MilcbiAgICpcbiAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59IGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gdGhlIHNlcnZlciBpcyBzdG9wcGVkXG4gICAqL1xuICBhc3luYyBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBjb25zdCBzZXJ2ZXJDbG9zZVByb21pc2UgPSByZXNvbHZpbmdQcm9taXNlKCk7XG4gICAgY29uc3QgbGl2ZVF1ZXJ5U2VydmVyQ2xvc2VQcm9taXNlID0gcmVzb2x2aW5nUHJvbWlzZSgpO1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG4gICAgdGhpcy5zZXJ2ZXIuY2xvc2UoKGVycm9yKSA9PiB7XG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHdoaWxlIGNsb3NpbmcgcGFyc2Ugc2VydmVyJywgZXJyb3IpO1xuICAgICAgfVxuICAgICAgc2VydmVyQ2xvc2VQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9KTtcbiAgICBpZiAodGhpcy5saXZlUXVlcnlTZXJ2ZXI/LnNlcnZlcj8uY2xvc2UgJiYgdGhpcy5saXZlUXVlcnlTZXJ2ZXIuc2VydmVyICE9PSB0aGlzLnNlcnZlcikge1xuICAgICAgdGhpcy5saXZlUXVlcnlTZXJ2ZXIuc2VydmVyLmNsb3NlKChlcnJvcikgPT4ge1xuICAgICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHdoaWxlIGNsb3NpbmcgbGl2ZSBxdWVyeSBzZXJ2ZXInLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICAgICAgbGl2ZVF1ZXJ5U2VydmVyQ2xvc2VQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBsaXZlUXVlcnlTZXJ2ZXJDbG9zZVByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGRhdGFiYXNlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuZGF0YWJhc2VDb250cm9sbGVyO1xuICAgIGlmIChkYXRhYmFzZUFkYXB0ZXIgJiYgdHlwZW9mIGRhdGFiYXNlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChkYXRhYmFzZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGNvbnN0IHsgYWRhcHRlcjogZmlsZUFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlcjtcbiAgICBpZiAoZmlsZUFkYXB0ZXIgJiYgdHlwZW9mIGZpbGVBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGZpbGVBZGFwdGVyLmhhbmRsZVNodXRkb3duKCkpO1xuICAgIH1cbiAgICBjb25zdCB7IGFkYXB0ZXI6IGNhY2hlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyO1xuICAgIGlmIChjYWNoZUFkYXB0ZXIgJiYgdHlwZW9mIGNhY2hlQWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcHJvbWlzZXMucHVzaChjYWNoZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGlmICh0aGlzLmxpdmVRdWVyeVNlcnZlcikge1xuICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLmxpdmVRdWVyeVNlcnZlci5zaHV0ZG93bigpKTtcbiAgICB9XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIGNvbm5lY3Rpb25zLmRlc3Ryb3lBbGwoKTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChbc2VydmVyQ2xvc2VQcm9taXNlLCBsaXZlUXVlcnlTZXJ2ZXJDbG9zZVByb21pc2VdKTtcbiAgICBpZiAodGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSkge1xuICAgICAgdGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSgpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAc3RhdGljXG4gICAqIENyZWF0ZSBhbiBleHByZXNzIGFwcCBmb3IgdGhlIHBhcnNlIHNlcnZlclxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBsZXQgeW91IHNwZWNpZnkgdGhlIG1heFVwbG9hZFNpemUgd2hlbiBjcmVhdGluZyB0aGUgZXhwcmVzcyBhcHAgICovXG4gIHN0YXRpYyBhcHAob3B0aW9ucykge1xuICAgIGNvbnN0IHsgbWF4VXBsb2FkU2l6ZSA9ICcyMG1iJywgYXBwSWQsIGRpcmVjdEFjY2VzcywgcGFnZXMsIHJhdGVMaW1pdCA9IFtdIH0gPSBvcHRpb25zO1xuICAgIC8vIFRoaXMgYXBwIHNlcnZlcyB0aGUgUGFyc2UgQVBJIGRpcmVjdGx5LlxuICAgIC8vIEl0J3MgdGhlIGVxdWl2YWxlbnQgb2YgaHR0cHM6Ly9hcGkucGFyc2UuY29tLzEgaW4gdGhlIGhvc3RlZCBQYXJzZSBBUEkuXG4gICAgdmFyIGFwaSA9IGV4cHJlc3MoKTtcbiAgICAvL2FwaS51c2UoXCIvYXBwc1wiLCBleHByZXNzLnN0YXRpYyhfX2Rpcm5hbWUgKyBcIi9wdWJsaWNcIikpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dDcm9zc0RvbWFpbihhcHBJZCkpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dEb3VibGVGb3J3YXJkU2xhc2gpO1xuICAgIC8vIEZpbGUgaGFuZGxpbmcgbmVlZHMgdG8gYmUgYmVmb3JlIGRlZmF1bHQgbWlkZGxld2FyZXMgYXJlIGFwcGxpZWRcbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgbmV3IEZpbGVzUm91dGVyKCkuZXhwcmVzc1JvdXRlcih7XG4gICAgICAgIG1heFVwbG9hZFNpemU6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhcGkudXNlKCcvaGVhbHRoJywgZnVuY3Rpb24gKHJlcSwgcmVzKSB7XG4gICAgICByZXMuc3RhdHVzKG9wdGlvbnMuc3RhdGUgPT09ICdvaycgPyAyMDAgOiA1MDMpO1xuICAgICAgaWYgKG9wdGlvbnMuc3RhdGUgPT09ICdzdGFydGluZycpIHtcbiAgICAgICAgcmVzLnNldCgnUmV0cnktQWZ0ZXInLCAxKTtcbiAgICAgIH1cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgc3RhdHVzOiBvcHRpb25zLnN0YXRlLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgZXhwcmVzcy51cmxlbmNvZGVkKHsgZXh0ZW5kZWQ6IGZhbHNlIH0pLFxuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyXG4gICAgICAgID8gbmV3IFBhZ2VzUm91dGVyKHBhZ2VzKS5leHByZXNzUm91dGVyKClcbiAgICAgICAgOiBuZXcgUHVibGljQVBJUm91dGVyKCkuZXhwcmVzc1JvdXRlcigpXG4gICAgKTtcblxuICAgIGFwaS51c2UoZXhwcmVzcy5qc29uKHsgdHlwZTogJyovKicsIGxpbWl0OiBtYXhVcGxvYWRTaXplIH0pKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93TWV0aG9kT3ZlcnJpZGUpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VIZWFkZXJzKTtcbiAgICBhcGkuc2V0KCdxdWVyeSBwYXJzZXInLCAnZXh0ZW5kZWQnKTtcbiAgICBjb25zdCByb3V0ZXMgPSBBcnJheS5pc0FycmF5KHJhdGVMaW1pdCkgPyByYXRlTGltaXQgOiBbcmF0ZUxpbWl0XTtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHJvdXRlcykge1xuICAgICAgbWlkZGxld2FyZXMuYWRkUmF0ZUxpbWl0KHJvdXRlLCBvcHRpb25zKTtcbiAgICB9XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZVNlc3Npb24pO1xuXG4gICAgY29uc3QgYXBwUm91dGVyID0gUGFyc2VTZXJ2ZXIucHJvbWlzZVJvdXRlcih7IGFwcElkIH0pO1xuICAgIGFwaS51c2UoYXBwUm91dGVyLmV4cHJlc3NSb3V0ZXIoKSk7XG5cbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlRXJyb3JzKTtcblxuICAgIC8vIHJ1biB0aGUgZm9sbG93aW5nIHdoZW4gbm90IHRlc3RpbmdcbiAgICBpZiAoIXByb2Nlc3MuZW52LlRFU1RJTkcpIHtcbiAgICAgIC8vVGhpcyBjYXVzZXMgdGVzdHMgdG8gc3BldyBzb21lIHVzZWxlc3Mgd2FybmluZ3MsIHNvIGRpc2FibGUgaW4gdGVzdFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgKGVycjogYW55KSA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG4gICAgICAgICAgLy8gdXNlci1mcmllbmRseSBtZXNzYWdlIGZvciB0aGlzIGNvbW1vbiBlcnJvclxuICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKGBVbmFibGUgdG8gbGlzdGVuIG9uIHBvcnQgJHtlcnIucG9ydH0uIFRoZSBwb3J0IGlzIGFscmVhZHkgaW4gdXNlLmApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoZXJyLm1lc3NhZ2UpIHtcbiAgICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKCdBbiB1bmNhdWdodCBleGNlcHRpb24gb2NjdXJyZWQ6ICcgKyBlcnIubWVzc2FnZSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChlcnIuc3RhY2spIHtcbiAgICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKCdTdGFjayBUcmFjZTpcXG4nICsgZXJyLnN0YWNrKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIC8vIHZlcmlmeSB0aGUgc2VydmVyIHVybCBhZnRlciBhICdtb3VudCcgZXZlbnQgaXMgcmVjZWl2ZWRcbiAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgICBhcGkub24oJ21vdW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwMCkpO1xuICAgICAgICBQYXJzZVNlcnZlci52ZXJpZnlTZXJ2ZXJVcmwoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAocHJvY2Vzcy5lbnYuUEFSU0VfU0VSVkVSX0VOQUJMRV9FWFBFUklNRU5UQUxfRElSRUNUX0FDQ0VTUyA9PT0gJzEnIHx8IGRpcmVjdEFjY2Vzcykge1xuICAgICAgUGFyc2UuQ29yZU1hbmFnZXIuc2V0UkVTVENvbnRyb2xsZXIoUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcihhcHBJZCwgYXBwUm91dGVyKSk7XG4gICAgfVxuICAgIHJldHVybiBhcGk7XG4gIH1cblxuICBzdGF0aWMgcHJvbWlzZVJvdXRlcih7IGFwcElkIH0pIHtcbiAgICBjb25zdCByb3V0ZXJzID0gW1xuICAgICAgbmV3IENsYXNzZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBVc2Vyc1JvdXRlcigpLFxuICAgICAgbmV3IFNlc3Npb25zUm91dGVyKCksXG4gICAgICBuZXcgUm9sZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBbmFseXRpY3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJbnN0YWxsYXRpb25zUm91dGVyKCksXG4gICAgICBuZXcgRnVuY3Rpb25zUm91dGVyKCksXG4gICAgICBuZXcgU2NoZW1hc1JvdXRlcigpLFxuICAgICAgbmV3IFB1c2hSb3V0ZXIoKSxcbiAgICAgIG5ldyBMb2dzUm91dGVyKCksXG4gICAgICBuZXcgSUFQVmFsaWRhdGlvblJvdXRlcigpLFxuICAgICAgbmV3IEZlYXR1cmVzUm91dGVyKCksXG4gICAgICBuZXcgR2xvYmFsQ29uZmlnUm91dGVyKCksXG4gICAgICBuZXcgR3JhcGhRTFJvdXRlcigpLFxuICAgICAgbmV3IFB1cmdlUm91dGVyKCksXG4gICAgICBuZXcgSG9va3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBDbG91ZENvZGVSb3V0ZXIoKSxcbiAgICAgIG5ldyBBdWRpZW5jZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBZ2dyZWdhdGVSb3V0ZXIoKSxcbiAgICAgIG5ldyBTZWN1cml0eVJvdXRlcigpLFxuICAgIF07XG5cbiAgICBjb25zdCByb3V0ZXMgPSByb3V0ZXJzLnJlZHVjZSgobWVtbywgcm91dGVyKSA9PiB7XG4gICAgICByZXR1cm4gbWVtby5jb25jYXQocm91dGVyLnJvdXRlcyk7XG4gICAgfSwgW10pO1xuXG4gICAgY29uc3QgYXBwUm91dGVyID0gbmV3IFByb21pc2VSb3V0ZXIocm91dGVzLCBhcHBJZCk7XG5cbiAgICBiYXRjaC5tb3VudE9udG8oYXBwUm91dGVyKTtcbiAgICByZXR1cm4gYXBwUm91dGVyO1xuICB9XG5cbiAgLyoqXG4gICAqIHN0YXJ0cyB0aGUgcGFyc2Ugc2VydmVyJ3MgZXhwcmVzcyBhcHBcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdG8gdXNlIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuXG4gIGFzeW5jIHN0YXJ0QXBwKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIHRyeSB7XG4gICAgICBhd2FpdCB0aGlzLnN0YXJ0KCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIG9uIFBhcnNlU2VydmVyLnN0YXJ0QXBwOiAnLCBlKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGNvbnN0IGFwcCA9IGV4cHJlc3MoKTtcbiAgICBpZiAob3B0aW9ucy5taWRkbGV3YXJlKSB7XG4gICAgICBsZXQgbWlkZGxld2FyZTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5taWRkbGV3YXJlID09ICdzdHJpbmcnKSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBvcHRpb25zLm1pZGRsZXdhcmUpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSBvcHRpb25zLm1pZGRsZXdhcmU7IC8vIHVzZSBhcy1pcyBsZXQgZXhwcmVzcyBmYWlsXG4gICAgICB9XG4gICAgICBhcHAudXNlKG1pZGRsZXdhcmUpO1xuICAgIH1cbiAgICBhcHAudXNlKG9wdGlvbnMubW91bnRQYXRoLCB0aGlzLmFwcCk7XG5cbiAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwgPT09IHRydWUgfHwgb3B0aW9ucy5tb3VudFBsYXlncm91bmQgPT09IHRydWUpIHtcbiAgICAgIGxldCBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSB1bmRlZmluZWQ7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gcGFyc2UoZnMucmVhZEZpbGVTeW5jKG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSwgJ3V0ZjgnKSk7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnb2JqZWN0JyB8fFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gb3B0aW9ucy5ncmFwaFFMU2NoZW1hO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwYXJzZUdyYXBoUUxTZXJ2ZXIgPSBuZXcgUGFyc2VHcmFwaFFMU2VydmVyKHRoaXMsIHtcbiAgICAgICAgZ3JhcGhRTFBhdGg6IG9wdGlvbnMuZ3JhcGhRTFBhdGgsXG4gICAgICAgIHBsYXlncm91bmRQYXRoOiBvcHRpb25zLnBsYXlncm91bmRQYXRoLFxuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICB9KTtcblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseUdyYXBoUUwoYXBwKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseVBsYXlncm91bmQoYXBwKTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3Qgc2VydmVyID0gYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBhcHAubGlzdGVuKG9wdGlvbnMucG9ydCwgb3B0aW9ucy5ob3N0LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJlc29sdmUodGhpcyk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcbiAgICBjb25uZWN0aW9ucy50cmFjayhzZXJ2ZXIpO1xuXG4gICAgaWYgKG9wdGlvbnMuc3RhcnRMaXZlUXVlcnlTZXJ2ZXIgfHwgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zKSB7XG4gICAgICB0aGlzLmxpdmVRdWVyeVNlcnZlciA9IGF3YWl0IFBhcnNlU2VydmVyLmNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICAgICAgc2VydmVyLFxuICAgICAgICBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnMsXG4gICAgICAgIG9wdGlvbnNcbiAgICAgICk7XG4gICAgICBpZiAodGhpcy5saXZlUXVlcnlTZXJ2ZXIuc2VydmVyICE9PSB0aGlzLnNlcnZlcikge1xuICAgICAgICBjb25uZWN0aW9ucy50cmFjayh0aGlzLmxpdmVRdWVyeVNlcnZlci5zZXJ2ZXIpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAob3B0aW9ucy50cnVzdFByb3h5KSB7XG4gICAgICBhcHAuc2V0KCd0cnVzdCBwcm94eScsIG9wdGlvbnMudHJ1c3RQcm94eSk7XG4gICAgfVxuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICBjb25maWd1cmVMaXN0ZW5lcnModGhpcyk7XG4gICAgfVxuICAgIHRoaXMuZXhwcmVzc0FwcCA9IGFwcDtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFBhcnNlU2VydmVyIGFuZCBzdGFydHMgaXQuXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHVzZWQgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBhc3luYyBzdGFydEFwcChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICBjb25zdCBwYXJzZVNlcnZlciA9IG5ldyBQYXJzZVNlcnZlcihvcHRpb25zKTtcbiAgICByZXR1cm4gcGFyc2VTZXJ2ZXIuc3RhcnRBcHAob3B0aW9ucyk7XG4gIH1cblxuICAvKipcbiAgICogSGVscGVyIG1ldGhvZCB0byBjcmVhdGUgYSBsaXZlUXVlcnkgc2VydmVyXG4gICAqIEBzdGF0aWNcbiAgICogQHBhcmFtIHtTZXJ2ZXJ9IGh0dHBTZXJ2ZXIgYW4gb3B0aW9uYWwgaHR0cCBzZXJ2ZXIgdG8gcGFzc1xuICAgKiBAcGFyYW0ge0xpdmVRdWVyeVNlcnZlck9wdGlvbnN9IGNvbmZpZyBvcHRpb25zIGZvciB0aGUgbGl2ZVF1ZXJ5U2VydmVyXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIG9wdGlvbnMgZm9yIHRoZSBQYXJzZVNlcnZlclxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxQYXJzZUxpdmVRdWVyeVNlcnZlcj59IHRoZSBsaXZlIHF1ZXJ5IHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIGFzeW5jIGNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICBodHRwU2VydmVyLFxuICAgIGNvbmZpZzogTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyxcbiAgICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnNcbiAgKTogUHJvbWlzZTxQYXJzZUxpdmVRdWVyeVNlcnZlcj4ge1xuICAgIGlmICghaHR0cFNlcnZlciB8fCAoY29uZmlnICYmIGNvbmZpZy5wb3J0KSkge1xuICAgICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcbiAgICAgIGh0dHBTZXJ2ZXIgPSByZXF1aXJlKCdodHRwJykuY3JlYXRlU2VydmVyKGFwcCk7XG4gICAgICBodHRwU2VydmVyLmxpc3Rlbihjb25maWcucG9ydCk7XG4gICAgfVxuICAgIGNvbnN0IHNlcnZlciA9IG5ldyBQYXJzZUxpdmVRdWVyeVNlcnZlcihodHRwU2VydmVyLCBjb25maWcsIG9wdGlvbnMpO1xuICAgIGF3YWl0IHNlcnZlci5jb25uZWN0KCk7XG4gICAgcmV0dXJuIHNlcnZlcjtcbiAgfVxuXG4gIHN0YXRpYyBhc3luYyB2ZXJpZnlTZXJ2ZXJVcmwoKSB7XG4gICAgLy8gcGVyZm9ybSBhIGhlYWx0aCBjaGVjayBvbiB0aGUgc2VydmVyVVJMIHZhbHVlXG4gICAgaWYgKFBhcnNlLnNlcnZlclVSTCkge1xuICAgICAgY29uc3QgaXNWYWxpZEh0dHBVcmwgPSBzdHJpbmcgPT4ge1xuICAgICAgICBsZXQgdXJsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHVybCA9IG5ldyBVUkwoc3RyaW5nKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdXJsLnByb3RvY29sID09PSAnaHR0cDonIHx8IHVybC5wcm90b2NvbCA9PT0gJ2h0dHBzOic7XG4gICAgICB9O1xuICAgICAgY29uc3QgdXJsID0gYCR7UGFyc2Uuc2VydmVyVVJMLnJlcGxhY2UoL1xcLyQvLCAnJyl9L2hlYWx0aGA7XG4gICAgICBpZiAoIWlzVmFsaWRIdHRwVXJsKHVybCkpIHtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9JyBhcyB0aGUgVVJMIGlzIGludmFsaWQuYCArXG4gICAgICAgICAgICBgIENsb3VkIGNvZGUgYW5kIHB1c2ggbm90aWZpY2F0aW9ucyBtYXkgYmUgdW5hdmFpbGFibGUhXFxuYFxuICAgICAgICApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCByZXF1ZXN0ID0gcmVxdWlyZSgnLi9yZXF1ZXN0Jyk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3QoeyB1cmwgfSkuY2F0Y2gocmVzcG9uc2UgPT4gcmVzcG9uc2UpO1xuICAgICAgY29uc3QganNvbiA9IHJlc3BvbnNlLmRhdGEgfHwgbnVsbDtcbiAgICAgIGNvbnN0IHJldHJ5ID0gcmVzcG9uc2UuaGVhZGVycz8uWydyZXRyeS1hZnRlciddO1xuICAgICAgaWYgKHJldHJ5KSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCByZXRyeSAqIDEwMDApKTtcbiAgICAgICAgcmV0dXJuIHRoaXMudmVyaWZ5U2VydmVyVXJsKCk7XG4gICAgICB9XG4gICAgICBpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSAyMDAgfHwganNvbj8uc3RhdHVzICE9PSAnb2snKSB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9Jy5gICtcbiAgICAgICAgICAgIGAgQ2xvdWQgY29kZSBhbmQgcHVzaCBub3RpZmljYXRpb25zIG1heSBiZSB1bmF2YWlsYWJsZSFcXG5gXG4gICAgICAgICk7XG4gICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkUGFyc2VDbG91ZCgpIHtcbiAgY29uc3QgUGFyc2VDbG91ZCA9IHJlcXVpcmUoJy4vY2xvdWQtY29kZS9QYXJzZS5DbG91ZCcpO1xuICBjb25zdCBQYXJzZVNlcnZlciA9IHJlcXVpcmUoJy4vY2xvdWQtY29kZS9QYXJzZS5TZXJ2ZXInKTtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KFBhcnNlLCAnU2VydmVyJywge1xuICAgIGdldCgpIHtcbiAgICAgIGNvbnN0IGNvbmYgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICAgICAgcmV0dXJuIHsgLi4uY29uZiwgLi4uUGFyc2VTZXJ2ZXIgfTtcbiAgICB9LFxuICAgIHNldChuZXdWYWwpIHtcbiAgICAgIG5ld1ZhbC5hcHBJZCA9IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gICAgICBDb25maWcucHV0KG5ld1ZhbCk7XG4gICAgfSxcbiAgICBjb25maWd1cmFibGU6IHRydWUsXG4gIH0pO1xuICBPYmplY3QuYXNzaWduKFBhcnNlLkNsb3VkLCBQYXJzZUNsb3VkKTtcbiAgZ2xvYmFsLlBhcnNlID0gUGFyc2U7XG59XG5cbmZ1bmN0aW9uIGluamVjdERlZmF1bHRzKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBPYmplY3Qua2V5cyhkZWZhdWx0cykuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsIGtleSkpIHtcbiAgICAgIG9wdGlvbnNba2V5XSA9IGRlZmF1bHRzW2tleV07XG4gICAgfVxuICB9KTtcblxuICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvcHRpb25zLCAnc2VydmVyVVJMJykpIHtcbiAgICBvcHRpb25zLnNlcnZlclVSTCA9IGBodHRwOi8vbG9jYWxob3N0OiR7b3B0aW9ucy5wb3J0fSR7b3B0aW9ucy5tb3VudFBhdGh9YDtcbiAgfVxuXG4gIC8vIFJlc2VydmVkIENoYXJhY3RlcnNcbiAgaWYgKG9wdGlvbnMuYXBwSWQpIHtcbiAgICBjb25zdCByZWdleCA9IC9bISMkJScoKSorJi86Oz0/QFtcXF17fV4sfDw+XS9nO1xuICAgIGlmIChvcHRpb25zLmFwcElkLm1hdGNoKHJlZ2V4KSkge1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbldBUk5JTkcsIGFwcElkIHRoYXQgY29udGFpbnMgc3BlY2lhbCBjaGFyYWN0ZXJzIGNhbiBjYXVzZSBpc3N1ZXMgd2hpbGUgdXNpbmcgd2l0aCB1cmxzLlxcbmBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gQmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbiAgaWYgKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcykge1xuICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAhcHJvY2Vzcy5lbnYuVEVTVElORyAmJlxuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuREVQUkVDQVRFRDogdXNlclNlbnNpdGl2ZUZpZWxkcyBoYXMgYmVlbiByZXBsYWNlZCBieSBwcm90ZWN0ZWRGaWVsZHMgYWxsb3dpbmcgdGhlIGFiaWxpdHkgdG8gcHJvdGVjdCBmaWVsZHMgaW4gYWxsIGNsYXNzZXMgd2l0aCBDTFAuIFxcbmBcbiAgICAgICk7XG4gICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG5cbiAgICBjb25zdCB1c2VyU2Vuc2l0aXZlRmllbGRzID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoWy4uLihkZWZhdWx0cy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKSwgLi4uKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcyB8fCBbXSldKVxuICAgICk7XG5cbiAgICAvLyBJZiB0aGUgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgaXMgdW5zZXQsXG4gICAgLy8gaXQnbGwgYmUgYXNzaWduZWQgdGhlIGRlZmF1bHQgYWJvdmUuXG4gICAgLy8gSGVyZSwgcHJvdGVjdCBhZ2FpbnN0IHRoZSBjYXNlIHdoZXJlIHByb3RlY3RlZEZpZWxkc1xuICAgIC8vIGlzIHNldCwgYnV0IGRvZXNuJ3QgaGF2ZSBfVXNlci5cbiAgICBpZiAoISgnX1VzZXInIGluIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMgPSBPYmplY3QuYXNzaWduKHsgX1VzZXI6IFtdIH0sIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzKTtcbiAgICB9XG5cbiAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoWy4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddIHx8IFtdKSwgLi4udXNlclNlbnNpdGl2ZUZpZWxkc10pXG4gICAgKTtcbiAgfVxuXG4gIC8vIE1lcmdlIHByb3RlY3RlZEZpZWxkcyBvcHRpb25zIHdpdGggZGVmYXVsdHMuXG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkcykuZm9yRWFjaChjID0+IHtcbiAgICBjb25zdCBjdXIgPSBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICBpZiAoIWN1cikge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY10gPSBkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgfSBlbHNlIHtcbiAgICAgIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXSkuZm9yRWFjaChyID0+IHtcbiAgICAgICAgY29uc3QgdW5xID0gbmV3IFNldChbXG4gICAgICAgICAgLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdIHx8IFtdKSxcbiAgICAgICAgICAuLi5kZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0sXG4gICAgICAgIF0pO1xuICAgICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSA9IEFycmF5LmZyb20odW5xKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG59XG5cbi8vIFRob3NlIGNhbid0IGJlIHRlc3RlZCBhcyBpdCByZXF1aXJlcyBhIHN1YnByb2Nlc3Ncbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG5mdW5jdGlvbiBjb25maWd1cmVMaXN0ZW5lcnMocGFyc2VTZXJ2ZXIpIHtcbiAgY29uc3QgaGFuZGxlU2h1dGRvd24gPSBmdW5jdGlvbiAoKSB7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1Rlcm1pbmF0aW9uIHNpZ25hbCByZWNlaXZlZC4gU2h1dHRpbmcgZG93bi4nKTtcbiAgICBwYXJzZVNlcnZlci5oYW5kbGVTaHV0ZG93bigpO1xuICB9O1xuICBwcm9jZXNzLm9uKCdTSUdURVJNJywgaGFuZGxlU2h1dGRvd24pO1xuICBwcm9jZXNzLm9uKCdTSUdJTlQnLCBoYW5kbGVTaHV0ZG93bik7XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFXQSxJQUFBQSxTQUFBLEdBQUFDLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBQyxPQUFBLEdBQUFDLHVCQUFBLENBQUFGLE9BQUE7QUFDQSxJQUFBRyxPQUFBLEdBQUFKLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSSxjQUFBLEdBQUFMLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBSyxrQkFBQSxHQUFBTixzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQU0sZ0JBQUEsR0FBQU4sT0FBQTtBQUNBLElBQUFPLGNBQUEsR0FBQVAsT0FBQTtBQUNBLElBQUFRLGVBQUEsR0FBQVIsT0FBQTtBQUNBLElBQUFTLFlBQUEsR0FBQVQsT0FBQTtBQUNBLElBQUFVLGdCQUFBLEdBQUFWLE9BQUE7QUFDQSxJQUFBVyxtQkFBQSxHQUFBWCxPQUFBO0FBQ0EsSUFBQVksY0FBQSxHQUFBWixPQUFBO0FBQ0EsSUFBQWEsWUFBQSxHQUFBYixPQUFBO0FBQ0EsSUFBQWMsb0JBQUEsR0FBQWQsT0FBQTtBQUNBLElBQUFl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