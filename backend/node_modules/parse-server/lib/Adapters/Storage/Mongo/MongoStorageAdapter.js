"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.MongoStorageAdapter = void 0;
var _MongoCollection = _interopRequireDefault(require("./MongoCollection"));
var _MongoSchemaCollection = _interopRequireDefault(require("./MongoSchemaCollection"));
var _StorageAdapter = require("../StorageAdapter");
var _mongodbUrl = require("../../../vendor/mongodbUrl");
var _MongoTransform = require("./MongoTransform");
var _node = _interopRequireDefault(require("parse/node"));
var _lodash = _interopRequireDefault(require("lodash"));
var _defaults = _interopRequireDefault(require("../../../defaults"));
var _logger = _interopRequireDefault(require("../../../logger"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// -disable-next
// -disable-next
// -disable-next
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const ReadPreference = mongodb.ReadPreference;
const MongoSchemaCollectionName = '_SCHEMA';
const storageAdapterAllCollections = mongoAdapter => {
  return mongoAdapter.connect().then(() => mongoAdapter.database.collections()).then(collections => {
    return collections.filter(collection => {
      if (collection.namespace.match(/\.system\./)) {
        return false;
      }
      // TODO: If you have one app with a collection prefix that happens to be a prefix of another
      // apps prefix, this will go very very badly. We should fix that somehow.
      return collection.collectionName.indexOf(mongoAdapter._collectionPrefix) == 0;
    });
  });
};
const convertParseSchemaToMongoSchema = ({
  ...schema
}) => {
  delete schema.fields._rperm;
  delete schema.fields._wperm;
  if (schema.className === '_User') {
    // Legacy mongo adapter knows about the difference between password and _hashed_password.
    // Future database adapters will only know about _hashed_password.
    // Note: Parse Server will bring back password with injectDefaultSchema, so we don't need
    // to add _hashed_password back ever.
    delete schema.fields._hashed_password;
  }
  return schema;
};

// Returns { code, error } if invalid, or { result }, an object
// suitable for inserting into _SCHEMA collection, otherwise.
const mongoSchemaFromFieldsAndClassNameAndCLP = (fields, className, classLevelPermissions, indexes) => {
  const mongoObject = {
    _id: className,
    objectId: 'string',
    updatedAt: 'string',
    createdAt: 'string',
    _metadata: undefined
  };
  for (const fieldName in fields) {
    const {
      type,
      targetClass,
      ...fieldOptions
    } = fields[fieldName];
    mongoObject[fieldName] = _MongoSchemaCollection.default.parseFieldTypeToMongoFieldType({
      type,
      targetClass
    });
    if (fieldOptions && Object.keys(fieldOptions).length > 0) {
      mongoObject._metadata = mongoObject._metadata || {};
      mongoObject._metadata.fields_options = mongoObject._metadata.fields_options || {};
      mongoObject._metadata.fields_options[fieldName] = fieldOptions;
    }
  }
  if (typeof classLevelPermissions !== 'undefined') {
    mongoObject._metadata = mongoObject._metadata || {};
    if (!classLevelPermissions) {
      delete mongoObject._metadata.class_permissions;
    } else {
      mongoObject._metadata.class_permissions = classLevelPermissions;
    }
  }
  if (indexes && typeof indexes === 'object' && Object.keys(indexes).length > 0) {
    mongoObject._metadata = mongoObject._metadata || {};
    mongoObject._metadata.indexes = indexes;
  }
  if (!mongoObject._metadata) {
    // cleanup the unused _metadata
    delete mongoObject._metadata;
  }
  return mongoObject;
};
function validateExplainValue(explain) {
  if (explain) {
    // The list of allowed explain values is from node-mongodb-native/lib/explain.js
    const explainAllowedValues = ['queryPlanner', 'queryPlannerExtended', 'executionStats', 'allPlansExecution', false, true];
    if (!explainAllowedValues.includes(explain)) {
      throw new _node.default.Error(_node.default.Error.INVALID_QUERY, 'Invalid value for explain');
    }
  }
}
class MongoStorageAdapter {
  // Private

  // Public

  constructor({
    uri = _defaults.default.DefaultMongoURI,
    collectionPrefix = '',
    mongoOptions = {}
  }) {
    this._uri = uri;
    this._collectionPrefix = collectionPrefix;
    this._mongoOptions = {
      ...mongoOptions
    };
    this._onchange = () => {};

    // MaxTimeMS is not a global MongoDB client option, it is applied per operation.
    this._maxTimeMS = mongoOptions.maxTimeMS;
    this.canSortOnJoinTables = true;
    this.enableSchemaHooks = !!mongoOptions.enableSchemaHooks;
    this.schemaCacheTtl = mongoOptions.schemaCacheTtl;
    for (const key of ['enableSchemaHooks', 'schemaCacheTtl', 'maxTimeMS']) {
      delete mongoOptions[key];
      delete this._mongoOptions[key];
    }
  }
  watch(callback) {
    this._onchange = callback;
  }
  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // parsing and re-formatting causes the auth value (if there) to get URI
    // encoded
    const encodedUri = (0, _mongodbUrl.format)((0, _mongodbUrl.parse)(this._uri));
    this.connectionPromise = MongoClient.connect(encodedUri, this._mongoOptions).then(client => {
      // Starting mongoDB 3.0, the MongoClient.connect don't return a DB anymore but a client
      // Fortunately, we can get back the options and use them to select the proper DB.
      // https://github.com/mongodb/node-mongodb-native/blob/2c35d76f08574225b8db02d7bef687123e6bb018/lib/mongo_client.js#L885
      const options = client.s.options;
      const database = client.db(options.dbName);
      if (!database) {
        delete this.connectionPromise;
        return;
      }
      client.on('error', () => {
        delete this.connectionPromise;
      });
      client.on('close', () => {
        delete this.connectionPromise;
      });
      this.client = client;
      this.database = database;
    }).catch(err => {
      delete this.connectionPromise;
      return Promise.reject(err);
    });
    return this.connectionPromise;
  }
  handleError(error) {
    if (error && error.code === 13) {
      // Unauthorized error
      delete this.client;
      delete this.database;
      delete this.connectionPromise;
      _logger.default.error('Received unauthorized error', {
        error: error
      });
    }
    throw error;
  }
  async handleShutdown() {
    if (!this.client) {
      return;
    }
    await this.client.close(false);
    delete this.connectionPromise;
  }
  _adaptiveCollection(name) {
    return this.connect().then(() => this.database.collection(this._collectionPrefix + name)).then(rawCollection => new _MongoCollection.default(rawCollection)).catch(err => this.handleError(err));
  }
  _schemaCollection() {
    return this.connect().then(() => this._adaptiveCollection(MongoSchemaCollectionName)).then(collection => {
      if (!this._stream && this.enableSchemaHooks) {
        this._stream = collection._mongoCollection.watch();
        this._stream.on('change', () => this._onchange());
      }
      return new _MongoSchemaCollection.default(collection);
    });
  }
  classExists(name) {
    return this.connect().then(() => {
      return this.database.listCollections({
        name: this._collectionPrefix + name
      }).toArray();
    }).then(collections => {
      return collections.length > 0;
    }).catch(err => this.handleError(err));
  }
  setClassLevelPermissions(className, CLPs) {
    return this._schemaCollection().then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: {
        '_metadata.class_permissions': CLPs
      }
    })).catch(err => this.handleError(err));
  }
  setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields) {
    if (submittedIndexes === undefined) {
      return Promise.resolve();
    }
    if (Object.keys(existingIndexes).length === 0) {
      existingIndexes = {
        _id_: {
          _id: 1
        }
      };
    }
    const deletePromises = [];
    const insertedIndexes = [];
    Object.keys(submittedIndexes).forEach(name => {
      const field = submittedIndexes[name];
      if (existingIndexes[name] && field.__op !== 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} exists, cannot update.`);
      }
      if (!existingIndexes[name] && field.__op === 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} does not exist, cannot delete.`);
      }
      if (field.__op === 'Delete') {
        const promise = this.dropIndex(className, name);
        deletePromises.push(promise);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!Object.prototype.hasOwnProperty.call(fields, key.indexOf('_p_') === 0 ? key.replace('_p_', '') : key)) {
            throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Field ${key} does not exist, cannot add index.`);
          }
        });
        existingIndexes[name] = field;
        insertedIndexes.push({
          key: field,
          name
        });
      }
    });
    let insertPromise = Promise.resolve();
    if (insertedIndexes.length > 0) {
      insertPromise = this.createIndexes(className, insertedIndexes);
    }
    return Promise.all(deletePromises).then(() => insertPromise).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: {
        '_metadata.indexes': existingIndexes
      }
    })).catch(err => this.handleError(err));
  }
  setIndexesFromMongo(className) {
    return this.getIndexes(className).then(indexes => {
      indexes = indexes.reduce((obj, index) => {
        if (index.key._fts) {
          delete index.key._fts;
          delete index.key._ftsx;
          for (const field in index.weights) {
            index.key[field] = 'text';
          }
        }
        obj[index.name] = index.key;
        return obj;
      }, {});
      return this._schemaCollection().then(schemaCollection => schemaCollection.updateSchema(className, {
        $set: {
          '_metadata.indexes': indexes
        }
      }));
    }).catch(err => this.handleError(err)).catch(() => {
      // Ignore if collection not found
      return Promise.resolve();
    });
  }
  createClass(className, schema) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = mongoSchemaFromFieldsAndClassNameAndCLP(schema.fields, className, schema.classLevelPermissions, schema.indexes);
    mongoObject._id = className;
    return this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.insertSchema(mongoObject)).catch(err => this.handleError(err));
  }
  async updateFieldOptions(className, fieldName, type) {
    const schemaCollection = await this._schemaCollection();
    await schemaCollection.updateFieldOptions(className, fieldName, type);
  }
  addFieldIfNotExists(className, fieldName, type) {
    return this._schemaCollection().then(schemaCollection => schemaCollection.addFieldIfNotExists(className, fieldName, type)).then(() => this.createIndexesIfNeeded(className, fieldName, type)).catch(err => this.handleError(err));
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  deleteClass(className) {
    return this._adaptiveCollection(className).then(collection => collection.drop()).catch(error => {
      // 'ns not found' means collection was already gone. Ignore deletion attempt.
      if (error.message == 'ns not found') {
        return;
      }
      throw error;
    })
    // We've dropped the collection, now remove the _SCHEMA document
    .then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.findAndDeleteSchema(className)).catch(err => this.handleError(err));
  }
  deleteAllClasses(fast) {
    return storageAdapterAllCollections(this).then(collections => Promise.all(collections.map(collection => fast ? collection.deleteMany({}) : collection.drop())));
  }

  // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.

  // Pointer field names are passed for legacy reasons: the original mongo
  // format stored pointer field names differently in the database, and therefore
  // needed to know the type of the field before it could delete it. Future database
  // adapters should ignore the pointerFieldNames argument. All the field names are in
  // fieldNames, they show up additionally in the pointerFieldNames database for use
  // by the mongo adapter, which deals with the legacy mongo format.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  deleteFields(className, schema, fieldNames) {
    const mongoFormatNames = fieldNames.map(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer') {
        return `_p_${fieldName}`;
      } else {
        return fieldName;
      }
    });
    const collectionUpdate = {
      $unset: {}
    };
    mongoFormatNames.forEach(name => {
      collectionUpdate['$unset'][name] = null;
    });
    const collectionFilter = {
      $or: []
    };
    mongoFormatNames.forEach(name => {
      collectionFilter['$or'].push({
        [name]: {
          $exists: true
        }
      });
    });
    const schemaUpdate = {
      $unset: {}
    };
    fieldNames.forEach(name => {
      schemaUpdate['$unset'][name] = null;
      schemaUpdate['$unset'][`_metadata.fields_options.${name}`] = null;
    });
    return this._adaptiveCollection(className).then(collection => collection.updateMany(collectionFilter, collectionUpdate)).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.updateSchema(className, schemaUpdate)).catch(err => this.handleError(err));
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  getAllClasses() {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchAllSchemasFrom_SCHEMA()).catch(err => this.handleError(err));
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  getClass(className) {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchOneSchemaFrom_SCHEMA(className)).catch(err => this.handleError(err));
  }

  // TODO: As yet not particularly well specified. Creates an object. Maybe shouldn't even need the schema,
  // and should infer from the type. Or maybe does need the schema for validations. Or maybe needs
  // the schema only for the legacy mongo format. We'll figure that out later.
  createObject(className, schema, object, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = (0, _MongoTransform.parseObjectToMongoObjectForCreate)(className, object, schema);
    return this._adaptiveCollection(className).then(collection => collection.insertOne(mongoObject, transactionalSession)).then(() => ({
      ops: [mongoObject]
    })).catch(error => {
      if (error.code === 11000) {
        // Duplicate value
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;
        if (error.message) {
          const matches = error.message.match(/index:[\sa-zA-Z0-9_\-\.]+\$?([a-zA-Z_-]+)_1/);
          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
          }
        }
        throw err;
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  deleteObjectsByQuery(className, schema, query, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    return this._adaptiveCollection(className).then(collection => {
      const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
      return collection.deleteMany(mongoWhere, transactionalSession);
    }).catch(err => this.handleError(err)).then(({
      deletedCount
    }) => {
      if (deletedCount === 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
      return Promise.resolve();
    }, () => {
      throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'Database adapter error');
    });
  }

  // Apply the update to all objects that match the given Parse Query.
  updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.updateMany(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  }

  // Atomically finds and updates an object based on query.
  // Return value not currently well specified.
  findOneAndUpdate(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.findOneAndUpdate(mongoWhere, mongoUpdate, {
      returnDocument: 'after',
      session: transactionalSession || undefined
    })).then(result => (0, _MongoTransform.mongoObjectToParseObject)(className, result, schema)).catch(error => {
      if (error.code === 11000) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Hopefully we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.upsertOne(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  }

  // Executes a find. Accepts: className, query in Parse format, and { skip, limit, sort }.
  find(className, schema, query, {
    skip,
    limit,
    sort,
    keys,
    readPreference,
    hint,
    caseInsensitive,
    explain,
    comment
  }) {
    validateExplainValue(explain);
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    const mongoSort = _lodash.default.mapKeys(sort, (value, fieldName) => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    const mongoKeys = _lodash.default.reduce(keys, (memo, key) => {
      if (key === 'ACL') {
        memo['_rperm'] = 1;
        memo['_wperm'] = 1;
      } else {
        memo[(0, _MongoTransform.transformKey)(className, key, schema)] = 1;
      }
      return memo;
    }, {});

    // If we aren't requesting the `_id` field, we need to explicitly opt out
    // of it. Doing so in parse-server is unusual, but it can allow us to
    // optimize some queries with covering indexes.
    if (keys && !mongoKeys._id) {
      mongoKeys._id = 0;
    }
    readPreference = this._parseReadPreference(readPreference);
    return this.createTextIndexesIfNeeded(className, query, schema).then(() => this._adaptiveCollection(className)).then(collection => collection.find(mongoWhere, {
      skip,
      limit,
      sort: mongoSort,
      keys: mongoKeys,
      maxTimeMS: this._maxTimeMS,
      readPreference,
      hint,
      caseInsensitive,
      explain,
      comment
    })).then(objects => {
      if (explain) {
        return objects;
      }
      return objects.map(object => (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema));
    }).catch(err => this.handleError(err));
  }
  ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, options = {}) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = options.indexType !== undefined ? options.indexType : 1;
    });
    const defaultOptions = {
      background: true,
      sparse: true
    };
    const indexNameOptions = indexName ? {
      name: indexName
    } : {};
    const ttlOptions = options.ttl !== undefined ? {
      expireAfterSeconds: options.ttl
    } : {};
    const caseInsensitiveOptions = caseInsensitive ? {
      collation: _MongoCollection.default.caseInsensitiveCollation()
    } : {};
    const indexOptions = {
      ...defaultOptions,
      ...caseInsensitiveOptions,
      ...indexNameOptions,
      ...ttlOptions
    };
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndex(indexCreationRequest, indexOptions)).catch(err => this.handleError(err));
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  ensureUniqueness(className, schema, fieldNames) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = 1;
    });
    return this._adaptiveCollection(className).then(collection => collection._ensureSparseUniqueIndexInBackground(indexCreationRequest)).catch(error => {
      if (error.code === 11000) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'Tried to ensure field uniqueness for a class that already has duplicates.');
      }
      throw error;
    }).catch(err => this.handleError(err));
  }

  // Used in tests
  _rawFind(className, query) {
    return this._adaptiveCollection(className).then(collection => collection.find(query, {
      maxTimeMS: this._maxTimeMS
    })).catch(err => this.handleError(err));
  }

  // Executes a count.
  count(className, schema, query, readPreference, _estimate, hint, comment) {
    schema = convertParseSchemaToMongoSchema(schema);
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.count((0, _MongoTransform.transformWhere)(className, query, schema, true), {
      maxTimeMS: this._maxTimeMS,
      readPreference,
      hint,
      comment
    })).catch(err => this.handleError(err));
  }
  distinct(className, schema, query, fieldName) {
    schema = convertParseSchemaToMongoSchema(schema);
    const isPointerField = schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const transformField = (0, _MongoTransform.transformKey)(className, fieldName, schema);
    return this._adaptiveCollection(className).then(collection => collection.distinct(transformField, (0, _MongoTransform.transformWhere)(className, query, schema))).then(objects => {
      objects = objects.filter(obj => obj != null);
      return objects.map(object => {
        if (isPointerField) {
          return (0, _MongoTransform.transformPointerString)(schema, fieldName, object);
        }
        return (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema);
      });
    }).catch(err => this.handleError(err));
  }
  aggregate(className, schema, pipeline, readPreference, hint, explain, comment) {
    validateExplainValue(explain);
    let isPointerField = false;
    pipeline = pipeline.map(stage => {
      if (stage.$group) {
        stage.$group = this._parseAggregateGroupArgs(schema, stage.$group);
        if (stage.$group._id && typeof stage.$group._id === 'string' && stage.$group._id.indexOf('$_p_') >= 0) {
          isPointerField = true;
        }
      }
      if (stage.$match) {
        stage.$match = this._parseAggregateArgs(schema, stage.$match);
      }
      if (stage.$project) {
        stage.$project = this._parseAggregateProjectArgs(schema, stage.$project);
      }
      if (stage.$geoNear && stage.$geoNear.query) {
        stage.$geoNear.query = this._parseAggregateArgs(schema, stage.$geoNear.query);
      }
      return stage;
    });
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.aggregate(pipeline, {
      readPreference,
      maxTimeMS: this._maxTimeMS,
      hint,
      explain,
      comment
    })).then(results => {
      results.forEach(result => {
        if (Object.prototype.hasOwnProperty.call(result, '_id')) {
          if (isPointerField && result._id) {
            result._id = result._id.split('$')[1];
          }
          if (result._id == null || result._id == undefined || ['object', 'string'].includes(typeof result._id) && _lodash.default.isEmpty(result._id)) {
            result._id = null;
          }
          result.objectId = result._id;
          delete result._id;
        }
      });
      return results;
    }).then(objects => objects.map(object => (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema))).catch(err => this.handleError(err));
  }

  // This function will recursively traverse the pipeline and convert any Pointer or Date columns.
  // If we detect a pointer column we will rename the column being queried for to match the column
  // in the database. We also modify the value to what we expect the value to be in the database
  // as well.
  // For dates, the driver expects a Date object, but we have a string coming in. So we'll convert
  // the string to a Date so the driver can perform the necessary comparison.
  //
  // The goal of this method is to look for the "leaves" of the pipeline and determine if it needs
  // to be converted. The pipeline can have a few different forms. For more details, see:
  //     https://docs.mongodb.com/manual/reference/operator/aggregation/
  //
  // If the pipeline is an array, it means we are probably parsing an '$and' or '$or' operator. In
  // that case we need to loop through all of it's children to find the columns being operated on.
  // If the pipeline is an object, then we'll loop through the keys checking to see if the key name
  // matches one of the schema columns. If it does match a column and the column is a Pointer or
  // a Date, then we'll convert the value as described above.
  //
  // As much as I hate recursion...this seemed like a good fit for it. We're essentially traversing
  // down a tree to find a "leaf node" and checking to see if it needs to be converted.
  _parseAggregateArgs(schema, pipeline) {
    if (pipeline === null) {
      return null;
    } else if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};
      for (const field in pipeline) {
        if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
          if (typeof pipeline[field] === 'object') {
            // Pass objects down to MongoDB...this is more than likely an $exists operator.
            returnValue[`_p_${field}`] = pipeline[field];
          } else {
            returnValue[`_p_${field}`] = `${schema.fields[field].targetClass}$${pipeline[field]}`;
          }
        } else if (schema.fields[field] && schema.fields[field].type === 'Date') {
          returnValue[field] = this._convertToDate(pipeline[field]);
        } else {
          returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
        }
        if (field === 'objectId') {
          returnValue['_id'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'createdAt') {
          returnValue['_created_at'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'updatedAt') {
          returnValue['_updated_at'] = returnValue[field];
          delete returnValue[field];
        }
      }
      return returnValue;
    }
    return pipeline;
  }

  // This function is slightly different than the one above. Rather than trying to combine these
  // two functions and making the code even harder to understand, I decided to split it up. The
  // difference with this function is we are not transforming the values, only the keys of the
  // pipeline.
  _parseAggregateProjectArgs(schema, pipeline) {
    const returnValue = {};
    for (const field in pipeline) {
      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        returnValue[`_p_${field}`] = pipeline[field];
      } else {
        returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
      }
      if (field === 'objectId') {
        returnValue['_id'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'createdAt') {
        returnValue['_created_at'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'updatedAt') {
        returnValue['_updated_at'] = returnValue[field];
        delete returnValue[field];
      }
    }
    return returnValue;
  }

  // This function is slightly different than the two above. MongoDB $group aggregate looks like:
  //     { $group: { _id: <expression>, <field1>: { <accumulator1> : <expression1> }, ... } }
  // The <expression> could be a column name, prefixed with the '$' character. We'll look for
  // these <expression> and check to see if it is a 'Pointer' or if it's one of createdAt,
  // updatedAt or objectId and change it accordingly.
  _parseAggregateGroupArgs(schema, pipeline) {
    if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateGroupArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};
      for (const field in pipeline) {
        returnValue[field] = this._parseAggregateGroupArgs(schema, pipeline[field]);
      }
      return returnValue;
    } else if (typeof pipeline === 'string') {
      const field = pipeline.substring(1);
      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        return `$_p_${field}`;
      } else if (field == 'createdAt') {
        return '$_created_at';
      } else if (field == 'updatedAt') {
        return '$_updated_at';
      }
    }
    return pipeline;
  }

  // This function will attempt to convert the provided value to a Date object. Since this is part
  // of an aggregation pipeline, the value can either be a string or it can be another object with
  // an operator in it (like $gt, $lt, etc). Because of this I felt it was easier to make this a
  // recursive method to traverse down to the "leaf node" which is going to be the string.
  _convertToDate(value) {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    const returnValue = {};
    for (const field in value) {
      returnValue[field] = this._convertToDate(value[field]);
    }
    return returnValue;
  }
  _parseReadPreference(readPreference) {
    if (readPreference) {
      readPreference = readPreference.toUpperCase();
    }
    switch (readPreference) {
      case 'PRIMARY':
        readPreference = ReadPreference.PRIMARY;
        break;
      case 'PRIMARY_PREFERRED':
        readPreference = ReadPreference.PRIMARY_PREFERRED;
        break;
      case 'SECONDARY':
        readPreference = ReadPreference.SECONDARY;
        break;
      case 'SECONDARY_PREFERRED':
        readPreference = ReadPreference.SECONDARY_PREFERRED;
        break;
      case 'NEAREST':
        readPreference = ReadPreference.NEAREST;
        break;
      case undefined:
      case null:
      case '':
        break;
      default:
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, 'Not supported read preference.');
    }
    return readPreference;
  }
  performInitialization() {
    return Promise.resolve();
  }
  createIndex(className, index) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndex(index)).catch(err => this.handleError(err));
  }
  createIndexes(className, indexes) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndexes(indexes)).catch(err => this.handleError(err));
  }
  createIndexesIfNeeded(className, fieldName, type) {
    if (type && type.type === 'Polygon') {
      const index = {
        [fieldName]: '2dsphere'
      };
      return this.createIndex(className, index);
    }
    return Promise.resolve();
  }
  createTextIndexesIfNeeded(className, query, schema) {
    for (const fieldName in query) {
      if (!query[fieldName] || !query[fieldName].$text) {
        continue;
      }
      const existingIndexes = schema.indexes;
      for (const key in existingIndexes) {
        const index = existingIndexes[key];
        if (Object.prototype.hasOwnProperty.call(index, fieldName)) {
          return Promise.resolve();
        }
      }
      const indexName = `${fieldName}_text`;
      const textIndex = {
        [indexName]: {
          [fieldName]: 'text'
        }
      };
      return this.setIndexesWithSchemaFormat(className, textIndex, existingIndexes, schema.fields).catch(error => {
        if (error.code === 85) {
          // Index exist with different options
          return this.setIndexesFromMongo(className);
        }
        throw error;
      });
    }
    return Promise.resolve();
  }
  getIndexes(className) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.indexes()).catch(err => this.handleError(err));
  }
  dropIndex(className, index) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.dropIndex(index)).catch(err => this.handleError(err));
  }
  dropAllIndexes(className) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.dropIndexes()).catch(err => this.handleError(err));
  }
  updateSchemaWithIndexes() {
    return this.getAllClasses().then(classes => {
      const promises = classes.map(schema => {
        return this.setIndexesFromMongo(schema.className);
      });
      return Promise.all(promises);
    }).catch(err => this.handleError(err));
  }
  createTransactionalSession() {
    const transactionalSection = this.client.startSession();
    transactionalSection.startTransaction();
    return Promise.resolve(transactionalSection);
  }
  commitTransactionalSession(transactionalSection) {
    const commit = retries => {
      return transactionalSection.commitTransaction().catch(error => {
        if (error && error.hasErrorLabel('TransientTransactionError') && retries > 0) {
          return commit(retries - 1);
        }
        throw error;
      }).then(() => {
        transactionalSection.endSession();
      });
    };
    return commit(5);
  }
  abortTransactionalSession(transactionalSection) {
    return transactionalSection.abortTransaction().then(() => {
      transactionalSection.endSession();
    });
  }
}
exports.MongoStorageAdapter = MongoStorageAdapter;
var _default = exports.default = MongoStorageAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfTW9uZ29Db2xsZWN0aW9uIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfTW9uZ29TY2hlbWFDb2xsZWN0aW9uIiwiX1N0b3JhZ2VBZGFwdGVyIiwiX21vbmdvZGJVcmwiLCJfTW9uZ29UcmFuc2Zvcm0iLCJfbm9kZSIsIl9sb2Rhc2giLCJfZGVmYXVsdHMiLCJfbG9nZ2VyIiwiZSIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwibW9uZ29kYiIsIk1vbmdvQ2xpZW50IiwiUmVhZFByZWZlcmVuY2UiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lIiwic3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyIsIm1vbmdvQWRhcHRlciIsImNvbm5lY3QiLCJ0aGVuIiwiZGF0YWJhc2UiLCJjb2xsZWN0aW9ucyIsImZpbHRlciIsImNvbGxlY3Rpb24iLCJuYW1lc3BhY2UiLCJtYXRjaCIsImNvbGxlY3Rpb25OYW1lIiwiaW5kZXhPZiIsIl9jb2xsZWN0aW9uUHJlZml4IiwiY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYSIsInNjaGVtYSIsImZpZWxkcyIsIl9ycGVybSIsIl93cGVybSIsImNsYXNzTmFtZSIsIl9oYXNoZWRfcGFzc3dvcmQiLCJtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwibW9uZ29PYmplY3QiLCJfaWQiLCJvYmplY3RJZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsIl9tZXRhZGF0YSIsInVuZGVmaW5lZCIsImZpZWxkTmFtZSIsInR5cGUiLCJ0YXJnZXRDbGFzcyIsImZpZWxkT3B0aW9ucyIsIk1vbmdvU2NoZW1hQ29sbGVjdGlvbiIsInBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSIsIk9iamVjdCIsImtleXMiLCJsZW5ndGgiLCJmaWVsZHNfb3B0aW9ucyIsImNsYXNzX3Blcm1pc3Npb25zIiwidmFsaWRhdGVFeHBsYWluVmFsdWUiLCJleHBsYWluIiwiZXhwbGFpbkFsbG93ZWRWYWx1ZXMiLCJpbmNsdWRlcyIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiZGVmYXVsdHMiLCJEZWZhdWx0TW9uZ29VUkkiLCJjb2xsZWN0aW9uUHJlZml4IiwibW9uZ29PcHRpb25zIiwiX3VyaSIsIl9tb25nb09wdGlvbnMiLCJfb25jaGFuZ2UiLCJfbWF4VGltZU1TIiwibWF4VGltZU1TIiwiY2FuU29ydE9uSm9pblRhYmxlcyIsImVuYWJsZVNjaGVtYUhvb2tzIiwic2NoZW1hQ2FjaGVUdGwiLCJrZXkiLCJ3YXRjaCIsImNhbGxiYWNrIiwiY29ubmVjdGlvblByb21pc2UiLCJlbmNvZGVkVXJpIiwiZm9ybWF0VXJsIiwicGFyc2VVcmwiLCJjbGllbnQiLCJvcHRpb25zIiwicyIsImRiIiwiZGJOYW1lIiwib24iLCJjYXRjaCIsImVyciIsIlByb21pc2UiLCJyZWplY3QiLCJoYW5kbGVFcnJvciIsImVycm9yIiwiY29kZSIsImxvZ2dlciIsImhhbmRsZVNodXRkb3duIiwiY2xvc2UiLCJfYWRhcHRpdmVDb2xsZWN0aW9uIiwibmFtZSIsInJhd0NvbGxlY3Rpb24iLCJNb25nb0NvbGxlY3Rpb24iLCJfc2NoZW1hQ29sbGVjdGlvbiIsIl9zdHJlYW0iLCJfbW9uZ29Db2xsZWN0aW9uIiwiY2xhc3NFeGlzdHMiLCJsaXN0Q29sbGVjdGlvbnMiLCJ0b0FycmF5Iiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInNjaGVtYUNvbGxlY3Rpb24iLCJ1cGRhdGVTY2hlbWEiLCIkc2V0Iiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJzdWJtaXR0ZWRJbmRleGVzIiwiZXhpc3RpbmdJbmRleGVzIiwicmVzb2x2ZSIsIl9pZF8iLCJkZWxldGVQcm9taXNlcyIsImluc2VydGVkSW5kZXhlcyIsImZvckVhY2giLCJmaWVsZCIsIl9fb3AiLCJwcm9taXNlIiwiZHJvcEluZGV4IiwicHVzaCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInJlcGxhY2UiLCJpbnNlcnRQcm9taXNlIiwiY3JlYXRlSW5kZXhlcyIsImFsbCIsInNldEluZGV4ZXNGcm9tTW9uZ28iLCJnZXRJbmRleGVzIiwicmVkdWNlIiwib2JqIiwiaW5kZXgiLCJfZnRzIiwiX2Z0c3giLCJ3ZWlnaHRzIiwiY3JlYXRlQ2xhc3MiLCJpbnNlcnRTY2hlbWEiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJhZGRGaWVsZElmTm90RXhpc3RzIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZGVsZXRlQ2xhc3MiLCJkcm9wIiwibWVzc2FnZSIsImZpbmRBbmREZWxldGVTY2hlbWEiLCJkZWxldGVBbGxDbGFzc2VzIiwiZmFzdCIsIm1hcCIsImRlbGV0ZU1hbnkiLCJkZWxldGVGaWVsZHMiLCJmaWVsZE5hbWVzIiwibW9uZ29Gb3JtYXROYW1lcyIsImNvbGxlY3Rpb25VcGRhdGUiLCIkdW5zZXQiLCJjb2xsZWN0aW9uRmlsdGVyIiwiJG9yIiwiJGV4aXN0cyIsInNjaGVtYVVwZGF0ZSIsInVwZGF0ZU1hbnkiLCJnZXRBbGxDbGFzc2VzIiwic2NoZW1hc0NvbGxlY3Rpb24iLCJfZmV0Y2hBbGxTY2hlbWFzRnJvbV9TQ0hFTUEiLCJnZXRDbGFzcyIsIl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BIiwiY3JlYXRlT2JqZWN0Iiwib2JqZWN0IiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJwYXJzZU9iamVjdFRvTW9uZ29PYmplY3RGb3JDcmVhdGUiLCJpbnNlcnRPbmUiLCJvcHMiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1bmRlcmx5aW5nRXJyb3IiLCJtYXRjaGVzIiwiQXJyYXkiLCJpc0FycmF5IiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJxdWVyeSIsIm1vbmdvV2hlcmUiLCJ0cmFuc2Zvcm1XaGVyZSIsImRlbGV0ZWRDb3VudCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJ1cGRhdGVPYmplY3RzQnlRdWVyeSIsInVwZGF0ZSIsIm1vbmdvVXBkYXRlIiwidHJhbnNmb3JtVXBkYXRlIiwiZmluZE9uZUFuZFVwZGF0ZSIsInJldHVybkRvY3VtZW50Iiwic2Vzc2lvbiIsInJlc3VsdCIsIm1vbmdvT2JqZWN0VG9QYXJzZU9iamVjdCIsInVwc2VydE9uZU9iamVjdCIsInVwc2VydE9uZSIsImZpbmQiLCJza2lwIiwibGltaXQiLCJzb3J0IiwicmVhZFByZWZlcmVuY2UiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwiY29tbWVudCIsIm1vbmdvU29ydCIsIl8iLCJtYXBLZXlzIiwidmFsdWUiLCJ0cmFuc2Zvcm1LZXkiLCJtb25nb0tleXMiLCJtZW1vIiwiX3BhcnNlUmVhZFByZWZlcmVuY2UiLCJjcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkIiwib2JqZWN0cyIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiaW5kZXhDcmVhdGlvblJlcXVlc3QiLCJtb25nb0ZpZWxkTmFtZXMiLCJpbmRleFR5cGUiLCJkZWZhdWx0T3B0aW9ucyIsImJhY2tncm91bmQiLCJzcGFyc2UiLCJpbmRleE5hbWVPcHRpb25zIiwidHRsT3B0aW9ucyIsInR0bCIsImV4cGlyZUFmdGVyU2Vjb25kcyIsImNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMiLCJjb2xsYXRpb24iLCJjYXNlSW5zZW5zaXRpdmVDb2xsYXRpb24iLCJpbmRleE9wdGlvbnMiLCJjcmVhdGVJbmRleCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJfZW5zdXJlU3BhcnNlVW5pcXVlSW5kZXhJbkJhY2tncm91bmQiLCJfcmF3RmluZCIsImNvdW50IiwiX2VzdGltYXRlIiwiZGlzdGluY3QiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybUZpZWxkIiwidHJhbnNmb3JtUG9pbnRlclN0cmluZyIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwic3RhZ2UiLCIkZ3JvdXAiLCJfcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3MiLCIkbWF0Y2giLCJfcGFyc2VBZ2dyZWdhdGVBcmdzIiwiJHByb2plY3QiLCJfcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyIsIiRnZW9OZWFyIiwicmVzdWx0cyIsInNwbGl0IiwiaXNFbXB0eSIsInJldHVyblZhbHVlIiwiX2NvbnZlcnRUb0RhdGUiLCJzdWJzdHJpbmciLCJEYXRlIiwidG9VcHBlckNhc2UiLCJQUklNQVJZIiwiUFJJTUFSWV9QUkVGRVJSRUQiLCJTRUNPTkRBUlkiLCJTRUNPTkRBUllfUFJFRkVSUkVEIiwiTkVBUkVTVCIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIiR0ZXh0IiwidGV4dEluZGV4IiwiZHJvcEFsbEluZGV4ZXMiLCJkcm9wSW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwiY2xhc3NlcyIsInByb21pc2VzIiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJ0cmFuc2FjdGlvbmFsU2VjdGlvbiIsInN0YXJ0U2Vzc2lvbiIsInN0YXJ0VHJhbnNhY3Rpb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdCIsInJldHJpZXMiLCJjb21taXRUcmFuc2FjdGlvbiIsImhhc0Vycm9yTGFiZWwiLCJlbmRTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb24iLCJleHBvcnRzIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBNb25nb1NjaGVtYUNvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb1NjaGVtYUNvbGxlY3Rpb24nO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgU3RvcmFnZUNsYXNzLCBRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZVVybCwgZm9ybWF0IGFzIGZvcm1hdFVybCB9IGZyb20gJy4uLy4uLy4uL3ZlbmRvci9tb25nb2RiVXJsJztcbmltcG9ydCB7XG4gIHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSxcbiAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0LFxuICB0cmFuc2Zvcm1LZXksXG4gIHRyYW5zZm9ybVdoZXJlLFxuICB0cmFuc2Zvcm1VcGRhdGUsXG4gIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcsXG59IGZyb20gJy4vTW9uZ29UcmFuc2Zvcm0nO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vLi4vZGVmYXVsdHMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi8uLi9sb2dnZXInO1xuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmNvbnN0IG1vbmdvZGIgPSByZXF1aXJlKCdtb25nb2RiJyk7XG5jb25zdCBNb25nb0NsaWVudCA9IG1vbmdvZGIuTW9uZ29DbGllbnQ7XG5jb25zdCBSZWFkUHJlZmVyZW5jZSA9IG1vbmdvZGIuUmVhZFByZWZlcmVuY2U7XG5cbmNvbnN0IE1vbmdvU2NoZW1hQ29sbGVjdGlvbk5hbWUgPSAnX1NDSEVNQSc7XG5cbmNvbnN0IHN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnMgPSBtb25nb0FkYXB0ZXIgPT4ge1xuICByZXR1cm4gbW9uZ29BZGFwdGVyXG4gICAgLmNvbm5lY3QoKVxuICAgIC50aGVuKCgpID0+IG1vbmdvQWRhcHRlci5kYXRhYmFzZS5jb2xsZWN0aW9ucygpKVxuICAgIC50aGVuKGNvbGxlY3Rpb25zID0+IHtcbiAgICAgIHJldHVybiBjb2xsZWN0aW9ucy5maWx0ZXIoY29sbGVjdGlvbiA9PiB7XG4gICAgICAgIGlmIChjb2xsZWN0aW9uLm5hbWVzcGFjZS5tYXRjaCgvXFwuc3lzdGVtXFwuLykpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVE9ETzogSWYgeW91IGhhdmUgb25lIGFwcCB3aXRoIGEgY29sbGVjdGlvbiBwcmVmaXggdGhhdCBoYXBwZW5zIHRvIGJlIGEgcHJlZml4IG9mIGFub3RoZXJcbiAgICAgICAgLy8gYXBwcyBwcmVmaXgsIHRoaXMgd2lsbCBnbyB2ZXJ5IHZlcnkgYmFkbHkuIFdlIHNob3VsZCBmaXggdGhhdCBzb21laG93LlxuICAgICAgICByZXR1cm4gY29sbGVjdGlvbi5jb2xsZWN0aW9uTmFtZS5pbmRleE9mKG1vbmdvQWRhcHRlci5fY29sbGVjdGlvblByZWZpeCkgPT0gMDtcbiAgICAgIH0pO1xuICAgIH0pO1xufTtcblxuY29uc3QgY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgLy8gTGVnYWN5IG1vbmdvIGFkYXB0ZXIga25vd3MgYWJvdXQgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBwYXNzd29yZCBhbmQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBGdXR1cmUgZGF0YWJhc2UgYWRhcHRlcnMgd2lsbCBvbmx5IGtub3cgYWJvdXQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBOb3RlOiBQYXJzZSBTZXJ2ZXIgd2lsbCBicmluZyBiYWNrIHBhc3N3b3JkIHdpdGggaW5qZWN0RGVmYXVsdFNjaGVtYSwgc28gd2UgZG9uJ3QgbmVlZFxuICAgIC8vIHRvIGFkZCBfaGFzaGVkX3Bhc3N3b3JkIGJhY2sgZXZlci5cbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbi8vIFJldHVybnMgeyBjb2RlLCBlcnJvciB9IGlmIGludmFsaWQsIG9yIHsgcmVzdWx0IH0sIGFuIG9iamVjdFxuLy8gc3VpdGFibGUgZm9yIGluc2VydGluZyBpbnRvIF9TQ0hFTUEgY29sbGVjdGlvbiwgb3RoZXJ3aXNlLlxuY29uc3QgbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQID0gKFxuICBmaWVsZHMsXG4gIGNsYXNzTmFtZSxcbiAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICBpbmRleGVzXG4pID0+IHtcbiAgY29uc3QgbW9uZ29PYmplY3QgPSB7XG4gICAgX2lkOiBjbGFzc05hbWUsXG4gICAgb2JqZWN0SWQ6ICdzdHJpbmcnLFxuICAgIHVwZGF0ZWRBdDogJ3N0cmluZycsXG4gICAgY3JlYXRlZEF0OiAnc3RyaW5nJyxcbiAgICBfbWV0YWRhdGE6IHVuZGVmaW5lZCxcbiAgfTtcblxuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICBjb25zdCB7IHR5cGUsIHRhcmdldENsYXNzLCAuLi5maWVsZE9wdGlvbnMgfSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgIG1vbmdvT2JqZWN0W2ZpZWxkTmFtZV0gPSBNb25nb1NjaGVtYUNvbGxlY3Rpb24ucGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlKHtcbiAgICAgIHR5cGUsXG4gICAgICB0YXJnZXRDbGFzcyxcbiAgICB9KTtcbiAgICBpZiAoZmllbGRPcHRpb25zICYmIE9iamVjdC5rZXlzKGZpZWxkT3B0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zID0gbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zW2ZpZWxkTmFtZV0gPSBmaWVsZE9wdGlvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKHR5cGVvZiBjbGFzc0xldmVsUGVybWlzc2lvbnMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgIGlmICghY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgICBkZWxldGUgbW9uZ29PYmplY3QuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zO1xuICAgIH0gZWxzZSB7XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMgPSBjbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKGluZGV4ZXMgJiYgdHlwZW9mIGluZGV4ZXMgPT09ICdvYmplY3QnICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCA+IDApIHtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmluZGV4ZXMgPSBpbmRleGVzO1xuICB9XG5cbiAgaWYgKCFtb25nb09iamVjdC5fbWV0YWRhdGEpIHtcbiAgICAvLyBjbGVhbnVwIHRoZSB1bnVzZWQgX21ldGFkYXRhXG4gICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YTtcbiAgfVxuXG4gIHJldHVybiBtb25nb09iamVjdDtcbn07XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pIHtcbiAgaWYgKGV4cGxhaW4pIHtcbiAgICAvLyBUaGUgbGlzdCBvZiBhbGxvd2VkIGV4cGxhaW4gdmFsdWVzIGlzIGZyb20gbm9kZS1tb25nb2RiLW5hdGl2ZS9saWIvZXhwbGFpbi5qc1xuICAgIGNvbnN0IGV4cGxhaW5BbGxvd2VkVmFsdWVzID0gW1xuICAgICAgJ3F1ZXJ5UGxhbm5lcicsXG4gICAgICAncXVlcnlQbGFubmVyRXh0ZW5kZWQnLFxuICAgICAgJ2V4ZWN1dGlvblN0YXRzJyxcbiAgICAgICdhbGxQbGFuc0V4ZWN1dGlvbicsXG4gICAgICBmYWxzZSxcbiAgICAgIHRydWUsXG4gICAgXTtcbiAgICBpZiAoIWV4cGxhaW5BbGxvd2VkVmFsdWVzLmluY2x1ZGVzKGV4cGxhaW4pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0ludmFsaWQgdmFsdWUgZm9yIGV4cGxhaW4nKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vbmdvU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIC8vIFByaXZhdGVcbiAgX3VyaTogc3RyaW5nO1xuICBfY29sbGVjdGlvblByZWZpeDogc3RyaW5nO1xuICBfbW9uZ29PcHRpb25zOiBPYmplY3Q7XG4gIF9vbmNoYW5nZTogYW55O1xuICBfc3RyZWFtOiBhbnk7XG4gIC8vIFB1YmxpY1xuICBjb25uZWN0aW9uUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgZGF0YWJhc2U6IGFueTtcbiAgY2xpZW50OiBNb25nb0NsaWVudDtcbiAgX21heFRpbWVNUzogP251bWJlcjtcbiAgY2FuU29ydE9uSm9pblRhYmxlczogYm9vbGVhbjtcbiAgZW5hYmxlU2NoZW1hSG9va3M6IGJvb2xlYW47XG4gIHNjaGVtYUNhY2hlVHRsOiA/bnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKHsgdXJpID0gZGVmYXVsdHMuRGVmYXVsdE1vbmdvVVJJLCBjb2xsZWN0aW9uUHJlZml4ID0gJycsIG1vbmdvT3B0aW9ucyA9IHt9IH06IGFueSkge1xuICAgIHRoaXMuX3VyaSA9IHVyaTtcbiAgICB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ID0gY29sbGVjdGlvblByZWZpeDtcbiAgICB0aGlzLl9tb25nb09wdGlvbnMgPSB7IC4uLm1vbmdvT3B0aW9ucyB9O1xuICAgIHRoaXMuX29uY2hhbmdlID0gKCkgPT4geyB9O1xuXG4gICAgLy8gTWF4VGltZU1TIGlzIG5vdCBhIGdsb2JhbCBNb25nb0RCIGNsaWVudCBvcHRpb24sIGl0IGlzIGFwcGxpZWQgcGVyIG9wZXJhdGlvbi5cbiAgICB0aGlzLl9tYXhUaW1lTVMgPSBtb25nb09wdGlvbnMubWF4VGltZU1TO1xuICAgIHRoaXMuY2FuU29ydE9uSm9pblRhYmxlcyA9IHRydWU7XG4gICAgdGhpcy5lbmFibGVTY2hlbWFIb29rcyA9ICEhbW9uZ29PcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzO1xuICAgIHRoaXMuc2NoZW1hQ2FjaGVUdGwgPSBtb25nb09wdGlvbnMuc2NoZW1hQ2FjaGVUdGw7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgWydlbmFibGVTY2hlbWFIb29rcycsICdzY2hlbWFDYWNoZVR0bCcsICdtYXhUaW1lTVMnXSkge1xuICAgICAgZGVsZXRlIG1vbmdvT3B0aW9uc1trZXldO1xuICAgICAgZGVsZXRlIHRoaXMuX21vbmdvT3B0aW9uc1trZXldO1xuICAgIH1cbiAgfVxuXG4gIHdhdGNoKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSBjYWxsYmFjaztcbiAgfVxuXG4gIGNvbm5lY3QoKSB7XG4gICAgaWYgKHRoaXMuY29ubmVjdGlvblByb21pc2UpIHtcbiAgICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICAgIH1cblxuICAgIC8vIHBhcnNpbmcgYW5kIHJlLWZvcm1hdHRpbmcgY2F1c2VzIHRoZSBhdXRoIHZhbHVlIChpZiB0aGVyZSkgdG8gZ2V0IFVSSVxuICAgIC8vIGVuY29kZWRcbiAgICBjb25zdCBlbmNvZGVkVXJpID0gZm9ybWF0VXJsKHBhcnNlVXJsKHRoaXMuX3VyaSkpO1xuICAgIHRoaXMuY29ubmVjdGlvblByb21pc2UgPSBNb25nb0NsaWVudC5jb25uZWN0KGVuY29kZWRVcmksIHRoaXMuX21vbmdvT3B0aW9ucylcbiAgICAgIC50aGVuKGNsaWVudCA9PiB7XG4gICAgICAgIC8vIFN0YXJ0aW5nIG1vbmdvREIgMy4wLCB0aGUgTW9uZ29DbGllbnQuY29ubmVjdCBkb24ndCByZXR1cm4gYSBEQiBhbnltb3JlIGJ1dCBhIGNsaWVudFxuICAgICAgICAvLyBGb3J0dW5hdGVseSwgd2UgY2FuIGdldCBiYWNrIHRoZSBvcHRpb25zIGFuZCB1c2UgdGhlbSB0byBzZWxlY3QgdGhlIHByb3BlciBEQi5cbiAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL21vbmdvZGIvbm9kZS1tb25nb2RiLW5hdGl2ZS9ibG9iLzJjMzVkNzZmMDg1NzQyMjViOGRiMDJkN2JlZjY4NzEyM2U2YmIwMTgvbGliL21vbmdvX2NsaWVudC5qcyNMODg1XG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSBjbGllbnQucy5vcHRpb25zO1xuICAgICAgICBjb25zdCBkYXRhYmFzZSA9IGNsaWVudC5kYihvcHRpb25zLmRiTmFtZSk7XG4gICAgICAgIGlmICghZGF0YWJhc2UpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY2xpZW50Lm9uKCdlcnJvcicsICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGNsaWVudC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmNsaWVudCA9IGNsaWVudDtcbiAgICAgICAgdGhpcy5kYXRhYmFzZSA9IGRhdGFiYXNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycik7XG4gICAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICB9XG5cbiAgaGFuZGxlRXJyb3I8VD4oZXJyb3I6ID8oRXJyb3IgfCBQYXJzZS5FcnJvcikpOiBQcm9taXNlPFQ+IHtcbiAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gMTMpIHtcbiAgICAgIC8vIFVuYXV0aG9yaXplZCBlcnJvclxuICAgICAgZGVsZXRlIHRoaXMuY2xpZW50O1xuICAgICAgZGVsZXRlIHRoaXMuZGF0YWJhc2U7XG4gICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgIGxvZ2dlci5lcnJvcignUmVjZWl2ZWQgdW5hdXRob3JpemVkIGVycm9yJywgeyBlcnJvcjogZXJyb3IgfSk7XG4gICAgfVxuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgaWYgKCF0aGlzLmNsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmNsaWVudC5jbG9zZShmYWxzZSk7XG4gICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gIH1cblxuICBfYWRhcHRpdmVDb2xsZWN0aW9uKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5kYXRhYmFzZS5jb2xsZWN0aW9uKHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggKyBuYW1lKSlcbiAgICAgIC50aGVuKHJhd0NvbGxlY3Rpb24gPT4gbmV3IE1vbmdvQ29sbGVjdGlvbihyYXdDb2xsZWN0aW9uKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIF9zY2hlbWFDb2xsZWN0aW9uKCk6IFByb21pc2U8TW9uZ29TY2hlbWFDb2xsZWN0aW9uPiB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdCgpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oTW9uZ29TY2hlbWFDb2xsZWN0aW9uTmFtZSkpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLl9zdHJlYW0gJiYgdGhpcy5lbmFibGVTY2hlbWFIb29rcykge1xuICAgICAgICAgIHRoaXMuX3N0cmVhbSA9IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi53YXRjaCgpO1xuICAgICAgICAgIHRoaXMuX3N0cmVhbS5vbignY2hhbmdlJywgKCkgPT4gdGhpcy5fb25jaGFuZ2UoKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBNb25nb1NjaGVtYUNvbGxlY3Rpb24oY29sbGVjdGlvbik7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNsYXNzRXhpc3RzKG5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5kYXRhYmFzZS5saXN0Q29sbGVjdGlvbnMoeyBuYW1lOiB0aGlzLl9jb2xsZWN0aW9uUHJlZml4ICsgbmFtZSB9KS50b0FycmF5KCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oY29sbGVjdGlvbnMgPT4ge1xuICAgICAgICByZXR1cm4gY29sbGVjdGlvbnMubGVuZ3RoID4gMDtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zJzogQ0xQcyB9LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkSW5kZXhlczogYW55LFxuICAgIGV4aXN0aW5nSW5kZXhlczogYW55ID0ge30sXG4gICAgZmllbGRzOiBhbnlcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHN1Ym1pdHRlZEluZGV4ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoZXhpc3RpbmdJbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICAgIGV4aXN0aW5nSW5kZXhlcyA9IHsgX2lkXzogeyBfaWQ6IDEgfSB9O1xuICAgIH1cbiAgICBjb25zdCBkZWxldGVQcm9taXNlcyA9IFtdO1xuICAgIGNvbnN0IGluc2VydGVkSW5kZXhlcyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEluZGV4ZXMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEluZGV4ZXNbbmFtZV07XG4gICAgICBpZiAoZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLCBgSW5kZXggJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICBgSW5kZXggJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IHRoaXMuZHJvcEluZGV4KGNsYXNzTmFtZSwgbmFtZSk7XG4gICAgICAgIGRlbGV0ZVByb21pc2VzLnB1c2gocHJvbWlzZSk7XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0luZGV4ZXNbbmFtZV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3Qua2V5cyhmaWVsZCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoXG4gICAgICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICAgICAga2V5LmluZGV4T2YoJ19wXycpID09PSAwID8ga2V5LnJlcGxhY2UoJ19wXycsICcnKSA6IGtleVxuICAgICAgICAgICAgKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgICAgICBgRmllbGQgJHtrZXl9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgYWRkIGluZGV4LmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgZXhpc3RpbmdJbmRleGVzW25hbWVdID0gZmllbGQ7XG4gICAgICAgIGluc2VydGVkSW5kZXhlcy5wdXNoKHtcbiAgICAgICAgICBrZXk6IGZpZWxkLFxuICAgICAgICAgIG5hbWUsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGxldCBpbnNlcnRQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgaWYgKGluc2VydGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICBpbnNlcnRQcm9taXNlID0gdGhpcy5jcmVhdGVJbmRleGVzKGNsYXNzTmFtZSwgaW5zZXJ0ZWRJbmRleGVzKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKGRlbGV0ZVByb21pc2VzKVxuICAgICAgLnRoZW4oKCkgPT4gaW5zZXJ0UHJvbWlzZSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgJHNldDogeyAnX21ldGFkYXRhLmluZGV4ZXMnOiBleGlzdGluZ0luZGV4ZXMgfSxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHNldEluZGV4ZXNGcm9tTW9uZ28oY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRJbmRleGVzKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGluZGV4ZXMgPT4ge1xuICAgICAgICBpbmRleGVzID0gaW5kZXhlcy5yZWR1Y2UoKG9iaiwgaW5kZXgpID0+IHtcbiAgICAgICAgICBpZiAoaW5kZXgua2V5Ll9mdHMpIHtcbiAgICAgICAgICAgIGRlbGV0ZSBpbmRleC5rZXkuX2Z0cztcbiAgICAgICAgICAgIGRlbGV0ZSBpbmRleC5rZXkuX2Z0c3g7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIGluZGV4LndlaWdodHMpIHtcbiAgICAgICAgICAgICAgaW5kZXgua2V5W2ZpZWxkXSA9ICd0ZXh0JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqW2luZGV4Lm5hbWVdID0gaW5kZXgua2V5O1xuICAgICAgICAgIHJldHVybiBvYmo7XG4gICAgICAgIH0sIHt9KTtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKS50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT5cbiAgICAgICAgICBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHtcbiAgICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5pbmRleGVzJzogaW5kZXhlcyB9LFxuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAvLyBJZ25vcmUgaWYgY29sbGVjdGlvbiBub3QgZm91bmRcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gIH1cblxuICBjcmVhdGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvT2JqZWN0ID0gbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQKFxuICAgICAgc2NoZW1hLmZpZWxkcyxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICBzY2hlbWEuaW5kZXhlc1xuICAgICk7XG4gICAgbW9uZ29PYmplY3QuX2lkID0gY2xhc3NOYW1lO1xuICAgIHJldHVybiB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KGNsYXNzTmFtZSwgc2NoZW1hLmluZGV4ZXMsIHt9LCBzY2hlbWEuZmllbGRzKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmluc2VydFNjaGVtYShtb25nb09iamVjdCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVGaWVsZE9wdGlvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICBjb25zdCBzY2hlbWFDb2xsZWN0aW9uID0gYXdhaXQgdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpO1xuICAgIGF3YWl0IHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgfVxuXG4gIGFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24uYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSkpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmNyZWF0ZUluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBEcm9wcyBhIGNvbGxlY3Rpb24uIFJlc29sdmVzIHdpdGggdHJ1ZSBpZiBpdCB3YXMgYSBQYXJzZSBTY2hlbWEgKGVnLiBfVXNlciwgQ3VzdG9tLCBldGMuKVxuICAvLyBhbmQgcmVzb2x2ZXMgd2l0aCBmYWxzZSBpZiBpdCB3YXNuJ3QgKGVnLiBhIGpvaW4gdGFibGUpLiBSZWplY3RzIGlmIGRlbGV0aW9uIHdhcyBpbXBvc3NpYmxlLlxuICBkZWxldGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uZHJvcCgpKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIC8vICducyBub3QgZm91bmQnIG1lYW5zIGNvbGxlY3Rpb24gd2FzIGFscmVhZHkgZ29uZS4gSWdub3JlIGRlbGV0aW9uIGF0dGVtcHQuXG4gICAgICAgICAgaWYgKGVycm9yLm1lc3NhZ2UgPT0gJ25zIG5vdCBmb3VuZCcpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC8vIFdlJ3ZlIGRyb3BwZWQgdGhlIGNvbGxlY3Rpb24sIG5vdyByZW1vdmUgdGhlIF9TQ0hFTUEgZG9jdW1lbnRcbiAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+IHNjaGVtYUNvbGxlY3Rpb24uZmluZEFuZERlbGV0ZVNjaGVtYShjbGFzc05hbWUpKVxuICAgICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSlcbiAgICApO1xuICB9XG5cbiAgZGVsZXRlQWxsQ2xhc3NlcyhmYXN0OiBib29sZWFuKSB7XG4gICAgcmV0dXJuIHN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnModGhpcykudGhlbihjb2xsZWN0aW9ucyA9PlxuICAgICAgUHJvbWlzZS5hbGwoXG4gICAgICAgIGNvbGxlY3Rpb25zLm1hcChjb2xsZWN0aW9uID0+IChmYXN0ID8gY29sbGVjdGlvbi5kZWxldGVNYW55KHt9KSA6IGNvbGxlY3Rpb24uZHJvcCgpKSlcbiAgICAgIClcbiAgICApO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBjb2x1bW4gYW5kIGFsbCB0aGUgZGF0YS4gRm9yIFJlbGF0aW9ucywgdGhlIF9Kb2luIGNvbGxlY3Rpb24gaXMgaGFuZGxlZFxuICAvLyBzcGVjaWFsbHksIHRoaXMgZnVuY3Rpb24gZG9lcyBub3QgZGVsZXRlIF9Kb2luIGNvbHVtbnMuIEl0IHNob3VsZCwgaG93ZXZlciwgaW5kaWNhdGVcbiAgLy8gdGhhdCB0aGUgcmVsYXRpb24gZmllbGRzIGRvZXMgbm90IGV4aXN0IGFueW1vcmUuIEluIG1vbmdvLCB0aGlzIG1lYW5zIHJlbW92aW5nIGl0IGZyb21cbiAgLy8gdGhlIF9TQ0hFTUEgY29sbGVjdGlvbi4gIFRoZXJlIHNob3VsZCBiZSBubyBhY3R1YWwgZGF0YSBpbiB0aGUgY29sbGVjdGlvbiB1bmRlciB0aGUgc2FtZSBuYW1lXG4gIC8vIGFzIHRoZSByZWxhdGlvbiBjb2x1bW4sIHNvIGl0J3MgZmluZSB0byBhdHRlbXB0IHRvIGRlbGV0ZSBpdC4gSWYgdGhlIGZpZWxkcyBsaXN0ZWQgdG8gYmVcbiAgLy8gZGVsZXRlZCBkbyBub3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gc2hvdWxkIHJldHVybiBzdWNjZXNzZnVsbHkgYW55d2F5cy4gQ2hlY2tpbmcgZm9yXG4gIC8vIGF0dGVtcHRzIHRvIGRlbGV0ZSBub24tZXhpc3RlbnQgZmllbGRzIGlzIHRoZSByZXNwb25zaWJpbGl0eSBvZiBQYXJzZSBTZXJ2ZXIuXG5cbiAgLy8gUG9pbnRlciBmaWVsZCBuYW1lcyBhcmUgcGFzc2VkIGZvciBsZWdhY3kgcmVhc29uczogdGhlIG9yaWdpbmFsIG1vbmdvXG4gIC8vIGZvcm1hdCBzdG9yZWQgcG9pbnRlciBmaWVsZCBuYW1lcyBkaWZmZXJlbnRseSBpbiB0aGUgZGF0YWJhc2UsIGFuZCB0aGVyZWZvcmVcbiAgLy8gbmVlZGVkIHRvIGtub3cgdGhlIHR5cGUgb2YgdGhlIGZpZWxkIGJlZm9yZSBpdCBjb3VsZCBkZWxldGUgaXQuIEZ1dHVyZSBkYXRhYmFzZVxuICAvLyBhZGFwdGVycyBzaG91bGQgaWdub3JlIHRoZSBwb2ludGVyRmllbGROYW1lcyBhcmd1bWVudC4gQWxsIHRoZSBmaWVsZCBuYW1lcyBhcmUgaW5cbiAgLy8gZmllbGROYW1lcywgdGhleSBzaG93IHVwIGFkZGl0aW9uYWxseSBpbiB0aGUgcG9pbnRlckZpZWxkTmFtZXMgZGF0YWJhc2UgZm9yIHVzZVxuICAvLyBieSB0aGUgbW9uZ28gYWRhcHRlciwgd2hpY2ggZGVhbHMgd2l0aCB0aGUgbGVnYWN5IG1vbmdvIGZvcm1hdC5cblxuICAvLyBUaGlzIGZ1bmN0aW9uIGlzIG5vdCBvYmxpZ2F0ZWQgdG8gZGVsZXRlIGZpZWxkcyBhdG9taWNhbGx5LiBJdCBpcyBnaXZlbiB0aGUgZmllbGRcbiAgLy8gbmFtZXMgaW4gYSBsaXN0IHNvIHRoYXQgZGF0YWJhc2VzIHRoYXQgYXJlIGNhcGFibGUgb2YgZGVsZXRpbmcgZmllbGRzIGF0b21pY2FsbHlcbiAgLy8gbWF5IGRvIHNvLlxuXG4gIC8vIFJldHVybnMgYSBQcm9taXNlLlxuICBkZWxldGVGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pIHtcbiAgICBjb25zdCBtb25nb0Zvcm1hdE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVybiBgX3BfJHtmaWVsZE5hbWV9YDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBmaWVsZE5hbWU7XG4gICAgICB9XG4gICAgfSk7XG4gICAgY29uc3QgY29sbGVjdGlvblVwZGF0ZSA9IHsgJHVuc2V0OiB7fSB9O1xuICAgIG1vbmdvRm9ybWF0TmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbGxlY3Rpb25VcGRhdGVbJyR1bnNldCddW25hbWVdID0gbnVsbDtcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbGxlY3Rpb25GaWx0ZXIgPSB7ICRvcjogW10gfTtcbiAgICBtb25nb0Zvcm1hdE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb2xsZWN0aW9uRmlsdGVyWyckb3InXS5wdXNoKHsgW25hbWVdOiB7ICRleGlzdHM6IHRydWUgfSB9KTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHNjaGVtYVVwZGF0ZSA9IHsgJHVuc2V0OiB7fSB9O1xuICAgIGZpZWxkTmFtZXMuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIHNjaGVtYVVwZGF0ZVsnJHVuc2V0J11bbmFtZV0gPSBudWxsO1xuICAgICAgc2NoZW1hVXBkYXRlWyckdW5zZXQnXVtgX21ldGFkYXRhLmZpZWxkc19vcHRpb25zLiR7bmFtZX1gXSA9IG51bGw7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi51cGRhdGVNYW55KGNvbGxlY3Rpb25GaWx0ZXIsIGNvbGxlY3Rpb25VcGRhdGUpKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZVNjaGVtYShjbGFzc05hbWUsIHNjaGVtYVVwZGF0ZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciBhbGwgc2NoZW1hcyBrbm93biB0byB0aGlzIGFkYXB0ZXIsIGluIFBhcnNlIGZvcm1hdC4gSW4gY2FzZSB0aGVcbiAgLy8gc2NoZW1hcyBjYW5ub3QgYmUgcmV0cmlldmVkLCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMuIFJlcXVpcmVtZW50cyBmb3IgdGhlXG4gIC8vIHJlamVjdGlvbiByZWFzb24gYXJlIFRCRC5cbiAgZ2V0QWxsQ2xhc3NlcygpOiBQcm9taXNlPFN0b3JhZ2VDbGFzc1tdPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hc0NvbGxlY3Rpb24gPT4gc2NoZW1hc0NvbGxlY3Rpb24uX2ZldGNoQWxsU2NoZW1hc0Zyb21fU0NIRU1BKCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciB0aGUgc2NoZW1hIHdpdGggdGhlIGdpdmVuIG5hbWUsIGluIFBhcnNlIGZvcm1hdC4gSWZcbiAgLy8gdGhpcyBhZGFwdGVyIGRvZXNuJ3Qga25vdyBhYm91dCB0aGUgc2NoZW1hLCByZXR1cm4gYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aXRoXG4gIC8vIHVuZGVmaW5lZCBhcyB0aGUgcmVhc29uLlxuICBnZXRDbGFzcyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8U3RvcmFnZUNsYXNzPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hc0NvbGxlY3Rpb24gPT4gc2NoZW1hc0NvbGxlY3Rpb24uX2ZldGNoT25lU2NoZW1hRnJvbV9TQ0hFTUEoY2xhc3NOYW1lKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFRPRE86IEFzIHlldCBub3QgcGFydGljdWxhcmx5IHdlbGwgc3BlY2lmaWVkLiBDcmVhdGVzIGFuIG9iamVjdC4gTWF5YmUgc2hvdWxkbid0IGV2ZW4gbmVlZCB0aGUgc2NoZW1hLFxuICAvLyBhbmQgc2hvdWxkIGluZmVyIGZyb20gdGhlIHR5cGUuIE9yIG1heWJlIGRvZXMgbmVlZCB0aGUgc2NoZW1hIGZvciB2YWxpZGF0aW9ucy4gT3IgbWF5YmUgbmVlZHNcbiAgLy8gdGhlIHNjaGVtYSBvbmx5IGZvciB0aGUgbGVnYWN5IG1vbmdvIGZvcm1hdC4gV2UnbGwgZmlndXJlIHRoYXQgb3V0IGxhdGVyLlxuICBjcmVhdGVPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgb2JqZWN0OiBhbnksIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55KSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvT2JqZWN0ID0gcGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLmluc2VydE9uZShtb25nb09iamVjdCwgdHJhbnNhY3Rpb25hbFNlc3Npb24pKVxuICAgICAgLnRoZW4oKCkgPT4gKHsgb3BzOiBbbW9uZ29PYmplY3RdIH0pKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgLy8gRHVwbGljYXRlIHZhbHVlXG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBlcnIudW5kZXJseWluZ0Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgaWYgKGVycm9yLm1lc3NhZ2UpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBlcnJvci5tZXNzYWdlLm1hdGNoKC9pbmRleDpbXFxzYS16QS1aMC05X1xcLVxcLl0rXFwkPyhbYS16QS1aXy1dKylfMS8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMgJiYgQXJyYXkuaXNBcnJheShtYXRjaGVzKSkge1xuICAgICAgICAgICAgICBlcnIudXNlckluZm8gPSB7IGR1cGxpY2F0ZWRfZmllbGQ6IG1hdGNoZXNbMV0gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFJlbW92ZSBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgLy8gSWYgbm8gb2JqZWN0cyBtYXRjaCwgcmVqZWN0IHdpdGggT0JKRUNUX05PVF9GT1VORC4gSWYgb2JqZWN0cyBhcmUgZm91bmQgYW5kIGRlbGV0ZWQsIHJlc29sdmUgd2l0aCB1bmRlZmluZWQuXG4gIC8vIElmIHRoZXJlIGlzIHNvbWUgb3RoZXIgZXJyb3IsIHJlamVjdCB3aXRoIElOVEVSTkFMX1NFUlZFUl9FUlJPUi5cbiAgZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiB7XG4gICAgICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgICAgICByZXR1cm4gY29sbGVjdGlvbi5kZWxldGVNYW55KG1vbmdvV2hlcmUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSlcbiAgICAgIC50aGVuKFxuICAgICAgICAoeyBkZWxldGVkQ291bnQgfSkgPT4ge1xuICAgICAgICAgIGlmIChkZWxldGVkQ291bnQgPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9LFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgJ0RhdGFiYXNlIGFkYXB0ZXIgZXJyb3InKTtcbiAgICAgICAgfVxuICAgICAgKTtcbiAgfVxuXG4gIC8vIEFwcGx5IHRoZSB1cGRhdGUgdG8gYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIHVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi51cGRhdGVNYW55KG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBBdG9taWNhbGx5IGZpbmRzIGFuZCB1cGRhdGVzIGFuIG9iamVjdCBiYXNlZCBvbiBxdWVyeS5cbiAgLy8gUmV0dXJuIHZhbHVlIG5vdCBjdXJyZW50bHkgd2VsbCBzcGVjaWZpZWQuXG4gIGZpbmRPbmVBbmRVcGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvVXBkYXRlID0gdHJhbnNmb3JtVXBkYXRlKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZmluZE9uZUFuZFVwZGF0ZShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwge1xuICAgICAgICAgIHJldHVybkRvY3VtZW50OiAnYWZ0ZXInLFxuICAgICAgICAgIHNlc3Npb246IHRyYW5zYWN0aW9uYWxTZXNzaW9uIHx8IHVuZGVmaW5lZCxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCByZXN1bHQsIHNjaGVtYSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEhvcGVmdWxseSB3ZSBjYW4gZ2V0IHJpZCBvZiB0aGlzLiBJdCdzIG9ubHkgdXNlZCBmb3IgY29uZmlnIGFuZCBob29rcy5cbiAgdXBzZXJ0T25lT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi51cHNlcnRPbmUobW9uZ29XaGVyZSwgbW9uZ29VcGRhdGUsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgZmluZC4gQWNjZXB0czogY2xhc3NOYW1lLCBxdWVyeSBpbiBQYXJzZSBmb3JtYXQsIGFuZCB7IHNraXAsIGxpbWl0LCBzb3J0IH0uXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgc29ydCxcbiAgICAgIGtleXMsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgIGhpbnQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICBleHBsYWluLFxuICAgICAgY29tbWVudCxcbiAgICB9OiBRdWVyeU9wdGlvbnNcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICB2YWxpZGF0ZUV4cGxhaW5WYWx1ZShleHBsYWluKTtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29Tb3J0ID0gXy5tYXBLZXlzKHNvcnQsICh2YWx1ZSwgZmllbGROYW1lKSA9PlxuICAgICAgdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpXG4gICAgKTtcbiAgICBjb25zdCBtb25nb0tleXMgPSBfLnJlZHVjZShcbiAgICAgIGtleXMsXG4gICAgICAobWVtbywga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdBQ0wnKSB7XG4gICAgICAgICAgbWVtb1snX3JwZXJtJ10gPSAxO1xuICAgICAgICAgIG1lbW9bJ193cGVybSddID0gMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBtZW1vW3RyYW5zZm9ybUtleShjbGFzc05hbWUsIGtleSwgc2NoZW1hKV0gPSAxO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfSxcbiAgICAgIHt9XG4gICAgKTtcblxuICAgIC8vIElmIHdlIGFyZW4ndCByZXF1ZXN0aW5nIHRoZSBgX2lkYCBmaWVsZCwgd2UgbmVlZCB0byBleHBsaWNpdGx5IG9wdCBvdXRcbiAgICAvLyBvZiBpdC4gRG9pbmcgc28gaW4gcGFyc2Utc2VydmVyIGlzIHVudXN1YWwsIGJ1dCBpdCBjYW4gYWxsb3cgdXMgdG9cbiAgICAvLyBvcHRpbWl6ZSBzb21lIHF1ZXJpZXMgd2l0aCBjb3ZlcmluZyBpbmRleGVzLlxuICAgIGlmIChrZXlzICYmICFtb25nb0tleXMuX2lkKSB7XG4gICAgICBtb25nb0tleXMuX2lkID0gMDtcbiAgICB9XG5cbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVRleHRJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSkpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZmluZChtb25nb1doZXJlLCB7XG4gICAgICAgICAgc2tpcCxcbiAgICAgICAgICBsaW1pdCxcbiAgICAgICAgICBzb3J0OiBtb25nb1NvcnQsXG4gICAgICAgICAga2V5czogbW9uZ29LZXlzLFxuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgICAgY29tbWVudCxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC50aGVuKG9iamVjdHMgPT4ge1xuICAgICAgICBpZiAoZXhwbGFpbikge1xuICAgICAgICAgIHJldHVybiBvYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvYmplY3RzLm1hcChvYmplY3QgPT4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBlbnN1cmVJbmRleChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgZmllbGROYW1lczogc3RyaW5nW10sXG4gICAgaW5kZXhOYW1lOiA/c3RyaW5nLFxuICAgIGNhc2VJbnNlbnNpdGl2ZTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIG9wdGlvbnM/OiBPYmplY3QgPSB7fVxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpbmRleENyZWF0aW9uUmVxdWVzdCA9IHt9O1xuICAgIGNvbnN0IG1vbmdvRmllbGROYW1lcyA9IGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSkpO1xuICAgIG1vbmdvRmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpbmRleENyZWF0aW9uUmVxdWVzdFtmaWVsZE5hbWVdID0gb3B0aW9ucy5pbmRleFR5cGUgIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuaW5kZXhUeXBlIDogMTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGRlZmF1bHRPcHRpb25zOiBPYmplY3QgPSB7IGJhY2tncm91bmQ6IHRydWUsIHNwYXJzZTogdHJ1ZSB9O1xuICAgIGNvbnN0IGluZGV4TmFtZU9wdGlvbnM6IE9iamVjdCA9IGluZGV4TmFtZSA/IHsgbmFtZTogaW5kZXhOYW1lIH0gOiB7fTtcbiAgICBjb25zdCB0dGxPcHRpb25zOiBPYmplY3QgPSBvcHRpb25zLnR0bCAhPT0gdW5kZWZpbmVkID8geyBleHBpcmVBZnRlclNlY29uZHM6IG9wdGlvbnMudHRsIH0gOiB7fTtcbiAgICBjb25zdCBjYXNlSW5zZW5zaXRpdmVPcHRpb25zOiBPYmplY3QgPSBjYXNlSW5zZW5zaXRpdmVcbiAgICAgID8geyBjb2xsYXRpb246IE1vbmdvQ29sbGVjdGlvbi5jYXNlSW5zZW5zaXRpdmVDb2xsYXRpb24oKSB9XG4gICAgICA6IHt9O1xuICAgIGNvbnN0IGluZGV4T3B0aW9uczogT2JqZWN0ID0ge1xuICAgICAgLi4uZGVmYXVsdE9wdGlvbnMsXG4gICAgICAuLi5jYXNlSW5zZW5zaXRpdmVPcHRpb25zLFxuICAgICAgLi4uaW5kZXhOYW1lT3B0aW9ucyxcbiAgICAgIC4uLnR0bE9wdGlvbnMsXG4gICAgfTtcblxuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXgoaW5kZXhDcmVhdGlvblJlcXVlc3QsIGluZGV4T3B0aW9ucylcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSBpbmRleC4gVW5pcXVlIGluZGV4ZXMgb24gbnVsbGFibGUgZmllbGRzIGFyZSBub3QgYWxsb3dlZC4gU2luY2Ugd2UgZG9uJ3RcbiAgLy8gY3VycmVudGx5IGtub3cgd2hpY2ggZmllbGRzIGFyZSBudWxsYWJsZSBhbmQgd2hpY2ggYXJlbid0LCB3ZSBpZ25vcmUgdGhhdCBjcml0ZXJpYS5cbiAgLy8gQXMgc3VjaCwgd2Ugc2hvdWxkbid0IGV4cG9zZSB0aGlzIGZ1bmN0aW9uIHRvIHVzZXJzIG9mIHBhcnNlIHVudGlsIHdlIGhhdmUgYW4gb3V0LW9mLWJhbmRcbiAgLy8gV2F5IG9mIGRldGVybWluaW5nIGlmIGEgZmllbGQgaXMgbnVsbGFibGUuIFVuZGVmaW5lZCBkb2Vzbid0IGNvdW50IGFnYWluc3QgdW5pcXVlbmVzcyxcbiAgLy8gd2hpY2ggaXMgd2h5IHdlIHVzZSBzcGFyc2UgaW5kZXhlcy5cbiAgZW5zdXJlVW5pcXVlbmVzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBmaWVsZE5hbWVzOiBzdHJpbmdbXSkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpbmRleENyZWF0aW9uUmVxdWVzdCA9IHt9O1xuICAgIGNvbnN0IG1vbmdvRmllbGROYW1lcyA9IGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHNjaGVtYSkpO1xuICAgIG1vbmdvRmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpbmRleENyZWF0aW9uUmVxdWVzdFtmaWVsZE5hbWVdID0gMTtcbiAgICB9KTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fZW5zdXJlU3BhcnNlVW5pcXVlSW5kZXhJbkJhY2tncm91bmQoaW5kZXhDcmVhdGlvblJlcXVlc3QpKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ1RyaWVkIHRvIGVuc3VyZSBmaWVsZCB1bmlxdWVuZXNzIGZvciBhIGNsYXNzIHRoYXQgYWxyZWFkeSBoYXMgZHVwbGljYXRlcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBVc2VkIGluIHRlc3RzXG4gIF9yYXdGaW5kKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogUXVlcnlUeXBlKSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZmluZChxdWVyeSwge1xuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gRXhlY3V0ZXMgYSBjb3VudC5cbiAgY291bnQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgcmVhZFByZWZlcmVuY2U6ID9zdHJpbmcsXG4gICAgX2VzdGltYXRlOiA/Ym9vbGVhbixcbiAgICBoaW50OiA/bWl4ZWQsXG4gICAgY29tbWVudDogP3N0cmluZ1xuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgcmVhZFByZWZlcmVuY2UgPSB0aGlzLl9wYXJzZVJlYWRQcmVmZXJlbmNlKHJlYWRQcmVmZXJlbmNlKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5jb3VudCh0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEsIHRydWUpLCB7XG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgaGludCxcbiAgICAgICAgICBjb21tZW50LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZGlzdGluY3QoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgcXVlcnk6IFF1ZXJ5VHlwZSwgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgaXNQb2ludGVyRmllbGQgPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJztcbiAgICBjb25zdCB0cmFuc2Zvcm1GaWVsZCA9IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKTtcblxuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmRpc3RpbmN0KHRyYW5zZm9ybUZpZWxkLCB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpKVxuICAgICAgKVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiB7XG4gICAgICAgIG9iamVjdHMgPSBvYmplY3RzLmZpbHRlcihvYmogPT4gb2JqICE9IG51bGwpO1xuICAgICAgICByZXR1cm4gb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICBpZiAoaXNQb2ludGVyRmllbGQpIHtcbiAgICAgICAgICAgIHJldHVybiB0cmFuc2Zvcm1Qb2ludGVyU3RyaW5nKHNjaGVtYSwgZmllbGROYW1lLCBvYmplY3QpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBhZ2dyZWdhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBhbnksXG4gICAgcGlwZWxpbmU6IGFueSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBoaW50OiA/bWl4ZWQsXG4gICAgZXhwbGFpbj86IGJvb2xlYW4sXG4gICAgY29tbWVudDogP3N0cmluZ1xuICApIHtcbiAgICB2YWxpZGF0ZUV4cGxhaW5WYWx1ZShleHBsYWluKTtcbiAgICBsZXQgaXNQb2ludGVyRmllbGQgPSBmYWxzZTtcbiAgICBwaXBlbGluZSA9IHBpcGVsaW5lLm1hcChzdGFnZSA9PiB7XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIHN0YWdlLiRncm91cCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYSwgc3RhZ2UuJGdyb3VwKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHN0YWdlLiRncm91cC5faWQgJiZcbiAgICAgICAgICB0eXBlb2Ygc3RhZ2UuJGdyb3VwLl9pZCA9PT0gJ3N0cmluZycgJiZcbiAgICAgICAgICBzdGFnZS4kZ3JvdXAuX2lkLmluZGV4T2YoJyRfcF8nKSA+PSAwXG4gICAgICAgICkge1xuICAgICAgICAgIGlzUG9pbnRlckZpZWxkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRtYXRjaCkge1xuICAgICAgICBzdGFnZS4kbWF0Y2ggPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBzdGFnZS4kbWF0Y2gpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgIHN0YWdlLiRwcm9qZWN0ID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyhzY2hlbWEsIHN0YWdlLiRwcm9qZWN0KTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kZ2VvTmVhciAmJiBzdGFnZS4kZ2VvTmVhci5xdWVyeSkge1xuICAgICAgICBzdGFnZS4kZ2VvTmVhci5xdWVyeSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdGFnZTtcbiAgICB9KTtcbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmFnZ3JlZ2F0ZShwaXBlbGluZSwge1xuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgICBjb21tZW50LFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocmVzdWx0LCAnX2lkJykpIHtcbiAgICAgICAgICAgIGlmIChpc1BvaW50ZXJGaWVsZCAmJiByZXN1bHQuX2lkKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPSByZXN1bHQuX2lkLnNwbGl0KCckJylbMV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIHJlc3VsdC5faWQgPT0gbnVsbCB8fFxuICAgICAgICAgICAgICByZXN1bHQuX2lkID09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgICAgICAoWydvYmplY3QnLCAnc3RyaW5nJ10uaW5jbHVkZXModHlwZW9mIHJlc3VsdC5faWQpICYmIF8uaXNFbXB0eShyZXN1bHQuX2lkKSlcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICByZXN1bHQuX2lkID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IHJlc3VsdC5faWQ7XG4gICAgICAgICAgICBkZWxldGUgcmVzdWx0Ll9pZDtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgIH0pXG4gICAgICAudGhlbihvYmplY3RzID0+IG9iamVjdHMubWFwKG9iamVjdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiB3aWxsIHJlY3Vyc2l2ZWx5IHRyYXZlcnNlIHRoZSBwaXBlbGluZSBhbmQgY29udmVydCBhbnkgUG9pbnRlciBvciBEYXRlIGNvbHVtbnMuXG4gIC8vIElmIHdlIGRldGVjdCBhIHBvaW50ZXIgY29sdW1uIHdlIHdpbGwgcmVuYW1lIHRoZSBjb2x1bW4gYmVpbmcgcXVlcmllZCBmb3IgdG8gbWF0Y2ggdGhlIGNvbHVtblxuICAvLyBpbiB0aGUgZGF0YWJhc2UuIFdlIGFsc28gbW9kaWZ5IHRoZSB2YWx1ZSB0byB3aGF0IHdlIGV4cGVjdCB0aGUgdmFsdWUgdG8gYmUgaW4gdGhlIGRhdGFiYXNlXG4gIC8vIGFzIHdlbGwuXG4gIC8vIEZvciBkYXRlcywgdGhlIGRyaXZlciBleHBlY3RzIGEgRGF0ZSBvYmplY3QsIGJ1dCB3ZSBoYXZlIGEgc3RyaW5nIGNvbWluZyBpbi4gU28gd2UnbGwgY29udmVydFxuICAvLyB0aGUgc3RyaW5nIHRvIGEgRGF0ZSBzbyB0aGUgZHJpdmVyIGNhbiBwZXJmb3JtIHRoZSBuZWNlc3NhcnkgY29tcGFyaXNvbi5cbiAgLy9cbiAgLy8gVGhlIGdvYWwgb2YgdGhpcyBtZXRob2QgaXMgdG8gbG9vayBmb3IgdGhlIFwibGVhdmVzXCIgb2YgdGhlIHBpcGVsaW5lIGFuZCBkZXRlcm1pbmUgaWYgaXQgbmVlZHNcbiAgLy8gdG8gYmUgY29udmVydGVkLiBUaGUgcGlwZWxpbmUgY2FuIGhhdmUgYSBmZXcgZGlmZmVyZW50IGZvcm1zLiBGb3IgbW9yZSBkZXRhaWxzLCBzZWU6XG4gIC8vICAgICBodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL3JlZmVyZW5jZS9vcGVyYXRvci9hZ2dyZWdhdGlvbi9cbiAgLy9cbiAgLy8gSWYgdGhlIHBpcGVsaW5lIGlzIGFuIGFycmF5LCBpdCBtZWFucyB3ZSBhcmUgcHJvYmFibHkgcGFyc2luZyBhbiAnJGFuZCcgb3IgJyRvcicgb3BlcmF0b3IuIEluXG4gIC8vIHRoYXQgY2FzZSB3ZSBuZWVkIHRvIGxvb3AgdGhyb3VnaCBhbGwgb2YgaXQncyBjaGlsZHJlbiB0byBmaW5kIHRoZSBjb2x1bW5zIGJlaW5nIG9wZXJhdGVkIG9uLlxuICAvLyBJZiB0aGUgcGlwZWxpbmUgaXMgYW4gb2JqZWN0LCB0aGVuIHdlJ2xsIGxvb3AgdGhyb3VnaCB0aGUga2V5cyBjaGVja2luZyB0byBzZWUgaWYgdGhlIGtleSBuYW1lXG4gIC8vIG1hdGNoZXMgb25lIG9mIHRoZSBzY2hlbWEgY29sdW1ucy4gSWYgaXQgZG9lcyBtYXRjaCBhIGNvbHVtbiBhbmQgdGhlIGNvbHVtbiBpcyBhIFBvaW50ZXIgb3JcbiAgLy8gYSBEYXRlLCB0aGVuIHdlJ2xsIGNvbnZlcnQgdGhlIHZhbHVlIGFzIGRlc2NyaWJlZCBhYm92ZS5cbiAgLy9cbiAgLy8gQXMgbXVjaCBhcyBJIGhhdGUgcmVjdXJzaW9uLi4udGhpcyBzZWVtZWQgbGlrZSBhIGdvb2QgZml0IGZvciBpdC4gV2UncmUgZXNzZW50aWFsbHkgdHJhdmVyc2luZ1xuICAvLyBkb3duIGEgdHJlZSB0byBmaW5kIGEgXCJsZWFmIG5vZGVcIiBhbmQgY2hlY2tpbmcgdG8gc2VlIGlmIGl0IG5lZWRzIHRvIGJlIGNvbnZlcnRlZC5cbiAgX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSk6IGFueSB7XG4gICAgaWYgKHBpcGVsaW5lID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkocGlwZWxpbmUpKSB7XG4gICAgICByZXR1cm4gcGlwZWxpbmUubWFwKHZhbHVlID0+IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHZhbHVlKSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGlwZWxpbmUgPT09ICdvYmplY3QnKSB7XG4gICAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBwaXBlbGluZSkge1xuICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBwaXBlbGluZVtmaWVsZF0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAvLyBQYXNzIG9iamVjdHMgZG93biB0byBNb25nb0RCLi4udGhpcyBpcyBtb3JlIHRoYW4gbGlrZWx5IGFuICRleGlzdHMgb3BlcmF0b3IuXG4gICAgICAgICAgICByZXR1cm5WYWx1ZVtgX3BfJHtmaWVsZH1gXSA9IHBpcGVsaW5lW2ZpZWxkXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuVmFsdWVbYF9wXyR7ZmllbGR9YF0gPSBgJHtzY2hlbWEuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzc30kJHtwaXBlbGluZVtmaWVsZF19YDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ0RhdGUnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fY29udmVydFRvRGF0ZShwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZmllbGQgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVsnX2lkJ10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ2NyZWF0ZWRBdCcpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVsnX2NyZWF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICAgIHJldHVyblZhbHVlWydfdXBkYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHBpcGVsaW5lO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBzbGlnaHRseSBkaWZmZXJlbnQgdGhhbiB0aGUgb25lIGFib3ZlLiBSYXRoZXIgdGhhbiB0cnlpbmcgdG8gY29tYmluZSB0aGVzZVxuICAvLyB0d28gZnVuY3Rpb25zIGFuZCBtYWtpbmcgdGhlIGNvZGUgZXZlbiBoYXJkZXIgdG8gdW5kZXJzdGFuZCwgSSBkZWNpZGVkIHRvIHNwbGl0IGl0IHVwLiBUaGVcbiAgLy8gZGlmZmVyZW5jZSB3aXRoIHRoaXMgZnVuY3Rpb24gaXMgd2UgYXJlIG5vdCB0cmFuc2Zvcm1pbmcgdGhlIHZhbHVlcywgb25seSB0aGUga2V5cyBvZiB0aGVcbiAgLy8gcGlwZWxpbmUuXG4gIF9wYXJzZUFnZ3JlZ2F0ZVByb2plY3RBcmdzKHNjaGVtYTogYW55LCBwaXBlbGluZTogYW55KTogYW55IHtcbiAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgIGZvciAoY29uc3QgZmllbGQgaW4gcGlwZWxpbmUpIHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbYF9wXyR7ZmllbGR9YF0gPSBwaXBlbGluZVtmaWVsZF07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoZmllbGQgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbJ19pZCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ2NyZWF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbJ19jcmVhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09PSAndXBkYXRlZEF0Jykge1xuICAgICAgICByZXR1cm5WYWx1ZVsnX3VwZGF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBzbGlnaHRseSBkaWZmZXJlbnQgdGhhbiB0aGUgdHdvIGFib3ZlLiBNb25nb0RCICRncm91cCBhZ2dyZWdhdGUgbG9va3MgbGlrZTpcbiAgLy8gICAgIHsgJGdyb3VwOiB7IF9pZDogPGV4cHJlc3Npb24+LCA8ZmllbGQxPjogeyA8YWNjdW11bGF0b3IxPiA6IDxleHByZXNzaW9uMT4gfSwgLi4uIH0gfVxuICAvLyBUaGUgPGV4cHJlc3Npb24+IGNvdWxkIGJlIGEgY29sdW1uIG5hbWUsIHByZWZpeGVkIHdpdGggdGhlICckJyBjaGFyYWN0ZXIuIFdlJ2xsIGxvb2sgZm9yXG4gIC8vIHRoZXNlIDxleHByZXNzaW9uPiBhbmQgY2hlY2sgdG8gc2VlIGlmIGl0IGlzIGEgJ1BvaW50ZXInIG9yIGlmIGl0J3Mgb25lIG9mIGNyZWF0ZWRBdCxcbiAgLy8gdXBkYXRlZEF0IG9yIG9iamVjdElkIGFuZCBjaGFuZ2UgaXQgYWNjb3JkaW5nbHkuXG4gIF9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSk6IGFueSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocGlwZWxpbmUpKSB7XG4gICAgICByZXR1cm4gcGlwZWxpbmUubWFwKHZhbHVlID0+IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYSwgdmFsdWUpKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGNvbnN0IHJldHVyblZhbHVlID0ge307XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYSwgcGlwZWxpbmVbZmllbGRdKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBwaXBlbGluZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGNvbnN0IGZpZWxkID0gcGlwZWxpbmUuc3Vic3RyaW5nKDEpO1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYCRfcF8ke2ZpZWxkfWA7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgIHJldHVybiAnJF9jcmVhdGVkX2F0JztcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuICckX3VwZGF0ZWRfYXQnO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcGlwZWxpbmU7XG4gIH1cblxuICAvLyBUaGlzIGZ1bmN0aW9uIHdpbGwgYXR0ZW1wdCB0byBjb252ZXJ0IHRoZSBwcm92aWRlZCB2YWx1ZSB0byBhIERhdGUgb2JqZWN0LiBTaW5jZSB0aGlzIGlzIHBhcnRcbiAgLy8gb2YgYW4gYWdncmVnYXRpb24gcGlwZWxpbmUsIHRoZSB2YWx1ZSBjYW4gZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGl0IGNhbiBiZSBhbm90aGVyIG9iamVjdCB3aXRoXG4gIC8vIGFuIG9wZXJhdG9yIGluIGl0IChsaWtlICRndCwgJGx0LCBldGMpLiBCZWNhdXNlIG9mIHRoaXMgSSBmZWx0IGl0IHdhcyBlYXNpZXIgdG8gbWFrZSB0aGlzIGFcbiAgLy8gcmVjdXJzaXZlIG1ldGhvZCB0byB0cmF2ZXJzZSBkb3duIHRvIHRoZSBcImxlYWYgbm9kZVwiIHdoaWNoIGlzIGdvaW5nIHRvIGJlIHRoZSBzdHJpbmcuXG4gIF9jb252ZXJ0VG9EYXRlKHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgfVxuXG4gICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHZhbHVlKSB7XG4gICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9jb252ZXJ0VG9EYXRlKHZhbHVlW2ZpZWxkXSk7XG4gICAgfVxuICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgfVxuXG4gIF9wYXJzZVJlYWRQcmVmZXJlbmNlKHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nKTogP3N0cmluZyB7XG4gICAgaWYgKHJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICByZWFkUHJlZmVyZW5jZSA9IHJlYWRQcmVmZXJlbmNlLnRvVXBwZXJDYXNlKCk7XG4gICAgfVxuICAgIHN3aXRjaCAocmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIGNhc2UgJ1BSSU1BUlknOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLlBSSU1BUlk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnUFJJTUFSWV9QUkVGRVJSRUQnOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLlBSSU1BUllfUFJFRkVSUkVEO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1NFQ09OREFSWSc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuU0VDT05EQVJZO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1NFQ09OREFSWV9QUkVGRVJSRUQnOlxuICAgICAgICByZWFkUHJlZmVyZW5jZSA9IFJlYWRQcmVmZXJlbmNlLlNFQ09OREFSWV9QUkVGRVJSRUQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnTkVBUkVTVCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuTkVBUkVTVDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIHVuZGVmaW5lZDpcbiAgICAgIGNhc2UgbnVsbDpcbiAgICAgIGNhc2UgJyc6XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdOb3Qgc3VwcG9ydGVkIHJlYWQgcHJlZmVyZW5jZS4nKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgcGVyZm9ybUluaXRpYWxpemF0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4KGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleDogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5jcmVhdGVJbmRleChpbmRleCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBjcmVhdGVJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4ZXMoaW5kZXhlcykpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBjcmVhdGVJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nLCB0eXBlOiBhbnkpIHtcbiAgICBpZiAodHlwZSAmJiB0eXBlLnR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgY29uc3QgaW5kZXggPSB7XG4gICAgICAgIFtmaWVsZE5hbWVdOiAnMmRzcGhlcmUnLFxuICAgICAgfTtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZUluZGV4KGNsYXNzTmFtZSwgaW5kZXgpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogUXVlcnlUeXBlLCBzY2hlbWE6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgICBpZiAoIXF1ZXJ5W2ZpZWxkTmFtZV0gfHwgIXF1ZXJ5W2ZpZWxkTmFtZV0uJHRleHQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBleGlzdGluZ0luZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgIGZvciAoY29uc3Qga2V5IGluIGV4aXN0aW5nSW5kZXhlcykge1xuICAgICAgICBjb25zdCBpbmRleCA9IGV4aXN0aW5nSW5kZXhlc1trZXldO1xuICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGluZGV4LCBmaWVsZE5hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjb25zdCBpbmRleE5hbWUgPSBgJHtmaWVsZE5hbWV9X3RleHRgO1xuICAgICAgY29uc3QgdGV4dEluZGV4ID0ge1xuICAgICAgICBbaW5kZXhOYW1lXTogeyBbZmllbGROYW1lXTogJ3RleHQnIH0sXG4gICAgICB9O1xuICAgICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgdGV4dEluZGV4LFxuICAgICAgICBleGlzdGluZ0luZGV4ZXMsXG4gICAgICAgIHNjaGVtYS5maWVsZHNcbiAgICAgICkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gODUpIHtcbiAgICAgICAgICAvLyBJbmRleCBleGlzdCB3aXRoIGRpZmZlcmVudCBvcHRpb25zXG4gICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc0Zyb21Nb25nbyhjbGFzc05hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGdldEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmluZGV4ZXMoKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGRyb3BJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXg6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uZHJvcEluZGV4KGluZGV4KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGRyb3BBbGxJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5kcm9wSW5kZXhlcygpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgdXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gdGhpcy5nZXRBbGxDbGFzc2VzKClcbiAgICAgIC50aGVuKGNsYXNzZXMgPT4ge1xuICAgICAgICBjb25zdCBwcm9taXNlcyA9IGNsYXNzZXMubWFwKHNjaGVtYSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuc2V0SW5kZXhlc0Zyb21Nb25nbyhzY2hlbWEuY2xhc3NOYW1lKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24oKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCB0cmFuc2FjdGlvbmFsU2VjdGlvbiA9IHRoaXMuY2xpZW50LnN0YXJ0U2Vzc2lvbigpO1xuICAgIHRyYW5zYWN0aW9uYWxTZWN0aW9uLnN0YXJ0VHJhbnNhY3Rpb24oKTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZWN0aW9uKTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZWN0aW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjb21taXQgPSByZXRyaWVzID0+IHtcbiAgICAgIHJldHVybiB0cmFuc2FjdGlvbmFsU2VjdGlvblxuICAgICAgICAuY29tbWl0VHJhbnNhY3Rpb24oKVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5oYXNFcnJvckxhYmVsKCdUcmFuc2llbnRUcmFuc2FjdGlvbkVycm9yJykgJiYgcmV0cmllcyA+IDApIHtcbiAgICAgICAgICAgIHJldHVybiBjb21taXQocmV0cmllcyAtIDEpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHRyYW5zYWN0aW9uYWxTZWN0aW9uLmVuZFNlc3Npb24oKTtcbiAgICAgICAgfSk7XG4gICAgfTtcbiAgICByZXR1cm4gY29tbWl0KDUpO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2VjdGlvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZWN0aW9uLmFib3J0VHJhbnNhY3Rpb24oKS50aGVuKCgpID0+IHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZWN0aW9uLmVuZFNlc3Npb24oKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBNb25nb1N0b3JhZ2VBZGFwdGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSxJQUFBQSxnQkFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsc0JBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLGVBQUEsR0FBQUYsT0FBQTtBQUVBLElBQUFHLFdBQUEsR0FBQUgsT0FBQTtBQUNBLElBQUFJLGVBQUEsR0FBQUosT0FBQTtBQVNBLElBQUFLLEtBQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUVBLElBQUFNLE9BQUEsR0FBQVAsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFPLFNBQUEsR0FBQVIsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFRLE9BQUEsR0FBQVQsc0JBQUEsQ0FBQUMsT0FBQTtBQUFxQyxTQUFBRCx1QkFBQVUsQ0FBQSxXQUFBQSxDQUFBLElBQUFBLENBQUEsQ0FBQUMsVUFBQSxHQUFBRCxDQUFBLEtBQUFFLE9BQUEsRUFBQUYsQ0FBQTtBQUxyQztBQUVBO0FBS0E7QUFDQSxNQUFNRyxPQUFP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