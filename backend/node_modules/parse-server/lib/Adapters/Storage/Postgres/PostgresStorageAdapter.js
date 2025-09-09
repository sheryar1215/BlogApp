"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PostgresStorageAdapter = void 0;
var _PostgresClient = require("./PostgresClient");
var _node = _interopRequireDefault(require("parse/node"));
var _lodash = _interopRequireDefault(require("lodash"));
var _uuid = require("uuid");
var _sql = _interopRequireDefault(require("./sql"));
var _StorageAdapter = require("../StorageAdapter");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// -disable-next
// -disable-next
// -disable-next
const Utils = require('../../../Utils');
const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';
const PostgresDuplicateColumnError = '42701';
const PostgresMissingColumnError = '42703';
const PostgresUniqueIndexViolationError = '23505';
const logger = require('../../../logger');
const debug = function (...args) {
  args = ['PG: ' + arguments[0]].concat(args.slice(1, args.length));
  const log = logger.getLogger();
  log.debug.apply(log, args);
};
const parseTypeToPostgresType = type => {
  switch (type.type) {
    case 'String':
      return 'text';
    case 'Date':
      return 'timestamp with time zone';
    case 'Object':
      return 'jsonb';
    case 'File':
      return 'text';
    case 'Boolean':
      return 'boolean';
    case 'Pointer':
      return 'text';
    case 'Number':
      return 'double precision';
    case 'GeoPoint':
      return 'point';
    case 'Bytes':
      return 'jsonb';
    case 'Polygon':
      return 'polygon';
    case 'Array':
      if (type.contents && type.contents.type === 'String') {
        return 'text[]';
      } else {
        return 'jsonb';
      }
    default:
      throw `no type for ${JSON.stringify(type)} yet`;
  }
};
const ParseToPosgresComparator = {
  $gt: '>',
  $lt: '<',
  $gte: '>=',
  $lte: '<='
};
const mongoAggregateToPostgres = {
  $dayOfMonth: 'DAY',
  $dayOfWeek: 'DOW',
  $dayOfYear: 'DOY',
  $isoDayOfWeek: 'ISODOW',
  $isoWeekYear: 'ISOYEAR',
  $hour: 'HOUR',
  $minute: 'MINUTE',
  $second: 'SECOND',
  $millisecond: 'MILLISECONDS',
  $month: 'MONTH',
  $week: 'WEEK',
  $year: 'YEAR'
};
const toPostgresValue = value => {
  if (typeof value === 'object') {
    if (value.__type === 'Date') {
      return value.iso;
    }
    if (value.__type === 'File') {
      return value.name;
    }
  }
  return value;
};
const toPostgresValueCastType = value => {
  const postgresValue = toPostgresValue(value);
  let castType;
  switch (typeof postgresValue) {
    case 'number':
      castType = 'double precision';
      break;
    case 'boolean':
      castType = 'boolean';
      break;
    default:
      castType = undefined;
  }
  return castType;
};
const transformValue = value => {
  if (typeof value === 'object' && value.__type === 'Pointer') {
    return value.objectId;
  }
  return value;
};

// Duplicate from then mongo adapter...
const emptyCLPS = Object.freeze({
  find: {},
  get: {},
  count: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
  protectedFields: {}
});
const defaultCLPS = Object.freeze({
  ACL: {
    '*': {
      read: true,
      write: true
    }
  },
  find: {
    '*': true
  },
  get: {
    '*': true
  },
  count: {
    '*': true
  },
  create: {
    '*': true
  },
  update: {
    '*': true
  },
  delete: {
    '*': true
  },
  addField: {
    '*': true
  },
  protectedFields: {
    '*': []
  }
});
const toParseSchema = schema => {
  if (schema.className === '_User') {
    delete schema.fields._hashed_password;
  }
  if (schema.fields) {
    delete schema.fields._wperm;
    delete schema.fields._rperm;
  }
  let clps = defaultCLPS;
  if (schema.classLevelPermissions) {
    clps = {
      ...emptyCLPS,
      ...schema.classLevelPermissions
    };
  }
  let indexes = {};
  if (schema.indexes) {
    indexes = {
      ...schema.indexes
    };
  }
  return {
    className: schema.className,
    fields: schema.fields,
    classLevelPermissions: clps,
    indexes
  };
};
const toPostgresSchema = schema => {
  if (!schema) {
    return schema;
  }
  schema.fields = schema.fields || {};
  schema.fields._wperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };
  schema.fields._rperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };
  if (schema.className === '_User') {
    schema.fields._hashed_password = {
      type: 'String'
    };
    schema.fields._password_history = {
      type: 'Array'
    };
  }
  return schema;
};
const isArrayIndex = arrayIndex => Array.from(arrayIndex).every(c => c >= '0' && c <= '9');
const handleDotFields = object => {
  Object.keys(object).forEach(fieldName => {
    if (fieldName.indexOf('.') > -1) {
      const components = fieldName.split('.');
      const first = components.shift();
      object[first] = object[first] || {};
      let currentObj = object[first];
      let next;
      let value = object[fieldName];
      if (value && value.__op === 'Delete') {
        value = undefined;
      }
      while (next = components.shift()) {
        currentObj[next] = currentObj[next] || {};
        if (components.length === 0) {
          currentObj[next] = value;
        }
        currentObj = currentObj[next];
      }
      delete object[fieldName];
    }
  });
  return object;
};
const transformDotFieldToComponents = fieldName => {
  return fieldName.split('.').map((cmpt, index) => {
    if (index === 0) {
      return `"${cmpt}"`;
    }
    if (isArrayIndex(cmpt)) {
      return Number(cmpt);
    } else {
      return `'${cmpt}'`;
    }
  });
};
const transformDotField = fieldName => {
  if (fieldName.indexOf('.') === -1) {
    return `"${fieldName}"`;
  }
  const components = transformDotFieldToComponents(fieldName);
  let name = components.slice(0, components.length - 1).join('->');
  name += '->>' + components[components.length - 1];
  return name;
};
const transformAggregateField = fieldName => {
  if (typeof fieldName !== 'string') {
    return fieldName;
  }
  if (fieldName === '$_created_at') {
    return 'createdAt';
  }
  if (fieldName === '$_updated_at') {
    return 'updatedAt';
  }
  return fieldName.substring(1);
};
const validateKeys = object => {
  if (typeof object == 'object') {
    for (const key in object) {
      if (typeof object[key] == 'object') {
        validateKeys(object[key]);
      }
      if (key.includes('$') || key.includes('.')) {
        throw new _node.default.Error(_node.default.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
      }
    }
  }
};

// Returns the list of join tables on a schema
const joinTablesForSchema = schema => {
  const list = [];
  if (schema) {
    Object.keys(schema.fields).forEach(field => {
      if (schema.fields[field].type === 'Relation') {
        list.push(`_Join:${field}:${schema.className}`);
      }
    });
  }
  return list;
};
const buildWhereClause = ({
  schema,
  query,
  index,
  caseInsensitive
}) => {
  const patterns = [];
  let values = [];
  const sorts = [];
  schema = toPostgresSchema(schema);
  for (const fieldName in query) {
    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const initialPatternsLength = patterns.length;
    const fieldValue = query[fieldName];

    // nothing in the schema, it's gonna blow up
    if (!schema.fields[fieldName]) {
      // as it won't exist
      if (fieldValue && fieldValue.$exists === false) {
        continue;
      }
    }
    const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
    if (authDataMatch) {
      // TODO: Handle querying by _auth_data_provider, authData is stored in authData field
      continue;
    } else if (caseInsensitive && (fieldName === 'username' || fieldName === 'email')) {
      patterns.push(`LOWER($${index}:name) = LOWER($${index + 1})`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (fieldName.indexOf('.') >= 0) {
      let name = transformDotField(fieldName);
      if (fieldValue === null) {
        patterns.push(`$${index}:raw IS NULL`);
        values.push(name);
        index += 1;
        continue;
      } else {
        if (fieldValue.$in) {
          name = transformDotFieldToComponents(fieldName).join('->');
          patterns.push(`($${index}:raw)::jsonb @> $${index + 1}::jsonb`);
          values.push(name, JSON.stringify(fieldValue.$in));
          index += 2;
        } else if (fieldValue.$regex) {
          // Handle later
        } else if (typeof fieldValue !== 'object') {
          patterns.push(`$${index}:raw = $${index + 1}::text`);
          values.push(name, fieldValue);
          index += 2;
        }
      }
    } else if (fieldValue === null || fieldValue === undefined) {
      patterns.push(`$${index}:name IS NULL`);
      values.push(fieldName);
      index += 1;
      continue;
    } else if (typeof fieldValue === 'string') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (typeof fieldValue === 'boolean') {
      patterns.push(`$${index}:name = $${index + 1}`);
      // Can't cast boolean to double precision
      if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Number') {
        // Should always return zero results
        const MAX_INT_PLUS_ONE = 9223372036854775808;
        values.push(fieldName, MAX_INT_PLUS_ONE);
      } else {
        values.push(fieldName, fieldValue);
      }
      index += 2;
    } else if (typeof fieldValue === 'number') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (['$or', '$nor', '$and'].includes(fieldName)) {
      const clauses = [];
      const clauseValues = [];
      fieldValue.forEach(subQuery => {
        const clause = buildWhereClause({
          schema,
          query: subQuery,
          index,
          caseInsensitive
        });
        if (clause.pattern.length > 0) {
          clauses.push(clause.pattern);
          clauseValues.push(...clause.values);
          index += clause.values.length;
        }
      });
      const orOrAnd = fieldName === '$and' ? ' AND ' : ' OR ';
      const not = fieldName === '$nor' ? ' NOT ' : '';
      patterns.push(`${not}(${clauses.join(orOrAnd)})`);
      values.push(...clauseValues);
    }
    if (fieldValue.$ne !== undefined) {
      if (isArrayField) {
        fieldValue.$ne = JSON.stringify([fieldValue.$ne]);
        patterns.push(`NOT array_contains($${index}:name, $${index + 1})`);
      } else {
        if (fieldValue.$ne === null) {
          patterns.push(`$${index}:name IS NOT NULL`);
          values.push(fieldName);
          index += 1;
          continue;
        } else {
          // if not null, we need to manually exclude null
          if (fieldValue.$ne.__type === 'GeoPoint') {
            patterns.push(`($${index}:name <> POINT($${index + 1}, $${index + 2}) OR $${index}:name IS NULL)`);
          } else {
            if (fieldName.indexOf('.') >= 0) {
              const castType = toPostgresValueCastType(fieldValue.$ne);
              const constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
              patterns.push(`(${constraintFieldName} <> $${index + 1} OR ${constraintFieldName} IS NULL)`);
            } else if (typeof fieldValue.$ne === 'object' && fieldValue.$ne.$relativeTime) {
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
            } else {
              patterns.push(`($${index}:name <> $${index + 1} OR $${index}:name IS NULL)`);
            }
          }
        }
      }
      if (fieldValue.$ne.__type === 'GeoPoint') {
        const point = fieldValue.$ne;
        values.push(fieldName, point.longitude, point.latitude);
        index += 3;
      } else {
        // TODO: support arrays
        values.push(fieldName, fieldValue.$ne);
        index += 2;
      }
    }
    if (fieldValue.$eq !== undefined) {
      if (fieldValue.$eq === null) {
        patterns.push(`$${index}:name IS NULL`);
        values.push(fieldName);
        index += 1;
      } else {
        if (fieldName.indexOf('.') >= 0) {
          const castType = toPostgresValueCastType(fieldValue.$eq);
          const constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
          values.push(fieldValue.$eq);
          patterns.push(`${constraintFieldName} = $${index++}`);
        } else if (typeof fieldValue.$eq === 'object' && fieldValue.$eq.$relativeTime) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
        } else {
          values.push(fieldName, fieldValue.$eq);
          patterns.push(`$${index}:name = $${index + 1}`);
          index += 2;
        }
      }
    }
    const isInOrNin = Array.isArray(fieldValue.$in) || Array.isArray(fieldValue.$nin);
    if (Array.isArray(fieldValue.$in) && isArrayField && schema.fields[fieldName].contents && schema.fields[fieldName].contents.type === 'String') {
      const inPatterns = [];
      let allowNull = false;
      values.push(fieldName);
      fieldValue.$in.forEach((listElem, listIndex) => {
        if (listElem === null) {
          allowNull = true;
        } else {
          values.push(listElem);
          inPatterns.push(`$${index + 1 + listIndex - (allowNull ? 1 : 0)}`);
        }
      });
      if (allowNull) {
        patterns.push(`($${index}:name IS NULL OR $${index}:name && ARRAY[${inPatterns.join()}])`);
      } else {
        patterns.push(`$${index}:name && ARRAY[${inPatterns.join()}]`);
      }
      index = index + 1 + inPatterns.length;
    } else if (isInOrNin) {
      var createConstraint = (baseArray, notIn) => {
        const not = notIn ? ' NOT ' : '';
        if (baseArray.length > 0) {
          if (isArrayField) {
            patterns.push(`${not} array_contains($${index}:name, $${index + 1})`);
            values.push(fieldName, JSON.stringify(baseArray));
            index += 2;
          } else {
            // Handle Nested Dot Notation Above
            if (fieldName.indexOf('.') >= 0) {
              return;
            }
            const inPatterns = [];
            values.push(fieldName);
            baseArray.forEach((listElem, listIndex) => {
              if (listElem != null) {
                values.push(listElem);
                inPatterns.push(`$${index + 1 + listIndex}`);
              }
            });
            patterns.push(`$${index}:name ${not} IN (${inPatterns.join()})`);
            index = index + 1 + inPatterns.length;
          }
        } else if (!notIn) {
          values.push(fieldName);
          patterns.push(`$${index}:name IS NULL`);
          index = index + 1;
        } else {
          // Handle empty array
          if (notIn) {
            patterns.push('1 = 1'); // Return all values
          } else {
            patterns.push('1 = 2'); // Return no values
          }
        }
      };
      if (fieldValue.$in) {
        createConstraint(_lodash.default.flatMap(fieldValue.$in, elt => elt), false);
      }
      if (fieldValue.$nin) {
        createConstraint(_lodash.default.flatMap(fieldValue.$nin, elt => elt), true);
      }
    } else if (typeof fieldValue.$in !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $in value');
    } else if (typeof fieldValue.$nin !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $nin value');
    }
    if (Array.isArray(fieldValue.$all) && isArrayField) {
      if (isAnyValueRegexStartsWith(fieldValue.$all)) {
        if (!isAllValuesRegexOrNone(fieldValue.$all)) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'All $all values must be of regex type or none: ' + fieldValue.$all);
        }
        for (let i = 0; i < fieldValue.$all.length; i += 1) {
          const value = processRegexPattern(fieldValue.$all[i].$regex);
          fieldValue.$all[i] = value.substring(1) + '%';
        }
        patterns.push(`array_contains_all_regex($${index}:name, $${index + 1}::jsonb)`);
      } else {
        patterns.push(`array_contains_all($${index}:name, $${index + 1}::jsonb)`);
      }
      values.push(fieldName, JSON.stringify(fieldValue.$all));
      index += 2;
    } else if (Array.isArray(fieldValue.$all)) {
      if (fieldValue.$all.length === 1) {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.$all[0].objectId);
        index += 2;
      }
    }
    if (typeof fieldValue.$exists !== 'undefined') {
      if (typeof fieldValue.$exists === 'object' && fieldValue.$exists.$relativeTime) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators');
      } else if (fieldValue.$exists) {
        patterns.push(`$${index}:name IS NOT NULL`);
      } else {
        patterns.push(`$${index}:name IS NULL`);
      }
      values.push(fieldName);
      index += 1;
    }
    if (fieldValue.$containedBy) {
      const arr = fieldValue.$containedBy;
      if (!(arr instanceof Array)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $containedBy: should be an array`);
      }
      patterns.push(`$${index}:name <@ $${index + 1}::jsonb`);
      values.push(fieldName, JSON.stringify(arr));
      index += 2;
    }
    if (fieldValue.$text) {
      const search = fieldValue.$text.$search;
      let language = 'english';
      if (typeof search !== 'object') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $search, should be object`);
      }
      if (!search.$term || typeof search.$term !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $term, should be string`);
      }
      if (search.$language && typeof search.$language !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $language, should be string`);
      } else if (search.$language) {
        language = search.$language;
      }
      if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive, should be boolean`);
      } else if (search.$caseSensitive) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive not supported, please use $regex or create a separate lower case column.`);
      }
      if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive, should be boolean`);
      } else if (search.$diacriticSensitive === false) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive - false not supported, install Postgres Unaccent Extension`);
      }
      patterns.push(`to_tsvector($${index}, $${index + 1}:name) @@ to_tsquery($${index + 2}, $${index + 3})`);
      values.push(language, fieldName, language, search.$term);
      index += 4;
    }
    if (fieldValue.$nearSphere) {
      const point = fieldValue.$nearSphere;
      const distance = fieldValue.$maxDistance;
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      sorts.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) ASC`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }
    if (fieldValue.$within && fieldValue.$within.$box) {
      const box = fieldValue.$within.$box;
      const left = box[0].longitude;
      const bottom = box[0].latitude;
      const right = box[1].longitude;
      const top = box[1].latitude;
      patterns.push(`$${index}:name::point <@ $${index + 1}::box`);
      values.push(fieldName, `((${left}, ${bottom}), (${right}, ${top}))`);
      index += 2;
    }
    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$centerSphere) {
      const centerSphere = fieldValue.$geoWithin.$centerSphere;
      if (!(centerSphere instanceof Array) || centerSphere.length < 2) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere should be an array of Parse.GeoPoint and distance');
      }
      // Get point, convert to geo point if necessary and validate
      let point = centerSphere[0];
      if (point instanceof Array && point.length === 2) {
        point = new _node.default.GeoPoint(point[1], point[0]);
      } else if (!GeoPointCoder.isValidJSON(point)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
      }
      _node.default.GeoPoint._validate(point.latitude, point.longitude);
      // Get distance and validate
      const distance = centerSphere[1];
      if (isNaN(distance) || distance < 0) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere distance invalid');
      }
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_DistanceSphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }
    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$polygon) {
      const polygon = fieldValue.$geoWithin.$polygon;
      let points;
      if (typeof polygon === 'object' && polygon.__type === 'Polygon') {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; Polygon.coordinates should contain at least 3 lon/lat pairs');
        }
        points = polygon.coordinates;
      } else if (polygon instanceof Array) {
        if (polygon.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $polygon should contain at least 3 GeoPoints');
        }
        points = polygon;
      } else {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, "bad $geoWithin value; $polygon should be Polygon object or Array of Parse.GeoPoint's");
      }
      points = points.map(point => {
        if (point instanceof Array && point.length === 2) {
          _node.default.GeoPoint._validate(point[1], point[0]);
          return `(${point[0]}, ${point[1]})`;
        }
        if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value');
        } else {
          _node.default.GeoPoint._validate(point.latitude, point.longitude);
        }
        return `(${point.longitude}, ${point.latitude})`;
      }).join(', ');
      patterns.push(`$${index}:name::point <@ $${index + 1}::polygon`);
      values.push(fieldName, `(${points})`);
      index += 2;
    }
    if (fieldValue.$geoIntersects && fieldValue.$geoIntersects.$point) {
      const point = fieldValue.$geoIntersects.$point;
      if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoIntersect value; $point should be GeoPoint');
      } else {
        _node.default.GeoPoint._validate(point.latitude, point.longitude);
      }
      patterns.push(`$${index}:name::polygon @> $${index + 1}::point`);
      values.push(fieldName, `(${point.longitude}, ${point.latitude})`);
      index += 2;
    }
    if (fieldValue.$regex) {
      let regex = fieldValue.$regex;
      let operator = '~';
      const opts = fieldValue.$options;
      if (opts) {
        if (opts.indexOf('i') >= 0) {
          operator = '~*';
        }
        if (opts.indexOf('x') >= 0) {
          regex = removeWhiteSpace(regex);
        }
      }
      const name = transformDotField(fieldName);
      regex = processRegexPattern(regex);
      patterns.push(`$${index}:raw ${operator} '$${index + 1}:raw'`);
      values.push(name, regex);
      index += 2;
    }
    if (fieldValue.__type === 'Pointer') {
      if (isArrayField) {
        patterns.push(`array_contains($${index}:name, $${index + 1})`);
        values.push(fieldName, JSON.stringify([fieldValue]));
        index += 2;
      } else {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      }
    }
    if (fieldValue.__type === 'Date') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue.iso);
      index += 2;
    }
    if (fieldValue.__type === 'GeoPoint') {
      patterns.push(`$${index}:name ~= POINT($${index + 1}, $${index + 2})`);
      values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
      index += 3;
    }
    if (fieldValue.__type === 'Polygon') {
      const value = convertPolygonToSQL(fieldValue.coordinates);
      patterns.push(`$${index}:name ~= $${index + 1}::polygon`);
      values.push(fieldName, value);
      index += 2;
    }
    Object.keys(ParseToPosgresComparator).forEach(cmp => {
      if (fieldValue[cmp] || fieldValue[cmp] === 0) {
        const pgComparator = ParseToPosgresComparator[cmp];
        let constraintFieldName;
        let postgresValue = toPostgresValue(fieldValue[cmp]);
        if (fieldName.indexOf('.') >= 0) {
          const castType = toPostgresValueCastType(fieldValue[cmp]);
          constraintFieldName = castType ? `CAST ((${transformDotField(fieldName)}) AS ${castType})` : transformDotField(fieldName);
        } else {
          if (typeof postgresValue === 'object' && postgresValue.$relativeTime) {
            if (schema.fields[fieldName].type !== 'Date') {
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, '$relativeTime can only be used with Date field');
            }
            const parserResult = Utils.relativeTimeToDate(postgresValue.$relativeTime);
            if (parserResult.status === 'success') {
              postgresValue = toPostgresValue(parserResult.result);
            } else {
              // eslint-disable-next-line no-console
              console.error('Error while parsing relative date', parserResult);
              throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $relativeTime (${postgresValue.$relativeTime}) value. ${parserResult.info}`);
            }
          }
          constraintFieldName = `$${index++}:name`;
          values.push(fieldName);
        }
        values.push(postgresValue);
        patterns.push(`${constraintFieldName} ${pgComparator} $${index++}`);
      }
    });
    if (initialPatternsLength === patterns.length) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support this query type yet ${JSON.stringify(fieldValue)}`);
    }
  }
  values = values.map(transformValue);
  return {
    pattern: patterns.join(' AND '),
    values,
    sorts
  };
};
class PostgresStorageAdapter {
  // Private

  constructor({
    uri,
    collectionPrefix = '',
    databaseOptions = {}
  }) {
    const options = {
      ...databaseOptions
    };
    this._collectionPrefix = collectionPrefix;
    this.enableSchemaHooks = !!databaseOptions.enableSchemaHooks;
    this.schemaCacheTtl = databaseOptions.schemaCacheTtl;
    for (const key of ['enableSchemaHooks', 'schemaCacheTtl']) {
      delete options[key];
    }
    const {
      client,
      pgp
    } = (0, _PostgresClient.createClient)(uri, options);
    this._client = client;
    this._onchange = () => {};
    this._pgp = pgp;
    this._uuid = (0, _uuid.v4)();
    this.canSortOnJoinTables = false;
  }
  watch(callback) {
    this._onchange = callback;
  }

  //Note that analyze=true will run the query, executing INSERTS, DELETES, etc.
  createExplainableQuery(query, analyze = false) {
    if (analyze) {
      return 'EXPLAIN (ANALYZE, FORMAT JSON) ' + query;
    } else {
      return 'EXPLAIN (FORMAT JSON) ' + query;
    }
  }
  handleShutdown() {
    if (this._stream) {
      this._stream.done();
      delete this._stream;
    }
    if (!this._client) {
      return;
    }
    this._client.$pool.end();
  }
  async _listenToSchema() {
    if (!this._stream && this.enableSchemaHooks) {
      this._stream = await this._client.connect({
        direct: true
      });
      this._stream.client.on('notification', data => {
        const payload = JSON.parse(data.payload);
        if (payload.senderId !== this._uuid) {
          this._onchange();
        }
      });
      await this._stream.none('LISTEN $1~', 'schema.change');
    }
  }
  _notifySchemaChange() {
    if (this._stream) {
      this._stream.none('NOTIFY $1~, $2', ['schema.change', {
        senderId: this._uuid
      }]).catch(error => {
        // eslint-disable-next-line no-console
        console.log('Failed to Notify:', error); // unlikely to ever happen
      });
    }
  }
  async _ensureSchemaCollectionExists(conn) {
    conn = conn || this._client;
    await conn.none('CREATE TABLE IF NOT EXISTS "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )').catch(error => {
      throw error;
    });
  }
  async classExists(name) {
    return this._client.one('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)', [name], a => a.exists);
  }
  async setClassLevelPermissions(className, CLPs) {
    await this._client.task('set-class-level-permissions', async t => {
      const values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)];
      await t.none(`UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1`, values);
    });
    this._notifySchemaChange();
  }
  async setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields, conn) {
    conn = conn || this._client;
    const self = this;
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
    const deletedIndexes = [];
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
        deletedIndexes.push(name);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!Object.prototype.hasOwnProperty.call(fields, key)) {
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
    await conn.tx('set-indexes-with-schema-format', async t => {
      if (insertedIndexes.length > 0) {
        await self.createIndexes(className, insertedIndexes, t);
      }
      if (deletedIndexes.length > 0) {
        await self.dropIndexes(className, deletedIndexes, t);
      }
      await t.none('UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className" = $1', [className, 'schema', 'indexes', JSON.stringify(existingIndexes)]);
    });
    this._notifySchemaChange();
  }
  async createClass(className, schema, conn) {
    conn = conn || this._client;
    const parseSchema = await conn.tx('create-class', async t => {
      await this.createTable(className, schema, t);
      await t.none('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', {
        className,
        schema
      });
      await this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields, t);
      return toParseSchema(schema);
    }).catch(err => {
      if (err.code === PostgresUniqueIndexViolationError && err.detail.includes(className)) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, `Class ${className} already exists.`);
      }
      throw err;
    });
    this._notifySchemaChange();
    return parseSchema;
  }

  // Just create a table, do not insert in schema
  async createTable(className, schema, conn) {
    conn = conn || this._client;
    debug('createTable');
    const valuesArray = [];
    const patternsArray = [];
    const fields = Object.assign({}, schema.fields);
    if (className === '_User') {
      fields._email_verify_token_expires_at = {
        type: 'Date'
      };
      fields._email_verify_token = {
        type: 'String'
      };
      fields._account_lockout_expires_at = {
        type: 'Date'
      };
      fields._failed_login_count = {
        type: 'Number'
      };
      fields._perishable_token = {
        type: 'String'
      };
      fields._perishable_token_expires_at = {
        type: 'Date'
      };
      fields._password_changed_at = {
        type: 'Date'
      };
      fields._password_history = {
        type: 'Array'
      };
    }
    let index = 2;
    const relations = [];
    Object.keys(fields).forEach(fieldName => {
      const parseType = fields[fieldName];
      // Skip when it's a relation
      // We'll create the tables later
      if (parseType.type === 'Relation') {
        relations.push(fieldName);
        return;
      }
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        parseType.contents = {
          type: 'String'
        };
      }
      valuesArray.push(fieldName);
      valuesArray.push(parseTypeToPostgresType(parseType));
      patternsArray.push(`$${index}:name $${index + 1}:raw`);
      if (fieldName === 'objectId') {
        patternsArray.push(`PRIMARY KEY ($${index}:name)`);
      }
      index = index + 2;
    });
    const qs = `CREATE TABLE IF NOT EXISTS $1:name (${patternsArray.join()})`;
    const values = [className, ...valuesArray];
    return conn.task('create-table', async t => {
      try {
        await t.none(qs, values);
      } catch (error) {
        if (error.code !== PostgresDuplicateRelationError) {
          throw error;
        }
        // ELSE: Table already exists, must have been created by a different request. Ignore the error.
      }
      await t.tx('create-table-tx', tx => {
        return tx.batch(relations.map(fieldName => {
          return tx.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
            joinTable: `_Join:${fieldName}:${className}`
          });
        }));
      });
    });
  }
  async schemaUpgrade(className, schema, conn) {
    debug('schemaUpgrade');
    conn = conn || this._client;
    const self = this;
    await conn.task('schema-upgrade', async t => {
      const columns = await t.map('SELECT column_name FROM information_schema.columns WHERE table_name = $<className>', {
        className
      }, a => a.column_name);
      const newColumns = Object.keys(schema.fields).filter(item => columns.indexOf(item) === -1).map(fieldName => self.addFieldIfNotExists(className, fieldName, schema.fields[fieldName]));
      await t.batch(newColumns);
    });
  }
  async addFieldIfNotExists(className, fieldName, type) {
    // TODO: Must be revised for invalid logic...
    debug('addFieldIfNotExists');
    const self = this;
    await this._client.tx('add-field-if-not-exists', async t => {
      if (type.type !== 'Relation') {
        try {
          await t.none('ALTER TABLE $<className:name> ADD COLUMN IF NOT EXISTS $<fieldName:name> $<postgresType:raw>', {
            className,
            fieldName,
            postgresType: parseTypeToPostgresType(type)
          });
        } catch (error) {
          if (error.code === PostgresRelationDoesNotExistError) {
            return self.createClass(className, {
              fields: {
                [fieldName]: type
              }
            }, t);
          }
          if (error.code !== PostgresDuplicateColumnError) {
            throw error;
          }
          // Column already exists, created by other request. Carry on to see if it's the right type.
        }
      } else {
        await t.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
          joinTable: `_Join:${fieldName}:${className}`
        });
      }
      const result = await t.any('SELECT "schema" FROM "_SCHEMA" WHERE "className" = $<className> and ("schema"::json->\'fields\'->$<fieldName>) is not null', {
        className,
        fieldName
      });
      if (result[0]) {
        throw 'Attempted to add a field that already exists';
      } else {
        const path = `{fields,${fieldName}}`;
        await t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {
          path,
          type,
          className
        });
      }
    });
    this._notifySchemaChange();
  }
  async updateFieldOptions(className, fieldName, type) {
    await this._client.tx('update-schema-field-options', async t => {
      const path = `{fields,${fieldName}}`;
      await t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {
        path,
        type,
        className
      });
    });
  }

  // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.
  async deleteClass(className) {
    const operations = [{
      query: `DROP TABLE IF EXISTS $1:name`,
      values: [className]
    }, {
      query: `DELETE FROM "_SCHEMA" WHERE "className" = $1`,
      values: [className]
    }];
    const response = await this._client.tx(t => t.none(this._pgp.helpers.concat(operations))).then(() => className.indexOf('_Join:') != 0); // resolves with false when _Join table

    this._notifySchemaChange();
    return response;
  }

  // Delete all data known to this adapter. Used for testing.
  async deleteAllClasses() {
    const now = new Date().getTime();
    const helpers = this._pgp.helpers;
    debug('deleteAllClasses');
    if (this._client?.$pool.ended) {
      return;
    }
    await this._client.task('delete-all-classes', async t => {
      try {
        const results = await t.any('SELECT * FROM "_SCHEMA"');
        const joins = results.reduce((list, schema) => {
          return list.concat(joinTablesForSchema(schema.schema));
        }, []);
        const classes = ['_SCHEMA', '_PushStatus', '_JobStatus', '_JobSchedule', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_Audience', '_Idempotency', ...results.map(result => result.className), ...joins];
        const queries = classes.map(className => ({
          query: 'DROP TABLE IF EXISTS $<className:name>',
          values: {
            className
          }
        }));
        await t.tx(tx => tx.none(helpers.concat(queries)));
      } catch (error) {
        if (error.code !== PostgresRelationDoesNotExistError) {
          throw error;
        }
        // No _SCHEMA collection. Don't delete anything.
      }
    }).then(() => {
      debug(`deleteAllClasses done in ${new Date().getTime() - now}`);
    });
  }

  // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.

  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.

  // Returns a Promise.
  async deleteFields(className, schema, fieldNames) {
    debug('deleteFields');
    fieldNames = fieldNames.reduce((list, fieldName) => {
      const field = schema.fields[fieldName];
      if (field.type !== 'Relation') {
        list.push(fieldName);
      }
      delete schema.fields[fieldName];
      return list;
    }, []);
    const values = [className, ...fieldNames];
    const columns = fieldNames.map((name, idx) => {
      return `$${idx + 2}:name`;
    }).join(', DROP COLUMN');
    await this._client.tx('delete-fields', async t => {
      await t.none('UPDATE "_SCHEMA" SET "schema" = $<schema> WHERE "className" = $<className>', {
        schema,
        className
      });
      if (values.length > 1) {
        await t.none(`ALTER TABLE $1:name DROP COLUMN IF EXISTS ${columns}`, values);
      }
    });
    this._notifySchemaChange();
  }

  // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.
  async getAllClasses() {
    return this._client.task('get-all-classes', async t => {
      return await t.map('SELECT * FROM "_SCHEMA"', null, row => toParseSchema({
        className: row.className,
        ...row.schema
      }));
    });
  }

  // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.
  async getClass(className) {
    debug('getClass');
    return this._client.any('SELECT * FROM "_SCHEMA" WHERE "className" = $<className>', {
      className
    }).then(result => {
      if (result.length !== 1) {
        throw undefined;
      }
      return result[0].schema;
    }).then(toParseSchema);
  }

  // TODO: remove the mongo format dependency in the return value
  async createObject(className, schema, object, transactionalSession) {
    debug('createObject');
    let columnsArray = [];
    const valuesArray = [];
    schema = toPostgresSchema(schema);
    const geoPoints = {};
    object = handleDotFields(object);
    validateKeys(object);
    Object.keys(object).forEach(fieldName => {
      if (object[fieldName] === null) {
        return;
      }
      var authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      const authDataAlreadyExists = !!object.authData;
      if (authDataMatch) {
        var provider = authDataMatch[1];
        object['authData'] = object['authData'] || {};
        object['authData'][provider] = object[fieldName];
        delete object[fieldName];
        fieldName = 'authData';
        // Avoid adding authData multiple times to the query
        if (authDataAlreadyExists) {
          return;
        }
      }
      columnsArray.push(fieldName);
      if (!schema.fields[fieldName] && className === '_User') {
        if (fieldName === '_email_verify_token' || fieldName === '_failed_login_count' || fieldName === '_perishable_token' || fieldName === '_password_history') {
          valuesArray.push(object[fieldName]);
        }
        if (fieldName === '_email_verify_token_expires_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }
        if (fieldName === '_account_lockout_expires_at' || fieldName === '_perishable_token_expires_at' || fieldName === '_password_changed_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }
        return;
      }
      switch (schema.fields[fieldName].type) {
        case 'Date':
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
          break;
        case 'Pointer':
          valuesArray.push(object[fieldName].objectId);
          break;
        case 'Array':
          if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
            valuesArray.push(object[fieldName]);
          } else {
            valuesArray.push(JSON.stringify(object[fieldName]));
          }
          break;
        case 'Object':
        case 'Bytes':
        case 'String':
        case 'Number':
        case 'Boolean':
          valuesArray.push(object[fieldName]);
          break;
        case 'File':
          valuesArray.push(object[fieldName].name);
          break;
        case 'Polygon':
          {
            const value = convertPolygonToSQL(object[fieldName].coordinates);
            valuesArray.push(value);
            break;
          }
        case 'GeoPoint':
          // pop the point and process later
          geoPoints[fieldName] = object[fieldName];
          columnsArray.pop();
          break;
        default:
          throw `Type ${schema.fields[fieldName].type} not supported yet`;
      }
    });
    columnsArray = columnsArray.concat(Object.keys(geoPoints));
    const initialValues = valuesArray.map((val, index) => {
      let termination = '';
      const fieldName = columnsArray[index];
      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        termination = '::text[]';
      } else if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        termination = '::jsonb';
      }
      return `$${index + 2 + columnsArray.length}${termination}`;
    });
    const geoPointsInjects = Object.keys(geoPoints).map(key => {
      const value = geoPoints[key];
      valuesArray.push(value.longitude, value.latitude);
      const l = valuesArray.length + columnsArray.length;
      return `POINT($${l}, $${l + 1})`;
    });
    const columnsPattern = columnsArray.map((col, index) => `$${index + 2}:name`).join();
    const valuesPattern = initialValues.concat(geoPointsInjects).join();
    const qs = `INSERT INTO $1:name (${columnsPattern}) VALUES (${valuesPattern})`;
    const values = [className, ...columnsArray, ...valuesArray];
    const promise = (transactionalSession ? transactionalSession.t : this._client).none(qs, values).then(() => ({
      ops: [object]
    })).catch(error => {
      if (error.code === PostgresUniqueIndexViolationError) {
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;
        if (error.constraint) {
          const matches = error.constraint.match(/unique_([a-zA-Z]+)/);
          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
          }
        }
        error = err;
      }
      throw error;
    });
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.
  async deleteObjectsByQuery(className, schema, query, transactionalSession) {
    debug('deleteObjectsByQuery');
    const values = [className];
    const index = 2;
    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false
    });
    values.push(...where.values);
    if (Object.keys(query).length === 0) {
      where.pattern = 'TRUE';
    }
    const qs = `WITH deleted AS (DELETE FROM $1:name WHERE ${where.pattern} RETURNING *) SELECT count(*) FROM deleted`;
    const promise = (transactionalSession ? transactionalSession.t : this._client).one(qs, values, a => +a.count).then(count => {
      if (count === 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      } else {
        return count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      // ELSE: Don't delete anything if doesn't exist
    });
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }
  // Return value not currently well specified.
  async findOneAndUpdate(className, schema, query, update, transactionalSession) {
    debug('findOneAndUpdate');
    return this.updateObjectsByQuery(className, schema, query, update, transactionalSession).then(val => val[0]);
  }

  // Apply the update to all objects that match the given Parse Query.
  async updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    debug('updateObjectsByQuery');
    const updatePatterns = [];
    const values = [className];
    let index = 2;
    schema = toPostgresSchema(schema);
    const originalUpdate = {
      ...update
    };

    // Set flag for dot notation fields
    const dotNotationOptions = {};
    Object.keys(update).forEach(fieldName => {
      if (fieldName.indexOf('.') > -1) {
        const components = fieldName.split('.');
        const first = components.shift();
        dotNotationOptions[first] = true;
      } else {
        dotNotationOptions[fieldName] = false;
      }
    });
    update = handleDotFields(update);
    // Resolve authData first,
    // So we don't end up with multiple key updates
    for (const fieldName in update) {
      const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      if (authDataMatch) {
        var provider = authDataMatch[1];
        const value = update[fieldName];
        delete update[fieldName];
        update['authData'] = update['authData'] || {};
        update['authData'][provider] = value;
      }
    }
    for (const fieldName in update) {
      const fieldValue = update[fieldName];
      // Drop any undefined values.
      if (typeof fieldValue === 'undefined') {
        delete update[fieldName];
      } else if (fieldValue === null) {
        updatePatterns.push(`$${index}:name = NULL`);
        values.push(fieldName);
        index += 1;
      } else if (fieldName == 'authData') {
        // This recursively sets the json_object
        // Only 1 level deep
        const generate = (jsonb, key, value) => {
          return `json_object_set_key(COALESCE(${jsonb}, '{}'::jsonb), ${key}, ${value})::jsonb`;
        };
        const lastKey = `$${index}:name`;
        const fieldNameIndex = index;
        index += 1;
        values.push(fieldName);
        const update = Object.keys(fieldValue).reduce((lastKey, key) => {
          const str = generate(lastKey, `$${index}::text`, `$${index + 1}::jsonb`);
          index += 2;
          let value = fieldValue[key];
          if (value) {
            if (value.__op === 'Delete') {
              value = null;
            } else {
              value = JSON.stringify(value);
            }
          }
          values.push(key, value);
          return str;
        }, lastKey);
        updatePatterns.push(`$${fieldNameIndex}:name = ${update}`);
      } else if (fieldValue.__op === 'Increment') {
        updatePatterns.push(`$${index}:name = COALESCE($${index}:name, 0) + $${index + 1}`);
        values.push(fieldName, fieldValue.amount);
        index += 2;
      } else if (fieldValue.__op === 'Add') {
        updatePatterns.push(`$${index}:name = array_add(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'Delete') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, null);
        index += 2;
      } else if (fieldValue.__op === 'Remove') {
        updatePatterns.push(`$${index}:name = array_remove(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'AddUnique') {
        updatePatterns.push(`$${index}:name = array_add_unique(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldName === 'updatedAt') {
        //TODO: stop special casing this. It should check for __type === 'Date' and use .iso
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'string') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'boolean') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'Pointer') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      } else if (fieldValue.__type === 'Date') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue instanceof Date) {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'File') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue.__type === 'GeoPoint') {
        updatePatterns.push(`$${index}:name = POINT($${index + 1}, $${index + 2})`);
        values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
        index += 3;
      } else if (fieldValue.__type === 'Polygon') {
        const value = convertPolygonToSQL(fieldValue.coordinates);
        updatePatterns.push(`$${index}:name = $${index + 1}::polygon`);
        values.push(fieldName, value);
        index += 2;
      } else if (fieldValue.__type === 'Relation') {
        // noop
      } else if (typeof fieldValue === 'number') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'object' && schema.fields[fieldName] && schema.fields[fieldName].type === 'Object') {
        // Gather keys to increment
        const keysToIncrement = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set
          // Note that Object.keys is iterating over the **original** update object
          // and that some of the keys of the original update could be null or undefined:
          // (See the above check `if (fieldValue === null || typeof fieldValue == "undefined")`)
          const value = originalUpdate[k];
          return value && value.__op === 'Increment' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        let incrementPatterns = '';
        if (keysToIncrement.length > 0) {
          incrementPatterns = ' || ' + keysToIncrement.map(c => {
            const amount = fieldValue[c].amount;
            return `CONCAT('{"${c}":', COALESCE($${index}:name->>'${c}','0')::int + ${amount}, '}')::jsonb`;
          }).join(' || ');
          // Strip the keys
          keysToIncrement.forEach(key => {
            delete fieldValue[key];
          });
        }
        const keysToDelete = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set.
          const value = originalUpdate[k];
          return value && value.__op === 'Delete' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        const deletePatterns = keysToDelete.reduce((p, c, i) => {
          return p + ` - '$${index + 1 + i}:value'`;
        }, '');
        // Override Object
        let updateObject = "'{}'::jsonb";
        if (dotNotationOptions[fieldName]) {
          // Merge Object
          updateObject = `COALESCE($${index}:name, '{}'::jsonb)`;
        }
        updatePatterns.push(`$${index}:name = (${updateObject} ${deletePatterns} ${incrementPatterns} || $${index + 1 + keysToDelete.length}::jsonb )`);
        values.push(fieldName, ...keysToDelete, JSON.stringify(fieldValue));
        index += 2 + keysToDelete.length;
      } else if (Array.isArray(fieldValue) && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        const expectedType = parseTypeToPostgresType(schema.fields[fieldName]);
        if (expectedType === 'text[]') {
          updatePatterns.push(`$${index}:name = $${index + 1}::text[]`);
          values.push(fieldName, fieldValue);
          index += 2;
        } else {
          updatePatterns.push(`$${index}:name = $${index + 1}::jsonb`);
          values.push(fieldName, JSON.stringify(fieldValue));
          index += 2;
        }
      } else {
        debug('Not supported update', {
          fieldName,
          fieldValue
        });
        return Promise.reject(new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support update ${JSON.stringify(fieldValue)} yet`));
      }
    }
    const where = buildWhereClause({
      schema,
      index,
      query,
      caseInsensitive: false
    });
    values.push(...where.values);
    const whereClause = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const qs = `UPDATE $1:name SET ${updatePatterns.join()} ${whereClause} RETURNING *`;
    const promise = (transactionalSession ? transactionalSession.t : this._client).any(qs, values);
    if (transactionalSession) {
      transactionalSession.batch.push(promise);
    }
    return promise;
  }

  // Hopefully, we can get rid of this. It's only used for config and hooks.
  upsertOneObject(className, schema, query, update, transactionalSession) {
    debug('upsertOneObject');
    const createValue = Object.assign({}, query, update);
    return this.createObject(className, schema, createValue, transactionalSession).catch(error => {
      // ignore duplicate value errors as it's upsert
      if (error.code !== _node.default.Error.DUPLICATE_VALUE) {
        throw error;
      }
      return this.findOneAndUpdate(className, schema, query, update, transactionalSession);
    });
  }
  find(className, schema, query, {
    skip,
    limit,
    sort,
    keys,
    caseInsensitive,
    explain
  }) {
    debug('find');
    const hasLimit = limit !== undefined;
    const hasSkip = skip !== undefined;
    let values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const limitPattern = hasLimit ? `LIMIT $${values.length + 1}` : '';
    if (hasLimit) {
      values.push(limit);
    }
    const skipPattern = hasSkip ? `OFFSET $${values.length + 1}` : '';
    if (hasSkip) {
      values.push(skip);
    }
    let sortPattern = '';
    if (sort) {
      const sortCopy = sort;
      const sorting = Object.keys(sort).map(key => {
        const transformKey = transformDotFieldToComponents(key).join('->');
        // Using $idx pattern gives:  non-integer constant in ORDER BY
        if (sortCopy[key] === 1) {
          return `${transformKey} ASC`;
        }
        return `${transformKey} DESC`;
      }).join();
      sortPattern = sort !== undefined && Object.keys(sort).length > 0 ? `ORDER BY ${sorting}` : '';
    }
    if (where.sorts && Object.keys(where.sorts).length > 0) {
      sortPattern = `ORDER BY ${where.sorts.join()}`;
    }
    let columns = '*';
    if (keys) {
      // Exclude empty keys
      // Replace ACL by it's keys
      keys = keys.reduce((memo, key) => {
        if (key === 'ACL') {
          memo.push('_rperm');
          memo.push('_wperm');
        } else if (key.length > 0 && (
        // Remove selected field not referenced in the schema
        // Relation is not a column in postgres
        // $score is a Parse special field and is also not a column
        schema.fields[key] && schema.fields[key].type !== 'Relation' || key === '$score')) {
          memo.push(key);
        }
        return memo;
      }, []);
      columns = keys.map((key, index) => {
        if (key === '$score') {
          return `ts_rank_cd(to_tsvector($${2}, $${3}:name), to_tsquery($${4}, $${5}), 32) as score`;
        }
        return `$${index + values.length + 1}:name`;
      }).join();
      values = values.concat(keys);
    }
    const originalQuery = `SELECT ${columns} FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client.any(qs, values).catch(error => {
      // Query on non existing table, don't crash
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      return [];
    }).then(results => {
      if (explain) {
        return results;
      }
      return results.map(object => this.postgresObjectToParseObject(className, object, schema));
    });
  }

  // Converts from a postgres-format object to a REST-format object.
  // Does not strip out anything based on a lack of authentication.
  postgresObjectToParseObject(className, object, schema) {
    Object.keys(schema.fields).forEach(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer' && object[fieldName]) {
        object[fieldName] = {
          objectId: object[fieldName],
          __type: 'Pointer',
          className: schema.fields[fieldName].targetClass
        };
      }
      if (schema.fields[fieldName].type === 'Relation') {
        object[fieldName] = {
          __type: 'Relation',
          className: schema.fields[fieldName].targetClass
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'GeoPoint') {
        object[fieldName] = {
          __type: 'GeoPoint',
          latitude: object[fieldName].y,
          longitude: object[fieldName].x
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'Polygon') {
        let coords = new String(object[fieldName]);
        coords = coords.substring(2, coords.length - 2).split('),(');
        const updatedCoords = coords.map(point => {
          return [parseFloat(point.split(',')[1]), parseFloat(point.split(',')[0])];
        });
        object[fieldName] = {
          __type: 'Polygon',
          coordinates: updatedCoords
        };
      }
      if (object[fieldName] && schema.fields[fieldName].type === 'File') {
        object[fieldName] = {
          __type: 'File',
          name: object[fieldName]
        };
      }
    });
    //TODO: remove this reliance on the mongo format. DB adapter shouldn't know there is a difference between created at and any other date field.
    if (object.createdAt) {
      object.createdAt = object.createdAt.toISOString();
    }
    if (object.updatedAt) {
      object.updatedAt = object.updatedAt.toISOString();
    }
    if (object.expiresAt) {
      object.expiresAt = {
        __type: 'Date',
        iso: object.expiresAt.toISOString()
      };
    }
    if (object._email_verify_token_expires_at) {
      object._email_verify_token_expires_at = {
        __type: 'Date',
        iso: object._email_verify_token_expires_at.toISOString()
      };
    }
    if (object._account_lockout_expires_at) {
      object._account_lockout_expires_at = {
        __type: 'Date',
        iso: object._account_lockout_expires_at.toISOString()
      };
    }
    if (object._perishable_token_expires_at) {
      object._perishable_token_expires_at = {
        __type: 'Date',
        iso: object._perishable_token_expires_at.toISOString()
      };
    }
    if (object._password_changed_at) {
      object._password_changed_at = {
        __type: 'Date',
        iso: object._password_changed_at.toISOString()
      };
    }
    for (const fieldName in object) {
      if (object[fieldName] === null) {
        delete object[fieldName];
      }
      if (object[fieldName] instanceof Date) {
        object[fieldName] = {
          __type: 'Date',
          iso: object[fieldName].toISOString()
        };
      }
    }
    return object;
  }

  // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.
  async ensureUniqueness(className, schema, fieldNames) {
    const constraintName = `${className}_unique_${fieldNames.sort().join('_')}`;
    const constraintPatterns = fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE UNIQUE INDEX IF NOT EXISTS $2:name ON $1:name(${constraintPatterns.join()})`;
    return this._client.none(qs, [className, constraintName, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(constraintName)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(constraintName)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  }

  // Executes a count.
  async count(className, schema, query, readPreference, estimate = true) {
    debug('count');
    const values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      caseInsensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    let qs = '';
    if (where.pattern.length > 0 || !estimate) {
      qs = `SELECT count(*) FROM $1:name ${wherePattern}`;
    } else {
      qs = 'SELECT reltuples AS approximate_row_count FROM pg_class WHERE relname = $1';
    }
    return this._client.one(qs, values, a => {
      if (a.approximate_row_count == null || a.approximate_row_count == -1) {
        return !isNaN(+a.count) ? +a.count : 0;
      } else {
        return +a.approximate_row_count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }
      return 0;
    });
  }
  async distinct(className, schema, query, fieldName) {
    debug('distinct');
    let field = fieldName;
    let column = fieldName;
    const isNested = fieldName.indexOf('.') >= 0;
    if (isNested) {
      field = transformDotFieldToComponents(fieldName).join('->');
      column = fieldName.split('.')[0];
    }
    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const isPointerField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const values = [field, column, className];
    const where = buildWhereClause({
      schema,
      query,
      index: 4,
      caseInsensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const transformer = isArrayField ? 'jsonb_array_elements' : 'ON';
    let qs = `SELECT DISTINCT ${transformer}($1:name) $2:name FROM $3:name ${wherePattern}`;
    if (isNested) {
      qs = `SELECT DISTINCT ${transformer}($1:raw) $2:raw FROM $3:name ${wherePattern}`;
    }
    return this._client.any(qs, values).catch(error => {
      if (error.code === PostgresMissingColumnError) {
        return [];
      }
      throw error;
    }).then(results => {
      if (!isNested) {
        results = results.filter(object => object[field] !== null);
        return results.map(object => {
          if (!isPointerField) {
            return object[field];
          }
          return {
            __type: 'Pointer',
            className: schema.fields[fieldName].targetClass,
            objectId: object[field]
          };
        });
      }
      const child = fieldName.split('.')[1];
      return results.map(object => object[column][child]);
    }).then(results => results.map(object => this.postgresObjectToParseObject(className, object, schema)));
  }
  async aggregate(className, schema, pipeline, readPreference, hint, explain) {
    debug('aggregate');
    const values = [className];
    let index = 2;
    let columns = [];
    let countField = null;
    let groupValues = null;
    let wherePattern = '';
    let limitPattern = '';
    let skipPattern = '';
    let sortPattern = '';
    let groupPattern = '';
    for (let i = 0; i < pipeline.length; i += 1) {
      const stage = pipeline[i];
      if (stage.$group) {
        for (const field in stage.$group) {
          const value = stage.$group[field];
          if (value === null || value === undefined) {
            continue;
          }
          if (field === '_id' && typeof value === 'string' && value !== '') {
            columns.push(`$${index}:name AS "objectId"`);
            groupPattern = `GROUP BY $${index}:name`;
            values.push(transformAggregateField(value));
            index += 1;
            continue;
          }
          if (field === '_id' && typeof value === 'object' && Object.keys(value).length !== 0) {
            groupValues = value;
            const groupByFields = [];
            for (const alias in value) {
              if (typeof value[alias] === 'string' && value[alias]) {
                const source = transformAggregateField(value[alias]);
                if (!groupByFields.includes(`"${source}"`)) {
                  groupByFields.push(`"${source}"`);
                }
                values.push(source, alias);
                columns.push(`$${index}:name AS $${index + 1}:name`);
                index += 2;
              } else {
                const operation = Object.keys(value[alias])[0];
                const source = transformAggregateField(value[alias][operation]);
                if (mongoAggregateToPostgres[operation]) {
                  if (!groupByFields.includes(`"${source}"`)) {
                    groupByFields.push(`"${source}"`);
                  }
                  columns.push(`EXTRACT(${mongoAggregateToPostgres[operation]} FROM $${index}:name AT TIME ZONE 'UTC')::integer AS $${index + 1}:name`);
                  values.push(source, alias);
                  index += 2;
                }
              }
            }
            groupPattern = `GROUP BY $${index}:raw`;
            values.push(groupByFields.join());
            index += 1;
            continue;
          }
          if (typeof value === 'object') {
            if (value.$sum) {
              if (typeof value.$sum === 'string') {
                columns.push(`SUM($${index}:name) AS $${index + 1}:name`);
                values.push(transformAggregateField(value.$sum), field);
                index += 2;
              } else {
                countField = field;
                columns.push(`COUNT(*) AS $${index}:name`);
                values.push(field);
                index += 1;
              }
            }
            if (value.$max) {
              columns.push(`MAX($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$max), field);
              index += 2;
            }
            if (value.$min) {
              columns.push(`MIN($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$min), field);
              index += 2;
            }
            if (value.$avg) {
              columns.push(`AVG($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$avg), field);
              index += 2;
            }
          }
        }
      } else {
        columns.push('*');
      }
      if (stage.$project) {
        if (columns.includes('*')) {
          columns = [];
        }
        for (const field in stage.$project) {
          const value = stage.$project[field];
          if (value === 1 || value === true) {
            columns.push(`$${index}:name`);
            values.push(field);
            index += 1;
          }
        }
      }
      if (stage.$match) {
        const patterns = [];
        const orOrAnd = Object.prototype.hasOwnProperty.call(stage.$match, '$or') ? ' OR ' : ' AND ';
        if (stage.$match.$or) {
          const collapse = {};
          stage.$match.$or.forEach(element => {
            for (const key in element) {
              collapse[key] = element[key];
            }
          });
          stage.$match = collapse;
        }
        for (let field in stage.$match) {
          const value = stage.$match[field];
          if (field === '_id') {
            field = 'objectId';
          }
          const matchPatterns = [];
          Object.keys(ParseToPosgresComparator).forEach(cmp => {
            if (value[cmp]) {
              const pgComparator = ParseToPosgresComparator[cmp];
              matchPatterns.push(`$${index}:name ${pgComparator} $${index + 1}`);
              values.push(field, toPostgresValue(value[cmp]));
              index += 2;
            }
          });
          if (matchPatterns.length > 0) {
            patterns.push(`(${matchPatterns.join(' AND ')})`);
          }
          if (schema.fields[field] && schema.fields[field].type && matchPatterns.length === 0) {
            patterns.push(`$${index}:name = $${index + 1}`);
            values.push(field, value);
            index += 2;
          }
        }
        wherePattern = patterns.length > 0 ? `WHERE ${patterns.join(` ${orOrAnd} `)}` : '';
      }
      if (stage.$limit) {
        limitPattern = `LIMIT $${index}`;
        values.push(stage.$limit);
        index += 1;
      }
      if (stage.$skip) {
        skipPattern = `OFFSET $${index}`;
        values.push(stage.$skip);
        index += 1;
      }
      if (stage.$sort) {
        const sort = stage.$sort;
        const keys = Object.keys(sort);
        const sorting = keys.map(key => {
          const transformer = sort[key] === 1 ? 'ASC' : 'DESC';
          const order = `$${index}:name ${transformer}`;
          index += 1;
          return order;
        }).join();
        values.push(...keys);
        sortPattern = sort !== undefined && sorting.length > 0 ? `ORDER BY ${sorting}` : '';
      }
    }
    if (groupPattern) {
      columns.forEach((e, i, a) => {
        if (e && e.trim() === '*') {
          a[i] = '';
        }
      });
    }
    const originalQuery = `SELECT ${columns.filter(Boolean).join()} FROM $1:name ${wherePattern} ${skipPattern} ${groupPattern} ${sortPattern} ${limitPattern}`;
    const qs = explain ? this.createExplainableQuery(originalQuery) : originalQuery;
    return this._client.any(qs, values).then(a => {
      if (explain) {
        return a;
      }
      const results = a.map(object => this.postgresObjectToParseObject(className, object, schema));
      results.forEach(result => {
        if (!Object.prototype.hasOwnProperty.call(result, 'objectId')) {
          result.objectId = null;
        }
        if (groupValues) {
          result.objectId = {};
          for (const key in groupValues) {
            result.objectId[key] = result[key];
            delete result[key];
          }
        }
        if (countField) {
          result[countField] = parseInt(result[countField], 10);
        }
      });
      return results;
    });
  }
  async performInitialization({
    VolatileClassesSchemas
  }) {
    // TODO: This method needs to be rewritten to make proper use of connections (@vitaly-t)
    debug('performInitialization');
    await this._ensureSchemaCollectionExists();
    const promises = VolatileClassesSchemas.map(schema => {
      return this.createTable(schema.className, schema).catch(err => {
        if (err.code === PostgresDuplicateRelationError || err.code === _node.default.Error.INVALID_CLASS_NAME) {
          return Promise.resolve();
        }
        throw err;
      }).then(() => this.schemaUpgrade(schema.className, schema));
    });
    promises.push(this._listenToSchema());
    return Promise.all(promises).then(() => {
      return this._client.tx('perform-initialization', async t => {
        await t.none(_sql.default.misc.jsonObjectSetKeys);
        await t.none(_sql.default.array.add);
        await t.none(_sql.default.array.addUnique);
        await t.none(_sql.default.array.remove);
        await t.none(_sql.default.array.containsAll);
        await t.none(_sql.default.array.containsAllRegex);
        await t.none(_sql.default.array.contains);
        return t.ctx;
      });
    }).then(ctx => {
      debug(`initializationDone in ${ctx.duration}`);
    }).catch(error => {
      // eslint-disable-next-line no-console
      console.error(error);
    });
  }
  async createIndexes(className, indexes, conn) {
    return (conn || this._client).tx(t => t.batch(indexes.map(i => {
      return t.none('CREATE INDEX IF NOT EXISTS $1:name ON $2:name ($3:name)', [i.name, className, i.key]);
    })));
  }
  async createIndexesIfNeeded(className, fieldName, type, conn) {
    await (conn || this._client).none('CREATE INDEX IF NOT EXISTS $1:name ON $2:name ($3:name)', [fieldName, className, type]);
  }
  async dropIndexes(className, indexes, conn) {
    const queries = indexes.map(i => ({
      query: 'DROP INDEX $1:name',
      values: i
    }));
    await (conn || this._client).tx(t => t.none(this._pgp.helpers.concat(queries)));
  }
  async getIndexes(className) {
    const qs = 'SELECT * FROM pg_indexes WHERE tablename = ${className}';
    return this._client.any(qs, {
      className
    });
  }
  async updateSchemaWithIndexes() {
    return Promise.resolve();
  }

  // Used for testing purposes
  async updateEstimatedCount(className) {
    return this._client.none('ANALYZE $1:name', [className]);
  }
  async createTransactionalSession() {
    return new Promise(resolve => {
      const transactionalSession = {};
      transactionalSession.result = this._client.tx(t => {
        transactionalSession.t = t;
        transactionalSession.promise = new Promise(resolve => {
          transactionalSession.resolve = resolve;
        });
        transactionalSession.batch = [];
        resolve(transactionalSession);
        return transactionalSession.promise;
      });
    });
  }
  commitTransactionalSession(transactionalSession) {
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return transactionalSession.result;
  }
  abortTransactionalSession(transactionalSession) {
    const result = transactionalSession.result.catch();
    transactionalSession.batch.push(Promise.reject());
    transactionalSession.resolve(transactionalSession.t.batch(transactionalSession.batch));
    return result;
  }
  async ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const defaultIndexName = `parse_default_${fieldNames.sort().join('_')}`;
    const indexNameOptions = indexName != null ? {
      name: indexName
    } : {
      name: defaultIndexName
    };
    const constraintPatterns = caseInsensitive ? fieldNames.map((fieldName, index) => `lower($${index + 3}:name) varchar_pattern_ops`) : fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `CREATE INDEX IF NOT EXISTS $1:name ON $2:name (${constraintPatterns.join()})`;
    const setIdempotencyFunction = options.setIdempotencyFunction !== undefined ? options.setIdempotencyFunction : false;
    if (setIdempotencyFunction) {
      await this.ensureIdempotencyFunctionExists(options);
    }
    await conn.none(qs, [indexNameOptions.name, className, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(indexNameOptions.name)) {
        // Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(indexNameOptions.name)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  }
  async deleteIdempotencyFunction(options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const qs = 'DROP FUNCTION IF EXISTS idempotency_delete_expired_records()';
    return conn.none(qs).catch(error => {
      throw error;
    });
  }
  async ensureIdempotencyFunctionExists(options = {}) {
    const conn = options.conn !== undefined ? options.conn : this._client;
    const ttlOptions = options.ttl !== undefined ? `${options.ttl} seconds` : '60 seconds';
    const qs = 'CREATE OR REPLACE FUNCTION idempotency_delete_expired_records() RETURNS void LANGUAGE plpgsql AS $$ BEGIN DELETE FROM "_Idempotency" WHERE expire < NOW() - INTERVAL $1; END; $$;';
    return conn.none(qs, [ttlOptions]).catch(error => {
      throw error;
    });
  }
}
exports.PostgresStorageAdapter = PostgresStorageAdapter;
function convertPolygonToSQL(polygon) {
  if (polygon.length < 3) {
    throw new _node.default.Error(_node.default.Error.INVALID_JSON, `Polygon must have at least 3 values`);
  }
  if (polygon[0][0] !== polygon[polygon.length - 1][0] || polygon[0][1] !== polygon[polygon.length - 1][1]) {
    polygon.push(polygon[0]);
  }
  const unique = polygon.filter((item, index, ar) => {
    let foundIndex = -1;
    for (let i = 0; i < ar.length; i += 1) {
      const pt = ar[i];
      if (pt[0] === item[0] && pt[1] === item[1]) {
        foundIndex = i;
        break;
      }
    }
    return foundIndex === index;
  });
  if (unique.length < 3) {
    throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'GeoJSON: Loop must have at least 3 different vertices');
  }
  const points = polygon.map(point => {
    _node.default.GeoPoint._validate(parseFloat(point[1]), parseFloat(point[0]));
    return `(${point[1]}, ${point[0]})`;
  }).join(', ');
  return `(${points})`;
}
function removeWhiteSpace(regex) {
  if (!regex.endsWith('\n')) {
    regex += '\n';
  }

  // remove non escaped comments
  return regex.replace(/([^\\])#.*\n/gim, '$1')
  // remove lines starting with a comment
  .replace(/^#.*\n/gim, '')
  // remove non escaped whitespace
  .replace(/([^\\])\s+/gim, '$1')
  // remove whitespace at the beginning of a line
  .replace(/^\s+/, '').trim();
}
function processRegexPattern(s) {
  if (s && s.startsWith('^')) {
    // regex for startsWith
    return '^' + literalizeRegexPart(s.slice(1));
  } else if (s && s.endsWith('$')) {
    // regex for endsWith
    return literalizeRegexPart(s.slice(0, s.length - 1)) + '$';
  }

  // regex for contains
  return literalizeRegexPart(s);
}
function isStartsWithRegex(value) {
  if (!value || typeof value !== 'string' || !value.startsWith('^')) {
    return false;
  }
  const matches = value.match(/\^\\Q.*\\E/);
  return !!matches;
}
function isAllValuesRegexOrNone(values) {
  if (!values || !Array.isArray(values) || values.length === 0) {
    return true;
  }
  const firstValuesIsRegex = isStartsWithRegex(values[0].$regex);
  if (values.length === 1) {
    return firstValuesIsRegex;
  }
  for (let i = 1, length = values.length; i < length; ++i) {
    if (firstValuesIsRegex !== isStartsWithRegex(values[i].$regex)) {
      return false;
    }
  }
  return true;
}
function isAnyValueRegexStartsWith(values) {
  return values.some(function (value) {
    return isStartsWithRegex(value.$regex);
  });
}
function createLiteralRegex(remaining) {
  return remaining.split('').map(c => {
    const regex = RegExp('[0-9 ]|\\p{L}', 'u'); // Support all Unicode letter chars
    if (c.match(regex) !== null) {
      // Don't escape alphanumeric characters
      return c;
    }
    // Escape everything else (single quotes with single quotes, everything else with a backslash)
    return c === `'` ? `''` : `\\${c}`;
  }).join('');
}
function literalizeRegexPart(s) {
  const matcher1 = /\\Q((?!\\E).*)\\E$/;
  const result1 = s.match(matcher1);
  if (result1 && result1.length > 1 && result1.index > -1) {
    // Process Regex that has a beginning and an end specified for the literal text
    const prefix = s.substring(0, result1.index);
    const remaining = result1[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // Process Regex that has a beginning specified for the literal text
  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2 = s.match(matcher2);
  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substring(0, result2.index);
    const remaining = result2[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  }

  // Remove problematic chars from remaining text
  return s
  // Remove all instances of \Q and \E
  .replace(/([^\\])(\\E)/, '$1').replace(/([^\\])(\\Q)/, '$1').replace(/^\\E/, '').replace(/^\\Q/, '')
  // Ensure even number of single quote sequences by adding an extra single quote if needed;
  // this ensures that every single quote is escaped
  .replace(/'+/g, match => {
    return match.length % 2 === 0 ? match : match + "'";
  });
}
var GeoPointCoder = {
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }
};
var _default = exports.default = PostgresStorageAdapter;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUG9zdGdyZXNDbGllbnQiLCJyZXF1aXJlIiwiX25vZGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2xvZGFzaCIsIl91dWlkIiwiX3NxbCIsIl9TdG9yYWdlQWRhcHRlciIsImUiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsIlV0aWxzIiwiUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciIsIlBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yIiwiUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yIiwibG9nZ2VyIiwiZGVidWciLCJhcmdzIiwiYXJndW1lbnRzIiwiY29uY2F0Iiwic2xpY2UiLCJsZW5ndGgiLCJsb2ciLCJnZXRMb2dnZXIiLCJhcHBseSIsInBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlIiwidHlwZSIsImNvbnRlbnRzIiwiSlNPTiIsInN0cmluZ2lmeSIsIlBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciIsIiRndCIsIiRsdCIsIiRndGUiLCIkbHRlIiwibW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzIiwiJGRheU9mTW9udGgiLCIkZGF5T2ZXZWVrIiwiJGRheU9mWWVhciIsIiRpc29EYXlPZldlZWsiLCIkaXNvV2Vla1llYXIiLCIkaG91ciIsIiRtaW51dGUiLCIkc2Vjb25kIiwiJG1pbGxpc2Vjb25kIiwiJG1vbnRoIiwiJHdlZWsiLCIkeWVhciIsInRvUG9zdGdyZXNWYWx1ZSIsInZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlIiwicG9zdGdyZXNWYWx1ZSIsImNhc3RUeXBlIiwidW5kZWZpbmVkIiwidHJhbnNmb3JtVmFsdWUiLCJvYmplY3RJZCIsImVtcHR5Q0xQUyIsIk9iamVjdCIsImZyZWV6ZSIsImZpbmQiLCJnZXQiLCJjb3VudCIsImNyZWF0ZSIsInVwZGF0ZSIsImRlbGV0ZSIsImFkZEZpZWxkIiwicHJvdGVjdGVkRmllbGRzIiwiZGVmYXVsdENMUFMiLCJBQ0wiLCJyZWFkIiwid3JpdGUiLCJ0b1BhcnNlU2NoZW1hIiwic2NoZW1hIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2hhc2hlZF9wYXNzd29yZCIsIl93cGVybSIsIl9ycGVybSIsImNscHMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwidG9Qb3N0Z3Jlc1NjaGVtYSIsIl9wYXNzd29yZF9oaXN0b3J5IiwiaXNBcnJheUluZGV4IiwiYXJyYXlJbmRleCIsIkFycmF5IiwiZnJvbSIsImV2ZXJ5IiwiYyIsImhhbmRsZURvdEZpZWxkcyIsIm9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwiZmllbGROYW1lIiwiaW5kZXhPZiIsImNvbXBvbmVudHMiLCJzcGxpdCIsImZpcnN0Iiwic2hpZnQiLCJjdXJyZW50T2JqIiwibmV4dCIsIl9fb3AiLCJ0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyIsIm1hcCIsImNtcHQiLCJpbmRleCIsIk51bWJlciIsInRyYW5zZm9ybURvdEZpZWxkIiwiam9pbiIsInRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkIiwic3Vic3RyaW5nIiwidmFsaWRhdGVLZXlzIiwia2V5IiwiaW5jbHVkZXMiLCJQYXJzZSIsIkVycm9yIiwiSU5WQUxJRF9ORVNURURfS0VZIiwiam9pblRhYmxlc0ZvclNjaGVtYSIsImxpc3QiLCJmaWVsZCIsInB1c2giLCJidWlsZFdoZXJlQ2xhdXNlIiwicXVlcnkiLCJjYXNlSW5zZW5zaXRpdmUiLCJwYXR0ZXJucyIsInZhbHVlcyIsInNvcnRzIiwiaXNBcnJheUZpZWxkIiwiaW5pdGlhbFBhdHRlcm5zTGVuZ3RoIiwiZmllbGRWYWx1ZSIsIiRleGlzdHMiLCJhdXRoRGF0YU1hdGNoIiwibWF0Y2giLCIkaW4iLCIkcmVnZXgiLCJNQVhfSU5UX1BMVVNfT05FIiwiY2xhdXNlcyIsImNsYXVzZVZhbHVlcyIsInN1YlF1ZXJ5IiwiY2xhdXNlIiwicGF0dGVybiIsIm9yT3JBbmQiLCJub3QiLCIkbmUiLCJjb25zdHJhaW50RmllbGROYW1lIiwiJHJlbGF0aXZlVGltZSIsIklOVkFMSURfSlNPTiIsInBvaW50IiwibG9uZ2l0dWRlIiwibGF0aXR1ZGUiLCIkZXEiLCJpc0luT3JOaW4iLCJpc0FycmF5IiwiJG5pbiIsImluUGF0dGVybnMiLCJhbGxvd051bGwiLCJsaXN0RWxlbSIsImxpc3RJbmRleCIsImNyZWF0ZUNvbnN0cmFpbnQiLCJiYXNlQXJyYXkiLCJub3RJbiIsIl8iLCJmbGF0TWFwIiwiZWx0IiwiJGFsbCIsImlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgiLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwiaSIsInByb2Nlc3NSZWdleFBhdHRlcm4iLCIkY29udGFpbmVkQnkiLCJhcnIiLCIkdGV4dCIsInNlYXJjaCIsIiRzZWFyY2giLCJsYW5ndWFnZSIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwiJG5lYXJTcGhlcmUiLCJkaXN0YW5jZSIsIiRtYXhEaXN0YW5jZSIsImRpc3RhbmNlSW5LTSIsIiR3aXRoaW4iLCIkYm94IiwiYm94IiwibGVmdCIsImJvdHRvbSIsInJpZ2h0IiwidG9wIiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJjZW50ZXJTcGhlcmUiLCJHZW9Qb2ludCIsIkdlb1BvaW50Q29kZXIiLCJpc1ZhbGlkSlNPTiIsIl92YWxpZGF0ZSIsImlzTmFOIiwiJHBvbHlnb24iLCJwb2x5Z29uIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCIkZ2VvSW50ZXJzZWN0cyIsIiRwb2ludCIsInJlZ2V4Iiwib3BlcmF0b3IiLCJvcHRzIiwiJG9wdGlvbnMiLCJyZW1vdmVXaGl0ZVNwYWNlIiwiY29udmVydFBvbHlnb25Ub1NRTCIsImNtcCIsInBnQ29tcGFyYXRvciIsInBhcnNlclJlc3VsdCIsInJlbGF0aXZlVGltZVRvRGF0ZSIsInN0YXR1cyIsInJlc3VsdCIsImNvbnNvbGUiLCJlcnJvciIsImluZm8iLCJPUEVSQVRJT05fRk9SQklEREVOIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsIm9wdGlvbnMiLCJfY29sbGVjdGlvblByZWZpeCIsImVuYWJsZVNjaGVtYUhvb2tzIiwic2NoZW1hQ2FjaGVUdGwiLCJjbGllbnQiLCJwZ3AiLCJjcmVhdGVDbGllbnQiLCJfY2xpZW50IiwiX29uY2hhbmdlIiwiX3BncCIsInV1aWR2NCIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJ3YXRjaCIsImNhbGxiYWNrIiwiY3JlYXRlRXhwbGFpbmFibGVRdWVyeSIsImFuYWx5emUiLCJoYW5kbGVTaHV0ZG93biIsIl9zdHJlYW0iLCJkb25lIiwiJHBvb2wiLCJlbmQiLCJfbGlzdGVuVG9TY2hlbWEiLCJjb25uZWN0IiwiZGlyZWN0Iiwib24iLCJkYXRhIiwicGF5bG9hZCIsInBhcnNlIiwic2VuZGVySWQiLCJub25lIiwiX25vdGlmeVNjaGVtYUNoYW5nZSIsImNhdGNoIiwiX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMiLCJjb25uIiwiY2xhc3NFeGlzdHMiLCJvbmUiLCJhIiwiZXhpc3RzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInRhc2siLCJ0Iiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJzdWJtaXR0ZWRJbmRleGVzIiwiZXhpc3RpbmdJbmRleGVzIiwic2VsZiIsIlByb21pc2UiLCJyZXNvbHZlIiwiX2lkXyIsIl9pZCIsImRlbGV0ZWRJbmRleGVzIiwiaW5zZXJ0ZWRJbmRleGVzIiwiSU5WQUxJRF9RVUVSWSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInR4IiwiY3JlYXRlSW5kZXhlcyIsImRyb3BJbmRleGVzIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsImNyZWF0ZVRhYmxlIiwiZXJyIiwiY29kZSIsImRldGFpbCIsIkRVUExJQ0FURV9WQUxVRSIsInZhbHVlc0FycmF5IiwicGF0dGVybnNBcnJheSIsImFzc2lnbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfZmFpbGVkX2xvZ2luX2NvdW50IiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJyZWxhdGlvbnMiLCJwYXJzZVR5cGUiLCJxcyIsImJhdGNoIiwiam9pblRhYmxlIiwic2NoZW1hVXBncmFkZSIsImNvbHVtbnMiLCJjb2x1bW5fbmFtZSIsIm5ld0NvbHVtbnMiLCJmaWx0ZXIiLCJpdGVtIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsInBvc3RncmVzVHlwZSIsImFueSIsInBhdGgiLCJ1cGRhdGVGaWVsZE9wdGlvbnMiLCJkZWxldGVDbGFzcyIsIm9wZXJhdGlvbnMiLCJyZXNwb25zZSIsImhlbHBlcnMiLCJ0aGVuIiwiZGVsZXRlQWxsQ2xhc3NlcyIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwiZW5kZWQiLCJyZXN1bHRzIiwiam9pbnMiLCJyZWR1Y2UiLCJjbGFzc2VzIiwicXVlcmllcyIsImRlbGV0ZUZpZWxkcyIsImZpZWxkTmFtZXMiLCJpZHgiLCJnZXRBbGxDbGFzc2VzIiwicm93IiwiZ2V0Q2xhc3MiLCJjcmVhdGVPYmplY3QiLCJ0cmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbHVtbnNBcnJheSIsImdlb1BvaW50cyIsImF1dGhEYXRhQWxyZWFkeUV4aXN0cyIsImF1dGhEYXRhIiwicHJvdmlkZXIiLCJwb3AiLCJpbml0aWFsVmFsdWVzIiwidmFsIiwidGVybWluYXRpb24iLCJnZW9Qb2ludHNJbmplY3RzIiwibCIsImNvbHVtbnNQYXR0ZXJuIiwiY29sIiwidmFsdWVzUGF0dGVybiIsInByb21pc2UiLCJvcHMiLCJ1bmRlcmx5aW5nRXJyb3IiLCJjb25zdHJhaW50IiwibWF0Y2hlcyIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5Iiwid2hlcmUiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiZmluZE9uZUFuZFVwZGF0ZSIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBkYXRlUGF0dGVybnMiLCJvcmlnaW5hbFVwZGF0ZSIsImRvdE5vdGF0aW9uT3B0aW9ucyIsImdlbmVyYXRlIiwianNvbmIiLCJsYXN0S2V5IiwiZmllbGROYW1lSW5kZXgiLCJzdHIiLCJhbW91bnQiLCJvYmplY3RzIiwia2V5c1RvSW5jcmVtZW50IiwiayIsImluY3JlbWVudFBhdHRlcm5zIiwia2V5c1RvRGVsZXRlIiwiZGVsZXRlUGF0dGVybnMiLCJwIiwidXBkYXRlT2JqZWN0IiwiZXhwZWN0ZWRUeXBlIiwicmVqZWN0Iiwid2hlcmVDbGF1c2UiLCJ1cHNlcnRPbmVPYmplY3QiLCJjcmVhdGVWYWx1ZSIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJleHBsYWluIiwiaGFzTGltaXQiLCJoYXNTa2lwIiwid2hlcmVQYXR0ZXJuIiwibGltaXRQYXR0ZXJuIiwic2tpcFBhdHRlcm4iLCJzb3J0UGF0dGVybiIsInNvcnRDb3B5Iiwic29ydGluZyIsInRyYW5zZm9ybUtleSIsIm1lbW8iLCJvcmlnaW5hbFF1ZXJ5IiwicG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0IiwidGFyZ2V0Q2xhc3MiLCJ5IiwieCIsImNvb3JkcyIsIlN0cmluZyIsInVwZGF0ZWRDb29yZHMiLCJwYXJzZUZsb2F0IiwiY3JlYXRlZEF0IiwidG9JU09TdHJpbmciLCJ1cGRhdGVkQXQiLCJleHBpcmVzQXQiLCJlbnN1cmVVbmlxdWVuZXNzIiwiY29uc3RyYWludE5hbWUiLCJjb25zdHJhaW50UGF0dGVybnMiLCJtZXNzYWdlIiwicmVhZFByZWZlcmVuY2UiLCJlc3RpbWF0ZSIsImFwcHJveGltYXRlX3Jvd19jb3VudCIsImRpc3RpbmN0IiwiY29sdW1uIiwiaXNOZXN0ZWQiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybWVyIiwiY2hpbGQiLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsImhpbnQiLCJjb3VudEZpZWxkIiwiZ3JvdXBWYWx1ZXMiLCJncm91cFBhdHRlcm4iLCJzdGFnZSIsIiRncm91cCIsImdyb3VwQnlGaWVsZHMiLCJhbGlhcyIsInNvdXJjZSIsIm9wZXJhdGlvbiIsIiRzdW0iLCIkbWF4IiwiJG1pbiIsIiRhdmciLCIkcHJvamVjdCIsIiRtYXRjaCIsIiRvciIsImNvbGxhcHNlIiwiZWxlbWVudCIsIm1hdGNoUGF0dGVybnMiLCIkbGltaXQiLCIkc2tpcCIsIiRzb3J0Iiwib3JkZXIiLCJ0cmltIiwiQm9vbGVhbiIsInBhcnNlSW50IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInByb21pc2VzIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiYWxsIiwic3FsIiwibWlzYyIsImpzb25PYmplY3RTZXRLZXlzIiwiYXJyYXkiLCJhZGQiLCJhZGRVbmlxdWUiLCJyZW1vdmUiLCJjb250YWluc0FsbCIsImNvbnRhaW5zQWxsUmVnZXgiLCJjb250YWlucyIsImN0eCIsImR1cmF0aW9uIiwiY3JlYXRlSW5kZXhlc0lmTmVlZGVkIiwiZ2V0SW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwidXBkYXRlRXN0aW1hdGVkQ291bnQiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiZGVmYXVsdEluZGV4TmFtZSIsImluZGV4TmFtZU9wdGlvbnMiLCJzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uIiwiZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyIsImRlbGV0ZUlkZW1wb3RlbmN5RnVuY3Rpb24iLCJ0dGxPcHRpb25zIiwidHRsIiwiZXhwb3J0cyIsInVuaXF1ZSIsImFyIiwiZm91bmRJbmRleCIsInB0IiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZW5kc1dpdGgiLCJyZXBsYWNlIiwicyIsInN0YXJ0c1dpdGgiLCJsaXRlcmFsaXplUmVnZXhQYXJ0IiwiaXNTdGFydHNXaXRoUmVnZXgiLCJmaXJzdFZhbHVlc0lzUmVnZXgiLCJzb21lIiwiY3JlYXRlTGl0ZXJhbFJlZ2V4IiwicmVtYWluaW5nIiwiUmVnRXhwIiwibWF0Y2hlcjEiLCJyZXN1bHQxIiwicHJlZml4IiwibWF0Y2hlcjIiLCJyZXN1bHQyIiwiX2RlZmF1bHQiXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICcuL1Bvc3RncmVzQ2xpZW50Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCBzcWwgZnJvbSAnLi9zcWwnO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vU3RvcmFnZUFkYXB0ZXInO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuLi8uLi8uLi9VdGlscycpO1xuXG5jb25zdCBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IgPSAnNDJQMDEnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yID0gJzQyUDA3JztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IgPSAnNDI3MDEnO1xuY29uc3QgUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IgPSAnNDI3MDMnO1xuY29uc3QgUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yID0gJzIzNTA1JztcbmNvbnN0IGxvZ2dlciA9IHJlcXVpcmUoJy4uLy4uLy4uL2xvZ2dlcicpO1xuXG5jb25zdCBkZWJ1ZyA9IGZ1bmN0aW9uICguLi5hcmdzOiBhbnkpIHtcbiAgYXJncyA9IFsnUEc6ICcgKyBhcmd1bWVudHNbMF1dLmNvbmNhdChhcmdzLnNsaWNlKDEsIGFyZ3MubGVuZ3RoKSk7XG4gIGNvbnN0IGxvZyA9IGxvZ2dlci5nZXRMb2dnZXIoKTtcbiAgbG9nLmRlYnVnLmFwcGx5KGxvZywgYXJncyk7XG59O1xuXG5jb25zdCBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZSA9IHR5cGUgPT4ge1xuICBzd2l0Y2ggKHR5cGUudHlwZSkge1xuICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICByZXR1cm4gJ3RleHQnO1xuICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgcmV0dXJuICd0aW1lc3RhbXAgd2l0aCB0aW1lIHpvbmUnO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdGaWxlJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gJ2Jvb2xlYW4nO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ3BvaW50JztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgaWYgKHR5cGUuY29udGVudHMgJiYgdHlwZS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJykge1xuICAgICAgICByZXR1cm4gJ3RleHRbXSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ2pzb25iJztcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgYG5vIHR5cGUgZm9yICR7SlNPTi5zdHJpbmdpZnkodHlwZSl9IHlldGA7XG4gIH1cbn07XG5cbmNvbnN0IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciA9IHtcbiAgJGd0OiAnPicsXG4gICRsdDogJzwnLFxuICAkZ3RlOiAnPj0nLFxuICAkbHRlOiAnPD0nLFxufTtcblxuY29uc3QgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzID0ge1xuICAkZGF5T2ZNb250aDogJ0RBWScsXG4gICRkYXlPZldlZWs6ICdET1cnLFxuICAkZGF5T2ZZZWFyOiAnRE9ZJyxcbiAgJGlzb0RheU9mV2VlazogJ0lTT0RPVycsXG4gICRpc29XZWVrWWVhcjogJ0lTT1lFQVInLFxuICAkaG91cjogJ0hPVVInLFxuICAkbWludXRlOiAnTUlOVVRFJyxcbiAgJHNlY29uZDogJ1NFQ09ORCcsXG4gICRtaWxsaXNlY29uZDogJ01JTExJU0VDT05EUycsXG4gICRtb250aDogJ01PTlRIJyxcbiAgJHdlZWs6ICdXRUVLJyxcbiAgJHllYXI6ICdZRUFSJyxcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5pc287XG4gICAgfVxuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlID0gdmFsdWUgPT4ge1xuICBjb25zdCBwb3N0Z3Jlc1ZhbHVlID0gdG9Qb3N0Z3Jlc1ZhbHVlKHZhbHVlKTtcbiAgbGV0IGNhc3RUeXBlO1xuICBzd2l0Y2ggKHR5cGVvZiBwb3N0Z3Jlc1ZhbHVlKSB7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIGNhc3RUeXBlID0gJ2RvdWJsZSBwcmVjaXNpb24nO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICBjYXN0VHlwZSA9ICdib29sZWFuJztcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBjYXN0VHlwZSA9IHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gY2FzdFR5cGU7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICByZXR1cm4gdmFsdWUub2JqZWN0SWQ7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufTtcblxuLy8gRHVwbGljYXRlIGZyb20gdGhlbiBtb25nbyBhZGFwdGVyLi4uXG5jb25zdCBlbXB0eUNMUFMgPSBPYmplY3QuZnJlZXplKHtcbiAgZmluZDoge30sXG4gIGdldDoge30sXG4gIGNvdW50OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIEFDTDoge1xuICAgICcqJzoge1xuICAgICAgcmVhZDogdHJ1ZSxcbiAgICAgIHdyaXRlOiB0cnVlLFxuICAgIH0sXG4gIH0sXG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY291bnQ6IHsgJyonOiB0cnVlIH0sXG4gIGNyZWF0ZTogeyAnKic6IHRydWUgfSxcbiAgdXBkYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICBkZWxldGU6IHsgJyonOiB0cnVlIH0sXG4gIGFkZEZpZWxkOiB7ICcqJzogdHJ1ZSB9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHsgJyonOiBbXSB9LFxufSk7XG5cbmNvbnN0IHRvUGFyc2VTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gIH1cbiAgaWYgKHNjaGVtYS5maWVsZHMpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICB9XG4gIGxldCBjbHBzID0gZGVmYXVsdENMUFM7XG4gIGlmIChzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgY2xwcyA9IHsgLi4uZW1wdHlDTFBTLCAuLi5zY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH07XG4gIH1cbiAgbGV0IGluZGV4ZXMgPSB7fTtcbiAgaWYgKHNjaGVtYS5pbmRleGVzKSB7XG4gICAgaW5kZXhlcyA9IHsgLi4uc2NoZW1hLmluZGV4ZXMgfTtcbiAgfVxuICByZXR1cm4ge1xuICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBjbHBzLFxuICAgIGluZGV4ZXMsXG4gIH07XG59O1xuXG5jb25zdCB0b1Bvc3RncmVzU2NoZW1hID0gc2NoZW1hID0+IHtcbiAgaWYgKCFzY2hlbWEpIHtcbiAgICByZXR1cm4gc2NoZW1hO1xuICB9XG4gIHNjaGVtYS5maWVsZHMgPSBzY2hlbWEuZmllbGRzIHx8IHt9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JywgY29udGVudHM6IHsgdHlwZTogJ1N0cmluZycgfSB9O1xuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICBzY2hlbWEuZmllbGRzLl9wYXNzd29yZF9oaXN0b3J5ID0geyB0eXBlOiAnQXJyYXknIH07XG4gIH1cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGlzQXJyYXlJbmRleCA9IChhcnJheUluZGV4KSA9PiBBcnJheS5mcm9tKGFycmF5SW5kZXgpLmV2ZXJ5KGMgPT4gYyA+PSAnMCcgJiYgYyA8PSAnOScpO1xuXG5jb25zdCBoYW5kbGVEb3RGaWVsZHMgPSBvYmplY3QgPT4ge1xuICBPYmplY3Qua2V5cyhvYmplY3QpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICBjb25zdCBjb21wb25lbnRzID0gZmllbGROYW1lLnNwbGl0KCcuJyk7XG4gICAgICBjb25zdCBmaXJzdCA9IGNvbXBvbmVudHMuc2hpZnQoKTtcbiAgICAgIG9iamVjdFtmaXJzdF0gPSBvYmplY3RbZmlyc3RdIHx8IHt9O1xuICAgICAgbGV0IGN1cnJlbnRPYmogPSBvYmplY3RbZmlyc3RdO1xuICAgICAgbGV0IG5leHQ7XG4gICAgICBsZXQgdmFsdWUgPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgIGlmICh2YWx1ZSAmJiB2YWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB2YWx1ZSA9IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIHdoaWxlICgobmV4dCA9IGNvbXBvbmVudHMuc2hpZnQoKSkpIHtcbiAgICAgICAgY3VycmVudE9ialtuZXh0XSA9IGN1cnJlbnRPYmpbbmV4dF0gfHwge307XG4gICAgICAgIGlmIChjb21wb25lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGN1cnJlbnRPYmpbbmV4dF0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBjdXJyZW50T2JqID0gY3VycmVudE9ialtuZXh0XTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb2JqZWN0O1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMgPSBmaWVsZE5hbWUgPT4ge1xuICByZXR1cm4gZmllbGROYW1lLnNwbGl0KCcuJykubWFwKChjbXB0LCBpbmRleCkgPT4ge1xuICAgIGlmIChpbmRleCA9PT0gMCkge1xuICAgICAgcmV0dXJuIGBcIiR7Y21wdH1cImA7XG4gICAgfVxuICAgIGlmIChpc0FycmF5SW5kZXgoY21wdCkpIHtcbiAgICAgIHJldHVybiBOdW1iZXIoY21wdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBgJyR7Y21wdH0nYDtcbiAgICB9XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG90RmllbGQgPSBmaWVsZE5hbWUgPT4ge1xuICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA9PT0gLTEpIHtcbiAgICByZXR1cm4gYFwiJHtmaWVsZE5hbWV9XCJgO1xuICB9XG4gIGNvbnN0IGNvbXBvbmVudHMgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpO1xuICBsZXQgbmFtZSA9IGNvbXBvbmVudHMuc2xpY2UoMCwgY29tcG9uZW50cy5sZW5ndGggLSAxKS5qb2luKCctPicpO1xuICBuYW1lICs9ICctPj4nICsgY29tcG9uZW50c1tjb21wb25lbnRzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4gbmFtZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKHR5cGVvZiBmaWVsZE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGZpZWxkTmFtZTtcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF9jcmVhdGVkX2F0Jykge1xuICAgIHJldHVybiAnY3JlYXRlZEF0JztcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF91cGRhdGVkX2F0Jykge1xuICAgIHJldHVybiAndXBkYXRlZEF0JztcbiAgfVxuICByZXR1cm4gZmllbGROYW1lLnN1YnN0cmluZygxKTtcbn07XG5cbmNvbnN0IHZhbGlkYXRlS2V5cyA9IG9iamVjdCA9PiB7XG4gIGlmICh0eXBlb2Ygb2JqZWN0ID09ICdvYmplY3QnKSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldID09ICdvYmplY3QnKSB7XG4gICAgICAgIHZhbGlkYXRlS2V5cyhvYmplY3Rba2V5XSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gUmV0dXJucyB0aGUgbGlzdCBvZiBqb2luIHRhYmxlcyBvbiBhIHNjaGVtYVxuY29uc3Qgam9pblRhYmxlc0ZvclNjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGNvbnN0IGxpc3QgPSBbXTtcbiAgaWYgKHNjaGVtYSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgbGlzdC5wdXNoKGBfSm9pbjoke2ZpZWxkfToke3NjaGVtYS5jbGFzc05hbWV9YCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGxpc3Q7XG59O1xuXG5pbnRlcmZhY2UgV2hlcmVDbGF1c2Uge1xuICBwYXR0ZXJuOiBzdHJpbmc7XG4gIHZhbHVlczogQXJyYXk8YW55PjtcbiAgc29ydHM6IEFycmF5PGFueT47XG59XG5cbmNvbnN0IGJ1aWxkV2hlcmVDbGF1c2UgPSAoeyBzY2hlbWEsIHF1ZXJ5LCBpbmRleCwgY2FzZUluc2Vuc2l0aXZlIH0pOiBXaGVyZUNsYXVzZSA9PiB7XG4gIGNvbnN0IHBhdHRlcm5zID0gW107XG4gIGxldCB2YWx1ZXMgPSBbXTtcbiAgY29uc3Qgc29ydHMgPSBbXTtcblxuICBzY2hlbWEgPSB0b1Bvc3RncmVzU2NoZW1hKHNjaGVtYSk7XG4gIGZvciAoY29uc3QgZmllbGROYW1lIGluIHF1ZXJ5KSB7XG4gICAgY29uc3QgaXNBcnJheUZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGluaXRpYWxQYXR0ZXJuc0xlbmd0aCA9IHBhdHRlcm5zLmxlbmd0aDtcbiAgICBjb25zdCBmaWVsZFZhbHVlID0gcXVlcnlbZmllbGROYW1lXTtcblxuICAgIC8vIG5vdGhpbmcgaW4gdGhlIHNjaGVtYSwgaXQncyBnb25uYSBibG93IHVwXG4gICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgIC8vIGFzIGl0IHdvbid0IGV4aXN0XG4gICAgICBpZiAoZmllbGRWYWx1ZSAmJiBmaWVsZFZhbHVlLiRleGlzdHMgPT09IGZhbHNlKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgaWYgKGF1dGhEYXRhTWF0Y2gpIHtcbiAgICAgIC8vIFRPRE86IEhhbmRsZSBxdWVyeWluZyBieSBfYXV0aF9kYXRhX3Byb3ZpZGVyLCBhdXRoRGF0YSBpcyBzdG9yZWQgaW4gYXV0aERhdGEgZmllbGRcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAoY2FzZUluc2Vuc2l0aXZlICYmIChmaWVsZE5hbWUgPT09ICd1c2VybmFtZScgfHwgZmllbGROYW1lID09PSAnZW1haWwnKSkge1xuICAgICAgcGF0dGVybnMucHVzaChgTE9XRVIoJCR7aW5kZXh9Om5hbWUpID0gTE9XRVIoJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICBsZXQgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3IElTIE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2gobmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgICAgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGZpZWxkTmFtZSkuam9pbignLT4nKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAoJCR7aW5kZXh9OnJhdyk6Ompzb25iIEA+ICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS4kaW4pKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGxhdGVyXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyA9ICQke2luZGV4ICsgMX06OnRleHRgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChuYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsIHx8IGZpZWxkVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGluZGV4ICs9IDE7XG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgLy8gQ2FuJ3QgY2FzdCBib29sZWFuIHRvIGRvdWJsZSBwcmVjaXNpb25cbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdOdW1iZXInKSB7XG4gICAgICAgIC8vIFNob3VsZCBhbHdheXMgcmV0dXJuIHplcm8gcmVzdWx0c1xuICAgICAgICBjb25zdCBNQVhfSU5UX1BMVVNfT05FID0gOTIyMzM3MjAzNjg1NDc3NTgwODtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBNQVhfSU5UX1BMVVNfT05FKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICB9XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoWyckb3InLCAnJG5vcicsICckYW5kJ10uaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgY29uc3QgY2xhdXNlcyA9IFtdO1xuICAgICAgY29uc3QgY2xhdXNlVmFsdWVzID0gW107XG4gICAgICBmaWVsZFZhbHVlLmZvckVhY2goc3ViUXVlcnkgPT4ge1xuICAgICAgICBjb25zdCBjbGF1c2UgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgcXVlcnk6IHN1YlF1ZXJ5LFxuICAgICAgICAgIGluZGV4LFxuICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChjbGF1c2UucGF0dGVybi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY2xhdXNlcy5wdXNoKGNsYXVzZS5wYXR0ZXJuKTtcbiAgICAgICAgICBjbGF1c2VWYWx1ZXMucHVzaCguLi5jbGF1c2UudmFsdWVzKTtcbiAgICAgICAgICBpbmRleCArPSBjbGF1c2UudmFsdWVzLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG9yT3JBbmQgPSBmaWVsZE5hbWUgPT09ICckYW5kJyA/ICcgQU5EICcgOiAnIE9SICc7XG4gICAgICBjb25zdCBub3QgPSBmaWVsZE5hbWUgPT09ICckbm9yJyA/ICcgTk9UICcgOiAnJztcblxuICAgICAgcGF0dGVybnMucHVzaChgJHtub3R9KCR7Y2xhdXNlcy5qb2luKG9yT3JBbmQpfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKC4uLmNsYXVzZVZhbHVlcyk7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJG5lICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgZmllbGRWYWx1ZS4kbmUgPSBKU09OLnN0cmluZ2lmeShbZmllbGRWYWx1ZS4kbmVdKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgTk9UIGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lID09PSBudWxsKSB7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gaWYgbm90IG51bGwsIHdlIG5lZWQgdG8gbWFudWFsbHkgZXhjbHVkZSBudWxsXG4gICAgICAgICAgaWYgKGZpZWxkVmFsdWUuJG5lLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgYCgkJHtpbmRleH06bmFtZSA8PiBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlLiRuZSk7XG4gICAgICAgICAgICAgIGNvbnN0IGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBjYXN0VHlwZVxuICAgICAgICAgICAgICAgID8gYENBU1QgKCgke3RyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSl9KSBBUyAke2Nhc3RUeXBlfSlgXG4gICAgICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICAgICAgICAgIGAoJHtjb25zdHJhaW50RmllbGROYW1lfSA8PiAkJHtpbmRleCArIDF9IE9SICR7Y29uc3RyYWludEZpZWxkTmFtZX0gSVMgTlVMTClgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuZSA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kbmUuJHJlbGF0aXZlVGltZSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCB0aGUgJGx0LCAkbHRlLCAkZ3QsIGFuZCAkZ3RlIG9wZXJhdG9ycydcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgkJHtpbmRleH06bmFtZSA8PiAkJHtpbmRleCArIDF9IE9SICQke2luZGV4fTpuYW1lIElTIE5VTEwpYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kbmU7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBUT0RPOiBzdXBwb3J0IGFycmF5c1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJG5lKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGVxICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRlcSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICAgICAgY29uc3QgY2FzdFR5cGUgPSB0b1Bvc3RncmVzVmFsdWVDYXN0VHlwZShmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgICAgY29uc3QgY29uc3RyYWludEZpZWxkTmFtZSA9IGNhc3RUeXBlXG4gICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke2NvbnN0cmFpbnRGaWVsZE5hbWV9ID0gJCR7aW5kZXgrK31gKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZS4kZXEgPT09ICdvYmplY3QnICYmIGZpZWxkVmFsdWUuJGVxLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGVxKTtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGlzSW5Pck5pbiA9IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kaW4pIHx8IEFycmF5LmlzQXJyYXkoZmllbGRWYWx1ZS4kbmluKTtcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSAmJlxuICAgICAgaXNBcnJheUZpZWxkICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJ1xuICAgICkge1xuICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgbGV0IGFsbG93TnVsbCA9IGZhbHNlO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGZpZWxkVmFsdWUuJGluLmZvckVhY2goKGxpc3RFbGVtLCBsaXN0SW5kZXgpID0+IHtcbiAgICAgICAgaWYgKGxpc3RFbGVtID09PSBudWxsKSB7XG4gICAgICAgICAgYWxsb3dOdWxsID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChsaXN0RWxlbSk7XG4gICAgICAgICAgaW5QYXR0ZXJucy5wdXNoKGAkJHtpbmRleCArIDEgKyBsaXN0SW5kZXggLSAoYWxsb3dOdWxsID8gMSA6IDApfWApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChhbGxvd051bGwpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgKCQke2luZGV4fTpuYW1lIElTIE5VTEwgT1IgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dKWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJiYgQVJSQVlbJHtpblBhdHRlcm5zLmpvaW4oKX1dYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgIH0gZWxzZSBpZiAoaXNJbk9yTmluKSB7XG4gICAgICB2YXIgY3JlYXRlQ29uc3RyYWludCA9IChiYXNlQXJyYXksIG5vdEluKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vdCA9IG5vdEluID8gJyBOT1QgJyA6ICcnO1xuICAgICAgICBpZiAoYmFzZUFycmF5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke25vdH0gYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGJhc2VBcnJheSkpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSGFuZGxlIE5lc3RlZCBEb3QgTm90YXRpb24gQWJvdmVcbiAgICAgICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIGJhc2VBcnJheS5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGlmIChsaXN0RWxlbSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4fWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7bm90fSBJTiAoJHtpblBhdHRlcm5zLmpvaW4oKX0pYCk7XG4gICAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghbm90SW4pIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBIYW5kbGUgZW1wdHkgYXJyYXlcbiAgICAgICAgICBpZiAobm90SW4pIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAxJyk7IC8vIFJldHVybiBhbGwgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAyJyk7IC8vIFJldHVybiBubyB2YWx1ZXNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChcbiAgICAgICAgICBfLmZsYXRNYXAoZmllbGRWYWx1ZS4kaW4sIGVsdCA9PiBlbHQpLFxuICAgICAgICAgIGZhbHNlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXG4gICAgICAgICAgXy5mbGF0TWFwKGZpZWxkVmFsdWUuJG5pbiwgZWx0ID0+IGVsdCksXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkaW4gdmFsdWUnKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuaW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRuaW4gdmFsdWUnKTtcbiAgICB9XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpICYmIGlzQXJyYXlGaWVsZCkge1xuICAgICAgaWYgKGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICBpZiAoIWlzQWxsVmFsdWVzUmVnZXhPck5vbmUoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdBbGwgJGFsbCB2YWx1ZXMgbXVzdCBiZSBvZiByZWdleCB0eXBlIG9yIG5vbmU6ICcgKyBmaWVsZFZhbHVlLiRhbGxcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZFZhbHVlLiRhbGwubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHByb2Nlc3NSZWdleFBhdHRlcm4oZmllbGRWYWx1ZS4kYWxsW2ldLiRyZWdleCk7XG4gICAgICAgICAgZmllbGRWYWx1ZS4kYWxsW2ldID0gdmFsdWUuc3Vic3RyaW5nKDEpICsgJyUnO1xuICAgICAgICB9XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zX2FsbF9yZWdleCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGBhcnJheV9jb250YWluc19hbGwoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX06Ompzb25iKWApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLiRhbGwpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGFsbCkpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRhbGwubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJGFsbFswXS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRleGlzdHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGV4aXN0cyA9PT0gJ29iamVjdCcgJiYgZmllbGRWYWx1ZS4kZXhpc3RzLiRyZWxhdGl2ZVRpbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnJHJlbGF0aXZlVGltZSBjYW4gb25seSBiZSB1c2VkIHdpdGggdGhlICRsdCwgJGx0ZSwgJGd0LCBhbmQgJGd0ZSBvcGVyYXRvcnMnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuJGV4aXN0cykge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOT1QgTlVMTGApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTlVMTGApO1xuICAgICAgfVxuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgIGluZGV4ICs9IDE7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJGNvbnRhaW5lZEJ5KSB7XG4gICAgICBjb25zdCBhcnIgPSBmaWVsZFZhbHVlLiRjb250YWluZWRCeTtcbiAgICAgIGlmICghKGFyciBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgYmFkICRjb250YWluZWRCeTogc2hvdWxkIGJlIGFuIGFycmF5YCk7XG4gICAgICB9XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIDxAICQke2luZGV4ICsgMX06Ompzb25iYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGFycikpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kdGV4dCkge1xuICAgICAgY29uc3Qgc2VhcmNoID0gZmllbGRWYWx1ZS4kdGV4dC4kc2VhcmNoO1xuICAgICAgbGV0IGxhbmd1YWdlID0gJ2VuZ2xpc2gnO1xuICAgICAgaWYgKHR5cGVvZiBzZWFyY2ggIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICRzZWFyY2gsIHNob3VsZCBiZSBvYmplY3RgKTtcbiAgICAgIH1cbiAgICAgIGlmICghc2VhcmNoLiR0ZXJtIHx8IHR5cGVvZiBzZWFyY2guJHRlcm0gIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBiYWQgJHRleHQ6ICR0ZXJtLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICB9XG4gICAgICBpZiAoc2VhcmNoLiRsYW5ndWFnZSAmJiB0eXBlb2Ygc2VhcmNoLiRsYW5ndWFnZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYCk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UpIHtcbiAgICAgICAgbGFuZ3VhZ2UgPSBzZWFyY2guJGxhbmd1YWdlO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRjYXNlU2Vuc2l0aXZlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSwgc2hvdWxkIGJlIGJvb2xlYW5gXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRjYXNlU2Vuc2l0aXZlIG5vdCBzdXBwb3J0ZWQsIHBsZWFzZSB1c2UgJHJlZ2V4IG9yIGNyZWF0ZSBhIHNlcGFyYXRlIGxvd2VyIGNhc2UgY29sdW1uLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAmJiB0eXBlb2Ygc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgIT09ICdib29sZWFuJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRkaWFjcml0aWNTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlIC0gZmFsc2Ugbm90IHN1cHBvcnRlZCwgaW5zdGFsbCBQb3N0Z3JlcyBVbmFjY2VudCBFeHRlbnNpb25gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBwYXR0ZXJucy5wdXNoKFxuICAgICAgICBgdG9fdHN2ZWN0b3IoJCR7aW5kZXh9LCAkJHtpbmRleCArIDF9Om5hbWUpIEBAIHRvX3RzcXVlcnkoJCR7aW5kZXggKyAyfSwgJCR7aW5kZXggKyAzfSlgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2gobGFuZ3VhZ2UsIGZpZWxkTmFtZSwgbGFuZ3VhZ2UsIHNlYXJjaC4kdGVybSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZWFyU3BoZXJlKSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lYXJTcGhlcmU7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGZpZWxkVmFsdWUuJG1heERpc3RhbmNlO1xuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9EaXN0YW5jZVNwaGVyZSgkJHtpbmRleH06bmFtZTo6Z2VvbWV0cnksIFBPSU5UKCQke2luZGV4ICsgMX0sICQke1xuICAgICAgICAgIGluZGV4ICsgMlxuICAgICAgICB9KTo6Z2VvbWV0cnkpIDw9ICQke2luZGV4ICsgM31gXG4gICAgICApO1xuICAgICAgc29ydHMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgQVNDYFxuICAgICAgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSwgZGlzdGFuY2VJbktNKTtcbiAgICAgIGluZGV4ICs9IDQ7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHdpdGhpbiAmJiBmaWVsZFZhbHVlLiR3aXRoaW4uJGJveCkge1xuICAgICAgY29uc3QgYm94ID0gZmllbGRWYWx1ZS4kd2l0aGluLiRib3g7XG4gICAgICBjb25zdCBsZWZ0ID0gYm94WzBdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IGJvdHRvbSA9IGJveFswXS5sYXRpdHVkZTtcbiAgICAgIGNvbnN0IHJpZ2h0ID0gYm94WzFdLmxvbmdpdHVkZTtcbiAgICAgIGNvbnN0IHRvcCA9IGJveFsxXS5sYXRpdHVkZTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OmJveGApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBgKCgke2xlZnR9LCAke2JvdHRvbX0pLCAoJHtyaWdodH0sICR7dG9wfSkpYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRjZW50ZXJTcGhlcmUpIHtcbiAgICAgIGNvbnN0IGNlbnRlclNwaGVyZSA9IGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlO1xuICAgICAgaWYgKCEoY2VudGVyU3BoZXJlIGluc3RhbmNlb2YgQXJyYXkpIHx8IGNlbnRlclNwaGVyZS5sZW5ndGggPCAyKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIHNob3VsZCBiZSBhbiBhcnJheSBvZiBQYXJzZS5HZW9Qb2ludCBhbmQgZGlzdGFuY2UnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBHZXQgcG9pbnQsIGNvbnZlcnQgdG8gZ2VvIHBvaW50IGlmIG5lY2Vzc2FyeSBhbmQgdmFsaWRhdGVcbiAgICAgIGxldCBwb2ludCA9IGNlbnRlclNwaGVyZVswXTtcbiAgICAgIGlmIChwb2ludCBpbnN0YW5jZW9mIEFycmF5ICYmIHBvaW50Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICBwb2ludCA9IG5ldyBQYXJzZS5HZW9Qb2ludChwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgfSBlbHNlIGlmICghR2VvUG9pbnRDb2Rlci5pc1ZhbGlkSlNPTihwb2ludCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAnYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRjZW50ZXJTcGhlcmUgZ2VvIHBvaW50IGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBQYXJzZS5HZW9Qb2ludC5fdmFsaWRhdGUocG9pbnQubGF0aXR1ZGUsIHBvaW50LmxvbmdpdHVkZSk7XG4gICAgICAvLyBHZXQgZGlzdGFuY2UgYW5kIHZhbGlkYXRlXG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGNlbnRlclNwaGVyZVsxXTtcbiAgICAgIGlmIChpc05hTihkaXN0YW5jZSkgfHwgZGlzdGFuY2UgPCAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGRpc3RhbmNlIGludmFsaWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBjb25zdCBkaXN0YW5jZUluS00gPSBkaXN0YW5jZSAqIDYzNzEgKiAxMDAwO1xuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYFNUX0Rpc3RhbmNlU3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7XG4gICAgICAgICAgaW5kZXggKyAyXG4gICAgICAgIH0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uKSB7XG4gICAgICBjb25zdCBwb2x5Z29uID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uO1xuICAgICAgbGV0IHBvaW50cztcbiAgICAgIGlmICh0eXBlb2YgcG9seWdvbiA9PT0gJ29iamVjdCcgJiYgcG9seWdvbi5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBpZiAoIXBvbHlnb24uY29vcmRpbmF0ZXMgfHwgcG9seWdvbi5jb29yZGluYXRlcy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyBQb2x5Z29uLmNvb3JkaW5hdGVzIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgbG9uL2xhdCBwYWlycydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb24uY29vcmRpbmF0ZXM7XG4gICAgICB9IGVsc2UgaWYgKHBvbHlnb24gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIEdlb1BvaW50cydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb247XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIFwiYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBiZSBQb2x5Z29uIG9iamVjdCBvciBBcnJheSBvZiBQYXJzZS5HZW9Qb2ludCdzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBvaW50cyA9IHBvaW50c1xuICAgICAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgICAgcmV0dXJuIGAoJHtwb2ludFswXX0sICR7cG9pbnRbMV19KWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlJyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbignLCAnKTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50c30pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cyAmJiBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludCkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludDtcbiAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb0ludGVyc2VjdCB2YWx1ZTsgJHBvaW50IHNob3VsZCBiZSBHZW9Qb2ludCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIH1cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2x5Z29uIEA+ICQke2luZGV4ICsgMX06OnBvaW50YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICBsZXQgcmVnZXggPSBmaWVsZFZhbHVlLiRyZWdleDtcbiAgICAgIGxldCBvcGVyYXRvciA9ICd+JztcbiAgICAgIGNvbnN0IG9wdHMgPSBmaWVsZFZhbHVlLiRvcHRpb25zO1xuICAgICAgaWYgKG9wdHMpIHtcbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZignaScpID49IDApIHtcbiAgICAgICAgICBvcGVyYXRvciA9ICd+Kic7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZigneCcpID49IDApIHtcbiAgICAgICAgICByZWdleCA9IHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgcmVnZXggPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKHJlZ2V4KTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyAke29wZXJhdG9yfSAnJCR7aW5kZXggKyAxfTpyYXcnYCk7XG4gICAgICB2YWx1ZXMucHVzaChuYW1lLCByZWdleCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KFtmaWVsZFZhbHVlXSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmlzbyk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgaW5kZXggKz0gMztcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIE9iamVjdC5rZXlzKFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcikuZm9yRWFjaChjbXAgPT4ge1xuICAgICAgaWYgKGZpZWxkVmFsdWVbY21wXSB8fCBmaWVsZFZhbHVlW2NtcF0gPT09IDApIHtcbiAgICAgICAgY29uc3QgcGdDb21wYXJhdG9yID0gUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yW2NtcF07XG4gICAgICAgIGxldCBjb25zdHJhaW50RmllbGROYW1lO1xuICAgICAgICBsZXQgcG9zdGdyZXNWYWx1ZSA9IHRvUG9zdGdyZXNWYWx1ZShmaWVsZFZhbHVlW2NtcF0pO1xuXG4gICAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDApIHtcbiAgICAgICAgICBjb25zdCBjYXN0VHlwZSA9IHRvUG9zdGdyZXNWYWx1ZUNhc3RUeXBlKGZpZWxkVmFsdWVbY21wXSk7XG4gICAgICAgICAgY29uc3RyYWludEZpZWxkTmFtZSA9IGNhc3RUeXBlXG4gICAgICAgICAgICA/IGBDQVNUICgoJHt0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpfSkgQVMgJHtjYXN0VHlwZX0pYFxuICAgICAgICAgICAgOiB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh0eXBlb2YgcG9zdGdyZXNWYWx1ZSA9PT0gJ29iamVjdCcgJiYgcG9zdGdyZXNWYWx1ZS4kcmVsYXRpdmVUaW1lKSB7XG4gICAgICAgICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgIT09ICdEYXRlJykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICckcmVsYXRpdmVUaW1lIGNhbiBvbmx5IGJlIHVzZWQgd2l0aCBEYXRlIGZpZWxkJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcGFyc2VyUmVzdWx0ID0gVXRpbHMucmVsYXRpdmVUaW1lVG9EYXRlKHBvc3RncmVzVmFsdWUuJHJlbGF0aXZlVGltZSk7XG4gICAgICAgICAgICBpZiAocGFyc2VyUmVzdWx0LnN0YXR1cyA9PT0gJ3N1Y2Nlc3MnKSB7XG4gICAgICAgICAgICAgIHBvc3RncmVzVmFsdWUgPSB0b1Bvc3RncmVzVmFsdWUocGFyc2VyUmVzdWx0LnJlc3VsdCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB3aGlsZSBwYXJzaW5nIHJlbGF0aXZlIGRhdGUnLCBwYXJzZXJSZXN1bHQpO1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgIGBiYWQgJHJlbGF0aXZlVGltZSAoJHtwb3N0Z3Jlc1ZhbHVlLiRyZWxhdGl2ZVRpbWV9KSB2YWx1ZS4gJHtwYXJzZXJSZXN1bHQuaW5mb31gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZE5hbWUgPSBgJCR7aW5kZXgrK306bmFtZWA7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgfVxuICAgICAgICB2YWx1ZXMucHVzaChwb3N0Z3Jlc1ZhbHVlKTtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJHtjb25zdHJhaW50RmllbGROYW1lfSAke3BnQ29tcGFyYXRvcn0gJCR7aW5kZXgrK31gKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChpbml0aWFsUGF0dGVybnNMZW5ndGggPT09IHBhdHRlcm5zLmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgUG9zdGdyZXMgZG9lc24ndCBzdXBwb3J0IHRoaXMgcXVlcnkgdHlwZSB5ZXQgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX1gXG4gICAgICApO1xuICAgIH1cbiAgfVxuICB2YWx1ZXMgPSB2YWx1ZXMubWFwKHRyYW5zZm9ybVZhbHVlKTtcbiAgcmV0dXJuIHsgcGF0dGVybjogcGF0dGVybnMuam9pbignIEFORCAnKSwgdmFsdWVzLCBzb3J0cyB9O1xufTtcblxuZXhwb3J0IGNsYXNzIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIGNhblNvcnRPbkpvaW5UYWJsZXM6IGJvb2xlYW47XG4gIGVuYWJsZVNjaGVtYUhvb2tzOiBib29sZWFuO1xuXG4gIC8vIFByaXZhdGVcbiAgX2NvbGxlY3Rpb25QcmVmaXg6IHN0cmluZztcbiAgX2NsaWVudDogYW55O1xuICBfb25jaGFuZ2U6IGFueTtcbiAgX3BncDogYW55O1xuICBfc3RyZWFtOiBhbnk7XG4gIF91dWlkOiBhbnk7XG4gIHNjaGVtYUNhY2hlVHRsOiA/bnVtYmVyO1xuXG4gIGNvbnN0cnVjdG9yKHsgdXJpLCBjb2xsZWN0aW9uUHJlZml4ID0gJycsIGRhdGFiYXNlT3B0aW9ucyA9IHt9IH06IGFueSkge1xuICAgIGNvbnN0IG9wdGlvbnMgPSB7IC4uLmRhdGFiYXNlT3B0aW9ucyB9O1xuICAgIHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggPSBjb2xsZWN0aW9uUHJlZml4O1xuICAgIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MgPSAhIWRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcztcbiAgICB0aGlzLnNjaGVtYUNhY2hlVHRsID0gZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIFsnZW5hYmxlU2NoZW1hSG9va3MnLCAnc2NoZW1hQ2FjaGVUdGwnXSkge1xuICAgICAgZGVsZXRlIG9wdGlvbnNba2V5XTtcbiAgICB9XG5cbiAgICBjb25zdCB7IGNsaWVudCwgcGdwIH0gPSBjcmVhdGVDbGllbnQodXJpLCBvcHRpb25zKTtcbiAgICB0aGlzLl9jbGllbnQgPSBjbGllbnQ7XG4gICAgdGhpcy5fb25jaGFuZ2UgPSAoKSA9PiB7fTtcbiAgICB0aGlzLl9wZ3AgPSBwZ3A7XG4gICAgdGhpcy5fdXVpZCA9IHV1aWR2NCgpO1xuICAgIHRoaXMuY2FuU29ydE9uSm9pblRhYmxlcyA9IGZhbHNlO1xuICB9XG5cbiAgd2F0Y2goY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICB0aGlzLl9vbmNoYW5nZSA9IGNhbGxiYWNrO1xuICB9XG5cbiAgLy9Ob3RlIHRoYXQgYW5hbHl6ZT10cnVlIHdpbGwgcnVuIHRoZSBxdWVyeSwgZXhlY3V0aW5nIElOU0VSVFMsIERFTEVURVMsIGV0Yy5cbiAgY3JlYXRlRXhwbGFpbmFibGVRdWVyeShxdWVyeTogc3RyaW5nLCBhbmFseXplOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICBpZiAoYW5hbHl6ZSkge1xuICAgICAgcmV0dXJuICdFWFBMQUlOIChBTkFMWVpFLCBGT1JNQVQgSlNPTikgJyArIHF1ZXJ5O1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gJ0VYUExBSU4gKEZPUk1BVCBKU09OKSAnICsgcXVlcnk7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgaWYgKHRoaXMuX3N0cmVhbSkge1xuICAgICAgdGhpcy5fc3RyZWFtLmRvbmUoKTtcbiAgICAgIGRlbGV0ZSB0aGlzLl9zdHJlYW07XG4gICAgfVxuICAgIGlmICghdGhpcy5fY2xpZW50KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuX2NsaWVudC4kcG9vbC5lbmQoKTtcbiAgfVxuXG4gIGFzeW5jIF9saXN0ZW5Ub1NjaGVtYSgpIHtcbiAgICBpZiAoIXRoaXMuX3N0cmVhbSAmJiB0aGlzLmVuYWJsZVNjaGVtYUhvb2tzKSB7XG4gICAgICB0aGlzLl9zdHJlYW0gPSBhd2FpdCB0aGlzLl9jbGllbnQuY29ubmVjdCh7IGRpcmVjdDogdHJ1ZSB9KTtcbiAgICAgIHRoaXMuX3N0cmVhbS5jbGllbnQub24oJ25vdGlmaWNhdGlvbicsIGRhdGEgPT4ge1xuICAgICAgICBjb25zdCBwYXlsb2FkID0gSlNPTi5wYXJzZShkYXRhLnBheWxvYWQpO1xuICAgICAgICBpZiAocGF5bG9hZC5zZW5kZXJJZCAhPT0gdGhpcy5fdXVpZCkge1xuICAgICAgICAgIHRoaXMuX29uY2hhbmdlKCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgYXdhaXQgdGhpcy5fc3RyZWFtLm5vbmUoJ0xJU1RFTiAkMX4nLCAnc2NoZW1hLmNoYW5nZScpO1xuICAgIH1cbiAgfVxuXG4gIF9ub3RpZnlTY2hlbWFDaGFuZ2UoKSB7XG4gICAgaWYgKHRoaXMuX3N0cmVhbSkge1xuICAgICAgdGhpcy5fc3RyZWFtXG4gICAgICAgIC5ub25lKCdOT1RJRlkgJDF+LCAkMicsIFsnc2NoZW1hLmNoYW5nZScsIHsgc2VuZGVySWQ6IHRoaXMuX3V1aWQgfV0pXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgICBjb25zb2xlLmxvZygnRmFpbGVkIHRvIE5vdGlmeTonLCBlcnJvcik7IC8vIHVubGlrZWx5IHRvIGV2ZXIgaGFwcGVuXG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIF9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKGNvbm46IGFueSkge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBhd2FpdCBjb25uXG4gICAgICAubm9uZShcbiAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIFwiX1NDSEVNQVwiICggXCJjbGFzc05hbWVcIiB2YXJDaGFyKDEyMCksIFwic2NoZW1hXCIganNvbmIsIFwiaXNQYXJzZUNsYXNzXCIgYm9vbCwgUFJJTUFSWSBLRVkgKFwiY2xhc3NOYW1lXCIpICknXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5vbmUoXG4gICAgICAnU0VMRUNUIEVYSVNUUyAoU0VMRUNUIDEgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzIFdIRVJFIHRhYmxlX25hbWUgPSAkMSknLFxuICAgICAgW25hbWVdLFxuICAgICAgYSA9PiBhLmV4aXN0c1xuICAgICk7XG4gIH1cblxuICBhc3luYyBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSkge1xuICAgIGF3YWl0IHRoaXMuX2NsaWVudC50YXNrKCdzZXQtY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsICdzY2hlbWEnLCAnY2xhc3NMZXZlbFBlcm1pc3Npb25zJywgSlNPTi5zdHJpbmdpZnkoQ0xQcyldO1xuICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICBgVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDFgLFxuICAgICAgICB2YWx1ZXNcbiAgICAgICk7XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyBzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRJbmRleGVzOiBhbnksXG4gICAgZXhpc3RpbmdJbmRleGVzOiBhbnkgPSB7fSxcbiAgICBmaWVsZHM6IGFueSxcbiAgICBjb25uOiA/YW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoc3VibWl0dGVkSW5kZXhlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0luZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZXhpc3RpbmdJbmRleGVzID0geyBfaWRfOiB7IF9pZDogMSB9IH07XG4gICAgfVxuICAgIGNvbnN0IGRlbGV0ZWRJbmRleGVzID0gW107XG4gICAgY29uc3QgaW5zZXJ0ZWRJbmRleGVzID0gW107XG4gICAgT2JqZWN0LmtleXMoc3VibWl0dGVkSW5kZXhlcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksIGBJbmRleCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBkZWxldGVkSW5kZXhlcy5wdXNoKG5hbWUpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGtleSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCBjb25uLnR4KCdzZXQtaW5kZXhlcy13aXRoLXNjaGVtYS1mb3JtYXQnLCBhc3luYyB0ID0+IHtcbiAgICAgIGlmIChpbnNlcnRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBhd2FpdCBzZWxmLmNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lLCBpbnNlcnRlZEluZGV4ZXMsIHQpO1xuICAgICAgfVxuICAgICAgaWYgKGRlbGV0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgYXdhaXQgc2VsZi5kcm9wSW5kZXhlcyhjbGFzc05hbWUsIGRlbGV0ZWRJbmRleGVzLCB0KTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgJDI6bmFtZSA9IGpzb25fb2JqZWN0X3NldF9rZXkoJDI6bmFtZSwgJDM6OnRleHQsICQ0Ojpqc29uYikgV0hFUkUgXCJjbGFzc05hbWVcIiA9ICQxJyxcbiAgICAgICAgW2NsYXNzTmFtZSwgJ3NjaGVtYScsICdpbmRleGVzJywgSlNPTi5zdHJpbmdpZnkoZXhpc3RpbmdJbmRleGVzKV1cbiAgICAgICk7XG4gICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiA/YW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gYXdhaXQgY29ublxuICAgICAgLnR4KCdjcmVhdGUtY2xhc3MnLCBhc3luYyB0ID0+IHtcbiAgICAgICAgYXdhaXQgdGhpcy5jcmVhdGVUYWJsZShjbGFzc05hbWUsIHNjaGVtYSwgdCk7XG4gICAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgICAnSU5TRVJUIElOVE8gXCJfU0NIRU1BXCIgKFwiY2xhc3NOYW1lXCIsIFwic2NoZW1hXCIsIFwiaXNQYXJzZUNsYXNzXCIpIFZBTFVFUyAoJDxjbGFzc05hbWU+LCAkPHNjaGVtYT4sIHRydWUpJyxcbiAgICAgICAgICB7IGNsYXNzTmFtZSwgc2NoZW1hIH1cbiAgICAgICAgKTtcbiAgICAgICAgYXdhaXQgdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChjbGFzc05hbWUsIHNjaGVtYS5pbmRleGVzLCB7fSwgc2NoZW1hLmZpZWxkcywgdCk7XG4gICAgICAgIHJldHVybiB0b1BhcnNlU2NoZW1hKHNjaGVtYSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yICYmIGVyci5kZXRhaWwuaW5jbHVkZXMoY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfSk7XG4gICAgdGhpcy5fbm90aWZ5U2NoZW1hQ2hhbmdlKCk7XG4gICAgcmV0dXJuIHBhcnNlU2NoZW1hO1xuICB9XG5cbiAgLy8gSnVzdCBjcmVhdGUgYSB0YWJsZSwgZG8gbm90IGluc2VydCBpbiBzY2hlbWFcbiAgYXN5bmMgY3JlYXRlVGFibGUoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogYW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGRlYnVnKCdjcmVhdGVUYWJsZScpO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgY29uc3QgcGF0dGVybnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5hc3NpZ24oe30sIHNjaGVtYS5maWVsZHMpO1xuICAgIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIGZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW4gPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICBmaWVsZHMuX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fZmFpbGVkX2xvZ2luX2NvdW50ID0geyB0eXBlOiAnTnVtYmVyJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgZmllbGRzLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSB7IHR5cGU6ICdEYXRlJyB9O1xuICAgICAgZmllbGRzLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fcGFzc3dvcmRfaGlzdG9yeSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICAgIH1cbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIGNvbnN0IHJlbGF0aW9ucyA9IFtdO1xuICAgIE9iamVjdC5rZXlzKGZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgY29uc3QgcGFyc2VUeXBlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAvLyBTa2lwIHdoZW4gaXQncyBhIHJlbGF0aW9uXG4gICAgICAvLyBXZSdsbCBjcmVhdGUgdGhlIHRhYmxlcyBsYXRlclxuICAgICAgaWYgKHBhcnNlVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJlbGF0aW9ucy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICBwYXJzZVR5cGUuY29udGVudHMgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gICAgICB9XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICB2YWx1ZXNBcnJheS5wdXNoKHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHBhcnNlVHlwZSkpO1xuICAgICAgcGF0dGVybnNBcnJheS5wdXNoKGAkJHtpbmRleH06bmFtZSAkJHtpbmRleCArIDF9OnJhd2ApO1xuICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICBwYXR0ZXJuc0FycmF5LnB1c2goYFBSSU1BUlkgS0VZICgkJHtpbmRleH06bmFtZSlgKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ID0gaW5kZXggKyAyO1xuICAgIH0pO1xuICAgIGNvbnN0IHFzID0gYENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQxOm5hbWUgKCR7cGF0dGVybnNBcnJheS5qb2luKCl9KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4udmFsdWVzQXJyYXldO1xuXG4gICAgcmV0dXJuIGNvbm4udGFzaygnY3JlYXRlLXRhYmxlJywgYXN5bmMgdCA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0Lm5vbmUocXMsIHZhbHVlcyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogVGFibGUgYWxyZWFkeSBleGlzdHMsIG11c3QgaGF2ZSBiZWVuIGNyZWF0ZWQgYnkgYSBkaWZmZXJlbnQgcmVxdWVzdC4gSWdub3JlIHRoZSBlcnJvci5cbiAgICAgIH1cbiAgICAgIGF3YWl0IHQudHgoJ2NyZWF0ZS10YWJsZS10eCcsIHR4ID0+IHtcbiAgICAgICAgcmV0dXJuIHR4LmJhdGNoKFxuICAgICAgICAgIHJlbGF0aW9ucy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHJldHVybiB0eC5ub25lKFxuICAgICAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgc2NoZW1hVXBncmFkZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBkZWJ1Zygnc2NoZW1hVXBncmFkZScpO1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIGF3YWl0IGNvbm4udGFzaygnc2NoZW1hLXVwZ3JhZGUnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IGNvbHVtbnMgPSBhd2FpdCB0Lm1hcChcbiAgICAgICAgJ1NFTEVDVCBjb2x1bW5fbmFtZSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zIFdIRVJFIHRhYmxlX25hbWUgPSAkPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IGNsYXNzTmFtZSB9LFxuICAgICAgICBhID0+IGEuY29sdW1uX25hbWVcbiAgICAgICk7XG4gICAgICBjb25zdCBuZXdDb2x1bW5zID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGNvbHVtbnMuaW5kZXhPZihpdGVtKSA9PT0gLTEpXG4gICAgICAgIC5tYXAoZmllbGROYW1lID0+IHNlbGYuYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSk7XG5cbiAgICAgIGF3YWl0IHQuYmF0Y2gobmV3Q29sdW1ucyk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBhZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgLy8gVE9ETzogTXVzdCBiZSByZXZpc2VkIGZvciBpbnZhbGlkIGxvZ2ljLi4uXG4gICAgZGVidWcoJ2FkZEZpZWxkSWZOb3RFeGlzdHMnKTtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ2FkZC1maWVsZC1pZi1ub3QtZXhpc3RzJywgYXN5bmMgdCA9PiB7XG4gICAgICBpZiAodHlwZS50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICAgJ0FMVEVSIFRBQkxFICQ8Y2xhc3NOYW1lOm5hbWU+IEFERCBDT0xVTU4gSUYgTk9UIEVYSVNUUyAkPGZpZWxkTmFtZTpuYW1lPiAkPHBvc3RncmVzVHlwZTpyYXc+JyxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgICAgIHBvc3RncmVzVHlwZTogcGFyc2VUeXBlVG9Qb3N0Z3Jlc1R5cGUodHlwZSksXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4gc2VsZi5jcmVhdGVDbGFzcyhjbGFzc05hbWUsIHsgZmllbGRzOiB7IFtmaWVsZE5hbWVdOiB0eXBlIH0gfSwgdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc0R1cGxpY2F0ZUNvbHVtbkVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gQ29sdW1uIGFscmVhZHkgZXhpc3RzLCBjcmVhdGVkIGJ5IG90aGVyIHJlcXVlc3QuIENhcnJ5IG9uIHRvIHNlZSBpZiBpdCdzIHRoZSByaWdodCB0eXBlLlxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCB0Lm5vbmUoXG4gICAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTICQ8am9pblRhYmxlOm5hbWU+IChcInJlbGF0ZWRJZFwiIHZhckNoYXIoMTIwKSwgXCJvd25pbmdJZFwiIHZhckNoYXIoMTIwKSwgUFJJTUFSWSBLRVkoXCJyZWxhdGVkSWRcIiwgXCJvd25pbmdJZFwiKSApJyxcbiAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdC5hbnkoXG4gICAgICAgICdTRUxFQ1QgXCJzY2hlbWFcIiBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4gYW5kIChcInNjaGVtYVwiOjpqc29uLT5cXCdmaWVsZHNcXCctPiQ8ZmllbGROYW1lPikgaXMgbm90IG51bGwnLFxuICAgICAgICB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH1cbiAgICAgICk7XG5cbiAgICAgIGlmIChyZXN1bHRbMF0pIHtcbiAgICAgICAgdGhyb3cgJ0F0dGVtcHRlZCB0byBhZGQgYSBmaWVsZCB0aGF0IGFscmVhZHkgZXhpc3RzJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBge2ZpZWxkcywke2ZpZWxkTmFtZX19YDtcbiAgICAgICAgYXdhaXQgdC5ub25lKFxuICAgICAgICAgICdVUERBVEUgXCJfU0NIRU1BXCIgU0VUIFwic2NoZW1hXCI9anNvbmJfc2V0KFwic2NoZW1hXCIsICQ8cGF0aD4sICQ8dHlwZT4pICBXSEVSRSBcImNsYXNzTmFtZVwiPSQ8Y2xhc3NOYW1lPicsXG4gICAgICAgICAgeyBwYXRoLCB0eXBlLCBjbGFzc05hbWUgfVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50LnR4KCd1cGRhdGUtc2NoZW1hLWZpZWxkLW9wdGlvbnMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGNvbnN0IHBhdGggPSBge2ZpZWxkcywke2ZpZWxkTmFtZX19YDtcbiAgICAgIGF3YWl0IHQubm9uZShcbiAgICAgICAgJ1VQREFURSBcIl9TQ0hFTUFcIiBTRVQgXCJzY2hlbWFcIj1qc29uYl9zZXQoXCJzY2hlbWFcIiwgJDxwYXRoPiwgJDx0eXBlPikgIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDxjbGFzc05hbWU+JyxcbiAgICAgICAgeyBwYXRoLCB0eXBlLCBjbGFzc05hbWUgfVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIERyb3BzIGEgY29sbGVjdGlvbi4gUmVzb2x2ZXMgd2l0aCB0cnVlIGlmIGl0IHdhcyBhIFBhcnNlIFNjaGVtYSAoZWcuIF9Vc2VyLCBDdXN0b20sIGV0Yy4pXG4gIC8vIGFuZCByZXNvbHZlcyB3aXRoIGZhbHNlIGlmIGl0IHdhc24ndCAoZWcuIGEgam9pbiB0YWJsZSkuIFJlamVjdHMgaWYgZGVsZXRpb24gd2FzIGltcG9zc2libGUuXG4gIGFzeW5jIGRlbGV0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgb3BlcmF0aW9ucyA9IFtcbiAgICAgIHsgcXVlcnk6IGBEUk9QIFRBQkxFIElGIEVYSVNUUyAkMTpuYW1lYCwgdmFsdWVzOiBbY2xhc3NOYW1lXSB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTogYERFTEVURSBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlczogW2NsYXNzTmFtZV0sXG4gICAgICB9LFxuICAgIF07XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl9jbGllbnRcbiAgICAgIC50eCh0ID0+IHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQob3BlcmF0aW9ucykpKVxuICAgICAgLnRoZW4oKCkgPT4gY2xhc3NOYW1lLmluZGV4T2YoJ19Kb2luOicpICE9IDApOyAvLyByZXNvbHZlcyB3aXRoIGZhbHNlIHdoZW4gX0pvaW4gdGFibGVcblxuICAgIHRoaXMuX25vdGlmeVNjaGVtYUNoYW5nZSgpO1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuXG4gIC8vIERlbGV0ZSBhbGwgZGF0YSBrbm93biB0byB0aGlzIGFkYXB0ZXIuIFVzZWQgZm9yIHRlc3RpbmcuXG4gIGFzeW5jIGRlbGV0ZUFsbENsYXNzZXMoKSB7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgY29uc3QgaGVscGVycyA9IHRoaXMuX3BncC5oZWxwZXJzO1xuICAgIGRlYnVnKCdkZWxldGVBbGxDbGFzc2VzJyk7XG4gICAgaWYgKHRoaXMuX2NsaWVudD8uJHBvb2wuZW5kZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5fY2xpZW50XG4gICAgICAudGFzaygnZGVsZXRlLWFsbC1jbGFzc2VzJywgYXN5bmMgdCA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHQuYW55KCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJyk7XG4gICAgICAgICAgY29uc3Qgam9pbnMgPSByZXN1bHRzLnJlZHVjZSgobGlzdDogQXJyYXk8c3RyaW5nPiwgc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgICAgIHJldHVybiBsaXN0LmNvbmNhdChqb2luVGFibGVzRm9yU2NoZW1hKHNjaGVtYS5zY2hlbWEpKTtcbiAgICAgICAgICB9LCBbXSk7XG4gICAgICAgICAgY29uc3QgY2xhc3NlcyA9IFtcbiAgICAgICAgICAgICdfU0NIRU1BJyxcbiAgICAgICAgICAgICdfUHVzaFN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlN0YXR1cycsXG4gICAgICAgICAgICAnX0pvYlNjaGVkdWxlJyxcbiAgICAgICAgICAgICdfSG9va3MnLFxuICAgICAgICAgICAgJ19HbG9iYWxDb25maWcnLFxuICAgICAgICAgICAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgICAgICAgICAgICdfQXVkaWVuY2UnLFxuICAgICAgICAgICAgJ19JZGVtcG90ZW5jeScsXG4gICAgICAgICAgICAuLi5yZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LmNsYXNzTmFtZSksXG4gICAgICAgICAgICAuLi5qb2lucyxcbiAgICAgICAgICBdO1xuICAgICAgICAgIGNvbnN0IHF1ZXJpZXMgPSBjbGFzc2VzLm1hcChjbGFzc05hbWUgPT4gKHtcbiAgICAgICAgICAgIHF1ZXJ5OiAnRFJPUCBUQUJMRSBJRiBFWElTVFMgJDxjbGFzc05hbWU6bmFtZT4nLFxuICAgICAgICAgICAgdmFsdWVzOiB7IGNsYXNzTmFtZSB9LFxuICAgICAgICAgIH0pKTtcbiAgICAgICAgICBhd2FpdCB0LnR4KHR4ID0+IHR4Lm5vbmUoaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gTm8gX1NDSEVNQSBjb2xsZWN0aW9uLiBEb24ndCBkZWxldGUgYW55dGhpbmcuXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGRlYnVnKGBkZWxldGVBbGxDbGFzc2VzIGRvbmUgaW4gJHtuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIG5vd31gKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHRoZSBjb2x1bW4gYW5kIGFsbCB0aGUgZGF0YS4gRm9yIFJlbGF0aW9ucywgdGhlIF9Kb2luIGNvbGxlY3Rpb24gaXMgaGFuZGxlZFxuICAvLyBzcGVjaWFsbHksIHRoaXMgZnVuY3Rpb24gZG9lcyBub3QgZGVsZXRlIF9Kb2luIGNvbHVtbnMuIEl0IHNob3VsZCwgaG93ZXZlciwgaW5kaWNhdGVcbiAgLy8gdGhhdCB0aGUgcmVsYXRpb24gZmllbGRzIGRvZXMgbm90IGV4aXN0IGFueW1vcmUuIEluIG1vbmdvLCB0aGlzIG1lYW5zIHJlbW92aW5nIGl0IGZyb21cbiAgLy8gdGhlIF9TQ0hFTUEgY29sbGVjdGlvbi4gIFRoZXJlIHNob3VsZCBiZSBubyBhY3R1YWwgZGF0YSBpbiB0aGUgY29sbGVjdGlvbiB1bmRlciB0aGUgc2FtZSBuYW1lXG4gIC8vIGFzIHRoZSByZWxhdGlvbiBjb2x1bW4sIHNvIGl0J3MgZmluZSB0byBhdHRlbXB0IHRvIGRlbGV0ZSBpdC4gSWYgdGhlIGZpZWxkcyBsaXN0ZWQgdG8gYmVcbiAgLy8gZGVsZXRlZCBkbyBub3QgZXhpc3QsIHRoaXMgZnVuY3Rpb24gc2hvdWxkIHJldHVybiBzdWNjZXNzZnVsbHkgYW55d2F5cy4gQ2hlY2tpbmcgZm9yXG4gIC8vIGF0dGVtcHRzIHRvIGRlbGV0ZSBub24tZXhpc3RlbnQgZmllbGRzIGlzIHRoZSByZXNwb25zaWJpbGl0eSBvZiBQYXJzZSBTZXJ2ZXIuXG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBub3Qgb2JsaWdhdGVkIHRvIGRlbGV0ZSBmaWVsZHMgYXRvbWljYWxseS4gSXQgaXMgZ2l2ZW4gdGhlIGZpZWxkXG4gIC8vIG5hbWVzIGluIGEgbGlzdCBzbyB0aGF0IGRhdGFiYXNlcyB0aGF0IGFyZSBjYXBhYmxlIG9mIGRlbGV0aW5nIGZpZWxkcyBhdG9taWNhbGx5XG4gIC8vIG1heSBkbyBzby5cblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZS5cbiAgYXN5bmMgZGVsZXRlRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZGVidWcoJ2RlbGV0ZUZpZWxkcycpO1xuICAgIGZpZWxkTmFtZXMgPSBmaWVsZE5hbWVzLnJlZHVjZSgobGlzdDogQXJyYXk8c3RyaW5nPiwgZmllbGROYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgaWYgKGZpZWxkLnR5cGUgIT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgbGlzdC5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICB9XG4gICAgICBkZWxldGUgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuIGxpc3Q7XG4gICAgfSwgW10pO1xuXG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uZmllbGROYW1lc107XG4gICAgY29uc3QgY29sdW1ucyA9IGZpZWxkTmFtZXNcbiAgICAgIC5tYXAoKG5hbWUsIGlkeCkgPT4ge1xuICAgICAgICByZXR1cm4gYCQke2lkeCArIDJ9Om5hbWVgO1xuICAgICAgfSlcbiAgICAgIC5qb2luKCcsIERST1AgQ09MVU1OJyk7XG5cbiAgICBhd2FpdCB0aGlzLl9jbGllbnQudHgoJ2RlbGV0ZS1maWVsZHMnLCBhc3luYyB0ID0+IHtcbiAgICAgIGF3YWl0IHQubm9uZSgnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiID0gJDxzY2hlbWE+IFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkPGNsYXNzTmFtZT4nLCB7XG4gICAgICAgIHNjaGVtYSxcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgfSk7XG4gICAgICBpZiAodmFsdWVzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgYXdhaXQgdC5ub25lKGBBTFRFUiBUQUJMRSAkMTpuYW1lIERST1AgQ09MVU1OIElGIEVYSVNUUyAke2NvbHVtbnN9YCwgdmFsdWVzKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0aGlzLl9ub3RpZnlTY2hlbWFDaGFuZ2UoKTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIGFsbCBzY2hlbWFzIGtub3duIHRvIHRoaXMgYWRhcHRlciwgaW4gUGFyc2UgZm9ybWF0LiBJbiBjYXNlIHRoZVxuICAvLyBzY2hlbWFzIGNhbm5vdCBiZSByZXRyaWV2ZWQsIHJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVqZWN0cy4gUmVxdWlyZW1lbnRzIGZvciB0aGVcbiAgLy8gcmVqZWN0aW9uIHJlYXNvbiBhcmUgVEJELlxuICBhc3luYyBnZXRBbGxDbGFzc2VzKCkge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQudGFzaygnZ2V0LWFsbC1jbGFzc2VzJywgYXN5bmMgdCA9PiB7XG4gICAgICByZXR1cm4gYXdhaXQgdC5tYXAoJ1NFTEVDVCAqIEZST00gXCJfU0NIRU1BXCInLCBudWxsLCByb3cgPT5cbiAgICAgICAgdG9QYXJzZVNjaGVtYSh7IGNsYXNzTmFtZTogcm93LmNsYXNzTmFtZSwgLi4ucm93LnNjaGVtYSB9KVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybiBhIHByb21pc2UgZm9yIHRoZSBzY2hlbWEgd2l0aCB0aGUgZ2l2ZW4gbmFtZSwgaW4gUGFyc2UgZm9ybWF0LiBJZlxuICAvLyB0aGlzIGFkYXB0ZXIgZG9lc24ndCBrbm93IGFib3V0IHRoZSBzY2hlbWEsIHJldHVybiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpdGhcbiAgLy8gdW5kZWZpbmVkIGFzIHRoZSByZWFzb24uXG4gIGFzeW5jIGdldENsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgZGVidWcoJ2dldENsYXNzJyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueSgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+Jywge1xuICAgICAgICBjbGFzc05hbWUsXG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdC5sZW5ndGggIT09IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFswXS5zY2hlbWE7XG4gICAgICB9KVxuICAgICAgLnRoZW4odG9QYXJzZVNjaGVtYSk7XG4gIH1cblxuICAvLyBUT0RPOiByZW1vdmUgdGhlIG1vbmdvIGZvcm1hdCBkZXBlbmRlbmN5IGluIHRoZSByZXR1cm4gdmFsdWVcbiAgYXN5bmMgY3JlYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBkZWJ1ZygnY3JlYXRlT2JqZWN0Jyk7XG4gICAgbGV0IGNvbHVtbnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGdlb1BvaW50cyA9IHt9O1xuXG4gICAgb2JqZWN0ID0gaGFuZGxlRG90RmllbGRzKG9iamVjdCk7XG5cbiAgICB2YWxpZGF0ZUtleXMob2JqZWN0KTtcblxuICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHZhciBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBjb25zdCBhdXRoRGF0YUFscmVhZHlFeGlzdHMgPSAhIW9iamVjdC5hdXRoRGF0YTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXSA9IG9iamVjdFsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgb2JqZWN0WydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGZpZWxkTmFtZSA9ICdhdXRoRGF0YSc7XG4gICAgICAgIC8vIEF2b2lkIGFkZGluZyBhdXRoRGF0YSBtdWx0aXBsZSB0aW1lcyB0byB0aGUgcXVlcnlcbiAgICAgICAgaWYgKGF1dGhEYXRhQWxyZWFkeUV4aXN0cykge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb2x1bW5zQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19mYWlsZWRfbG9naW5fY291bnQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2hpc3RvcnknXG4gICAgICAgICkge1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcpIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzd2l0Y2ggKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlKSB7XG4gICAgICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5vYmplY3RJZCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KG9iamVjdFtmaWVsZE5hbWVdKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdPYmplY3QnOlxuICAgICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICAgIGNhc2UgJ051bWJlcic6XG4gICAgICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdGaWxlJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm5hbWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2x5Z29uJzoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChvYmplY3RbZmllbGROYW1lXS5jb29yZGluYXRlcyk7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICAgIC8vIHBvcCB0aGUgcG9pbnQgYW5kIHByb2Nlc3MgbGF0ZXJcbiAgICAgICAgICBnZW9Qb2ludHNbZmllbGROYW1lXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICAgIGNvbHVtbnNBcnJheS5wb3AoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBgVHlwZSAke3NjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlfSBub3Qgc3VwcG9ydGVkIHlldGA7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb2x1bW5zQXJyYXkgPSBjb2x1bW5zQXJyYXkuY29uY2F0KE9iamVjdC5rZXlzKGdlb1BvaW50cykpO1xuICAgIGNvbnN0IGluaXRpYWxWYWx1ZXMgPSB2YWx1ZXNBcnJheS5tYXAoKHZhbCwgaW5kZXgpID0+IHtcbiAgICAgIGxldCB0ZXJtaW5hdGlvbiA9ICcnO1xuICAgICAgY29uc3QgZmllbGROYW1lID0gY29sdW1uc0FycmF5W2luZGV4XTtcbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6OnRleHRbXSc7XG4gICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6Ompzb25iJztcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJCR7aW5kZXggKyAyICsgY29sdW1uc0FycmF5Lmxlbmd0aH0ke3Rlcm1pbmF0aW9ufWA7XG4gICAgfSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzSW5qZWN0cyA9IE9iamVjdC5rZXlzKGdlb1BvaW50cykubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGdlb1BvaW50c1trZXldO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZS5sb25naXR1ZGUsIHZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGNvbnN0IGwgPSB2YWx1ZXNBcnJheS5sZW5ndGggKyBjb2x1bW5zQXJyYXkubGVuZ3RoO1xuICAgICAgcmV0dXJuIGBQT0lOVCgkJHtsfSwgJCR7bCArIDF9KWA7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2x1bW5zUGF0dGVybiA9IGNvbHVtbnNBcnJheS5tYXAoKGNvbCwgaW5kZXgpID0+IGAkJHtpbmRleCArIDJ9Om5hbWVgKS5qb2luKCk7XG4gICAgY29uc3QgdmFsdWVzUGF0dGVybiA9IGluaXRpYWxWYWx1ZXMuY29uY2F0KGdlb1BvaW50c0luamVjdHMpLmpvaW4oKTtcblxuICAgIGNvbnN0IHFzID0gYElOU0VSVCBJTlRPICQxOm5hbWUgKCR7Y29sdW1uc1BhdHRlcm59KSBWQUxVRVMgKCR7dmFsdWVzUGF0dGVybn0pYDtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5jb2x1bW5zQXJyYXksIC4uLnZhbHVlc0FycmF5XTtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udCA6IHRoaXMuX2NsaWVudClcbiAgICAgIC5ub25lKHFzLCB2YWx1ZXMpXG4gICAgICAudGhlbigoKSA9PiAoeyBvcHM6IFtvYmplY3RdIH0pKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvcikge1xuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgZXJyLnVuZGVybHlpbmdFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGlmIChlcnJvci5jb25zdHJhaW50KSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gZXJyb3IuY29uc3RyYWludC5tYXRjaCgvdW5pcXVlXyhbYS16QS1aXSspLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2hlcyAmJiBBcnJheS5pc0FycmF5KG1hdGNoZXMpKSB7XG4gICAgICAgICAgICAgIGVyci51c2VySW5mbyA9IHsgZHVwbGljYXRlZF9maWVsZDogbWF0Y2hlc1sxXSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBlcnJvciA9IGVycjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGFzeW5jIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIGRlYnVnKCdkZWxldGVPYmplY3RzQnlRdWVyeScpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IGluZGV4ID0gMjtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcbiAgICBpZiAoT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgd2hlcmUucGF0dGVybiA9ICdUUlVFJztcbiAgICB9XG4gICAgY29uc3QgcXMgPSBgV0lUSCBkZWxldGVkIEFTIChERUxFVEUgRlJPTSAkMTpuYW1lIFdIRVJFICR7d2hlcmUucGF0dGVybn0gUkVUVVJOSU5HICopIFNFTEVDVCBjb3VudCgqKSBGUk9NIGRlbGV0ZWRgO1xuICAgIGNvbnN0IHByb21pc2UgPSAodHJhbnNhY3Rpb25hbFNlc3Npb24gPyB0cmFuc2FjdGlvbmFsU2Vzc2lvbi50IDogdGhpcy5fY2xpZW50KVxuICAgICAgLm9uZShxcywgdmFsdWVzLCBhID0+ICthLmNvdW50KVxuICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIEVMU0U6IERvbid0IGRlbGV0ZSBhbnl0aGluZyBpZiBkb2Vzbid0IGV4aXN0XG4gICAgICB9KTtcbiAgICBpZiAodHJhbnNhY3Rpb25hbFNlc3Npb24pIHtcbiAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLmJhdGNoLnB1c2gocHJvbWlzZSk7XG4gICAgfVxuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG4gIC8vIFJldHVybiB2YWx1ZSBub3QgY3VycmVudGx5IHdlbGwgc3BlY2lmaWVkLlxuICBhc3luYyBmaW5kT25lQW5kVXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgZGVidWcoJ2ZpbmRPbmVBbmRVcGRhdGUnKTtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVPYmplY3RzQnlRdWVyeShjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHVwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oXG4gICAgICB2YWwgPT4gdmFsWzBdXG4gICAgKTtcbiAgfVxuXG4gIC8vIEFwcGx5IHRoZSB1cGRhdGUgdG8gYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIGFzeW5jIHVwZGF0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICk6IFByb21pc2U8W2FueV0+IHtcbiAgICBkZWJ1ZygndXBkYXRlT2JqZWN0c0J5UXVlcnknKTtcbiAgICBjb25zdCB1cGRhdGVQYXR0ZXJucyA9IFtdO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGxldCBpbmRleCA9IDI7XG4gICAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuXG4gICAgY29uc3Qgb3JpZ2luYWxVcGRhdGUgPSB7IC4uLnVwZGF0ZSB9O1xuXG4gICAgLy8gU2V0IGZsYWcgZm9yIGRvdCBub3RhdGlvbiBmaWVsZHNcbiAgICBjb25zdCBkb3ROb3RhdGlvbk9wdGlvbnMgPSB7fTtcbiAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gLTEpIHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IGZpZWxkTmFtZS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBmaXJzdCA9IGNvbXBvbmVudHMuc2hpZnQoKTtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpcnN0XSA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHVwZGF0ZSA9IGhhbmRsZURvdEZpZWxkcyh1cGRhdGUpO1xuICAgIC8vIFJlc29sdmUgYXV0aERhdGEgZmlyc3QsXG4gICAgLy8gU28gd2UgZG9uJ3QgZW5kIHVwIHdpdGggbXVsdGlwbGUga2V5IHVwZGF0ZXNcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiB1cGRhdGUpIHtcbiAgICAgIGNvbnN0IGF1dGhEYXRhTWF0Y2ggPSBmaWVsZE5hbWUubWF0Y2goL15fYXV0aF9kYXRhXyhbYS16QS1aMC05X10rKSQvKTtcbiAgICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAgIHZhciBwcm92aWRlciA9IGF1dGhEYXRhTWF0Y2hbMV07XG4gICAgICAgIGNvbnN0IHZhbHVlID0gdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIGRlbGV0ZSB1cGRhdGVbZmllbGROYW1lXTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddID0gdXBkYXRlWydhdXRoRGF0YSddIHx8IHt9O1xuICAgICAgICB1cGRhdGVbJ2F1dGhEYXRhJ11bcHJvdmlkZXJdID0gdmFsdWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBmaWVsZFZhbHVlID0gdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAvLyBEcm9wIGFueSB1bmRlZmluZWQgdmFsdWVzLlxuICAgICAgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PSAnYXV0aERhdGEnKSB7XG4gICAgICAgIC8vIFRoaXMgcmVjdXJzaXZlbHkgc2V0cyB0aGUganNvbl9vYmplY3RcbiAgICAgICAgLy8gT25seSAxIGxldmVsIGRlZXBcbiAgICAgICAgY29uc3QgZ2VuZXJhdGUgPSAoanNvbmI6IHN0cmluZywga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpID0+IHtcbiAgICAgICAgICByZXR1cm4gYGpzb25fb2JqZWN0X3NldF9rZXkoQ09BTEVTQ0UoJHtqc29uYn0sICd7fSc6Ompzb25iKSwgJHtrZXl9LCAke3ZhbHVlfSk6Ompzb25iYDtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3QgbGFzdEtleSA9IGAkJHtpbmRleH06bmFtZWA7XG4gICAgICAgIGNvbnN0IGZpZWxkTmFtZUluZGV4ID0gaW5kZXg7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGNvbnN0IHVwZGF0ZSA9IE9iamVjdC5rZXlzKGZpZWxkVmFsdWUpLnJlZHVjZSgobGFzdEtleTogc3RyaW5nLCBrZXk6IHN0cmluZykgPT4ge1xuICAgICAgICAgIGNvbnN0IHN0ciA9IGdlbmVyYXRlKGxhc3RLZXksIGAkJHtpbmRleH06OnRleHRgLCBgJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgIGxldCB2YWx1ZSA9IGZpZWxkVmFsdWVba2V5XTtcbiAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgICB2YWx1ZSA9IG51bGw7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB2YWx1ZSA9IEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsdWVzLnB1c2goa2V5LCB2YWx1ZSk7XG4gICAgICAgICAgcmV0dXJuIHN0cjtcbiAgICAgICAgfSwgbGFzdEtleSk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2ZpZWxkTmFtZUluZGV4fTpuYW1lID0gJHt1cGRhdGV9YCk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0luY3JlbWVudCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgMCkgKyAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5hbW91bnQpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdBZGQnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfYWRkKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke2luZGV4ICsgMX06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBudWxsKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnUmVtb3ZlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X3JlbW92ZShDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtcbiAgICAgICAgICAgIGluZGV4ICsgMVxuICAgICAgICAgIH06Ompzb25iKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlLm9iamVjdHMpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkVW5pcXVlJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZF91bmlxdWUoQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICdbXSc6Ompzb25iKSwgJCR7XG4gICAgICAgICAgICBpbmRleCArIDFcbiAgICAgICAgICB9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgLy9UT0RPOiBzdG9wIHNwZWNpYWwgY2FzaW5nIHRoaXMuIEl0IHNob3VsZCBjaGVjayBmb3IgX190eXBlID09PSAnRGF0ZScgYW5kIHVzZSAuaXNvXG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUubG9uZ2l0dWRlLCBmaWVsZFZhbHVlLmxhdGl0dWRlKTtcbiAgICAgICAgaW5kZXggKz0gMztcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGNvbnZlcnRQb2x5Z29uVG9TUUwoZmllbGRWYWx1ZS5jb29yZGluYXRlcyk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHZhbHVlKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgLy8gbm9vcFxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnT2JqZWN0J1xuICAgICAgKSB7XG4gICAgICAgIC8vIEdhdGhlciBrZXlzIHRvIGluY3JlbWVudFxuICAgICAgICBjb25zdCBrZXlzVG9JbmNyZW1lbnQgPSBPYmplY3Qua2V5cyhvcmlnaW5hbFVwZGF0ZSlcbiAgICAgICAgICAuZmlsdGVyKGsgPT4ge1xuICAgICAgICAgICAgLy8gY2hvb3NlIHRvcCBsZXZlbCBmaWVsZHMgdGhhdCBoYXZlIGEgZGVsZXRlIG9wZXJhdGlvbiBzZXRcbiAgICAgICAgICAgIC8vIE5vdGUgdGhhdCBPYmplY3Qua2V5cyBpcyBpdGVyYXRpbmcgb3ZlciB0aGUgKipvcmlnaW5hbCoqIHVwZGF0ZSBvYmplY3RcbiAgICAgICAgICAgIC8vIGFuZCB0aGF0IHNvbWUgb2YgdGhlIGtleXMgb2YgdGhlIG9yaWdpbmFsIHVwZGF0ZSBjb3VsZCBiZSBudWxsIG9yIHVuZGVmaW5lZDpcbiAgICAgICAgICAgIC8vIChTZWUgdGhlIGFib3ZlIGNoZWNrIGBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCB8fCB0eXBlb2YgZmllbGRWYWx1ZSA9PSBcInVuZGVmaW5lZFwiKWApXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IG9yaWdpbmFsVXBkYXRlW2tdO1xuICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgICAgICAgdmFsdWUuX19vcCA9PT0gJ0luY3JlbWVudCcgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpLmxlbmd0aCA9PT0gMiAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJylbMF0gPT09IGZpZWxkTmFtZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5tYXAoayA9PiBrLnNwbGl0KCcuJylbMV0pO1xuXG4gICAgICAgIGxldCBpbmNyZW1lbnRQYXR0ZXJucyA9ICcnO1xuICAgICAgICBpZiAoa2V5c1RvSW5jcmVtZW50Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBpbmNyZW1lbnRQYXR0ZXJucyA9XG4gICAgICAgICAgICAnIHx8ICcgK1xuICAgICAgICAgICAga2V5c1RvSW5jcmVtZW50XG4gICAgICAgICAgICAgIC5tYXAoYyA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYW1vdW50ID0gZmllbGRWYWx1ZVtjXS5hbW91bnQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBDT05DQVQoJ3tcIiR7Y31cIjonLCBDT0FMRVNDRSgkJHtpbmRleH06bmFtZS0+Picke2N9JywnMCcpOjppbnQgKyAke2Ftb3VudH0sICd9Jyk6Ompzb25iYDtcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgLmpvaW4oJyB8fCAnKTtcbiAgICAgICAgICAvLyBTdHJpcCB0aGUga2V5c1xuICAgICAgICAgIGtleXNUb0luY3JlbWVudC5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgICBkZWxldGUgZmllbGRWYWx1ZVtrZXldO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qga2V5c1RvRGVsZXRlOiBBcnJheTxzdHJpbmc+ID0gT2JqZWN0LmtleXMob3JpZ2luYWxVcGRhdGUpXG4gICAgICAgICAgLmZpbHRlcihrID0+IHtcbiAgICAgICAgICAgIC8vIGNob29zZSB0b3AgbGV2ZWwgZmllbGRzIHRoYXQgaGF2ZSBhIGRlbGV0ZSBvcGVyYXRpb24gc2V0LlxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcmlnaW5hbFVwZGF0ZVtrXTtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHZhbHVlICYmXG4gICAgICAgICAgICAgIHZhbHVlLl9fb3AgPT09ICdEZWxldGUnICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpWzBdID09PSBmaWVsZE5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGsgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBjb25zdCBkZWxldGVQYXR0ZXJucyA9IGtleXNUb0RlbGV0ZS5yZWR1Y2UoKHA6IHN0cmluZywgYzogc3RyaW5nLCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgICByZXR1cm4gcCArIGAgLSAnJCR7aW5kZXggKyAxICsgaX06dmFsdWUnYDtcbiAgICAgICAgfSwgJycpO1xuICAgICAgICAvLyBPdmVycmlkZSBPYmplY3RcbiAgICAgICAgbGV0IHVwZGF0ZU9iamVjdCA9IFwiJ3t9Jzo6anNvbmJcIjtcblxuICAgICAgICBpZiAoZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAvLyBNZXJnZSBPYmplY3RcbiAgICAgICAgICB1cGRhdGVPYmplY3QgPSBgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUsICd7fSc6Ompzb25iKWA7XG4gICAgICAgIH1cbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSAoJHt1cGRhdGVPYmplY3R9ICR7ZGVsZXRlUGF0dGVybnN9ICR7aW5jcmVtZW50UGF0dGVybnN9IHx8ICQke1xuICAgICAgICAgICAgaW5kZXggKyAxICsga2V5c1RvRGVsZXRlLmxlbmd0aFxuICAgICAgICAgIH06Ompzb25iIClgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgLi4ua2V5c1RvRGVsZXRlLCBKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKSk7XG4gICAgICAgIGluZGV4ICs9IDIgKyBrZXlzVG9EZWxldGUubGVuZ3RoO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlKSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSdcbiAgICAgICkge1xuICAgICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSBwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZShzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pO1xuICAgICAgICBpZiAoZXhwZWN0ZWRUeXBlID09PSAndGV4dFtdJykge1xuICAgICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfTo6dGV4dFtdYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfTo6anNvbmJgKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWJ1ZygnTm90IHN1cHBvcnRlZCB1cGRhdGUnLCB7IGZpZWxkTmFtZSwgZmllbGRWYWx1ZSB9KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICBgUG9zdGdyZXMgZG9lc24ndCBzdXBwb3J0IHVwZGF0ZSAke0pTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpfSB5ZXRgXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBpbmRleCxcbiAgICAgIHF1ZXJ5LFxuICAgICAgY2FzZUluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVDbGF1c2UgPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBjb25zdCBxcyA9IGBVUERBVEUgJDE6bmFtZSBTRVQgJHt1cGRhdGVQYXR0ZXJucy5qb2luKCl9ICR7d2hlcmVDbGF1c2V9IFJFVFVSTklORyAqYDtcbiAgICBjb25zdCBwcm9taXNlID0gKHRyYW5zYWN0aW9uYWxTZXNzaW9uID8gdHJhbnNhY3Rpb25hbFNlc3Npb24udCA6IHRoaXMuX2NsaWVudCkuYW55KHFzLCB2YWx1ZXMpO1xuICAgIGlmICh0cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChwcm9taXNlKTtcbiAgICB9XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICAvLyBIb3BlZnVsbHksIHdlIGNhbiBnZXQgcmlkIG9mIHRoaXMuIEl0J3Mgb25seSB1c2VkIGZvciBjb25maWcgYW5kIGhvb2tzLlxuICB1cHNlcnRPbmVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnksXG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb246ID9hbnlcbiAgKSB7XG4gICAgZGVidWcoJ3Vwc2VydE9uZU9iamVjdCcpO1xuICAgIGNvbnN0IGNyZWF0ZVZhbHVlID0gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlT2JqZWN0KGNsYXNzTmFtZSwgc2NoZW1hLCBjcmVhdGVWYWx1ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIC8vIGlnbm9yZSBkdXBsaWNhdGUgdmFsdWUgZXJyb3JzIGFzIGl0J3MgdXBzZXJ0XG4gICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMuZmluZE9uZUFuZFVwZGF0ZShjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHVwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pO1xuICAgIH0pO1xuICB9XG5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB7IHNraXAsIGxpbWl0LCBzb3J0LCBrZXlzLCBjYXNlSW5zZW5zaXRpdmUsIGV4cGxhaW4gfTogUXVlcnlPcHRpb25zXG4gICkge1xuICAgIGRlYnVnKCdmaW5kJyk7XG4gICAgY29uc3QgaGFzTGltaXQgPSBsaW1pdCAhPT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGhhc1NraXAgPSBza2lwICE9PSB1bmRlZmluZWQ7XG4gICAgbGV0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7XG4gICAgICBzY2hlbWEsXG4gICAgICBxdWVyeSxcbiAgICAgIGluZGV4OiAyLFxuICAgICAgY2FzZUluc2Vuc2l0aXZlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID0gd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgbGltaXRQYXR0ZXJuID0gaGFzTGltaXQgPyBgTElNSVQgJCR7dmFsdWVzLmxlbmd0aCArIDF9YCA6ICcnO1xuICAgIGlmIChoYXNMaW1pdCkge1xuICAgICAgdmFsdWVzLnB1c2gobGltaXQpO1xuICAgIH1cbiAgICBjb25zdCBza2lwUGF0dGVybiA9IGhhc1NraXAgPyBgT0ZGU0VUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzU2tpcCkge1xuICAgICAgdmFsdWVzLnB1c2goc2tpcCk7XG4gICAgfVxuXG4gICAgbGV0IHNvcnRQYXR0ZXJuID0gJyc7XG4gICAgaWYgKHNvcnQpIHtcbiAgICAgIGNvbnN0IHNvcnRDb3B5OiBhbnkgPSBzb3J0O1xuICAgICAgY29uc3Qgc29ydGluZyA9IE9iamVjdC5rZXlzKHNvcnQpXG4gICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICBjb25zdCB0cmFuc2Zvcm1LZXkgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhrZXkpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgLy8gVXNpbmcgJGlkeCBwYXR0ZXJuIGdpdmVzOiAgbm9uLWludGVnZXIgY29uc3RhbnQgaW4gT1JERVIgQllcbiAgICAgICAgICBpZiAoc29ydENvcHlba2V5XSA9PT0gMSkge1xuICAgICAgICAgICAgcmV0dXJuIGAke3RyYW5zZm9ybUtleX0gQVNDYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAke3RyYW5zZm9ybUtleX0gREVTQ2A7XG4gICAgICAgIH0pXG4gICAgICAgIC5qb2luKCk7XG4gICAgICBzb3J0UGF0dGVybiA9IHNvcnQgIT09IHVuZGVmaW5lZCAmJiBPYmplY3Qua2V5cyhzb3J0KS5sZW5ndGggPiAwID8gYE9SREVSIEJZICR7c29ydGluZ31gIDogJyc7XG4gICAgfVxuICAgIGlmICh3aGVyZS5zb3J0cyAmJiBPYmplY3Qua2V5cygod2hlcmUuc29ydHM6IGFueSkpLmxlbmd0aCA+IDApIHtcbiAgICAgIHNvcnRQYXR0ZXJuID0gYE9SREVSIEJZICR7d2hlcmUuc29ydHMuam9pbigpfWA7XG4gICAgfVxuXG4gICAgbGV0IGNvbHVtbnMgPSAnKic7XG4gICAgaWYgKGtleXMpIHtcbiAgICAgIC8vIEV4Y2x1ZGUgZW1wdHkga2V5c1xuICAgICAgLy8gUmVwbGFjZSBBQ0wgYnkgaXQncyBrZXlzXG4gICAgICBrZXlzID0ga2V5cy5yZWR1Y2UoKG1lbW8sIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5ID09PSAnQUNMJykge1xuICAgICAgICAgIG1lbW8ucHVzaCgnX3JwZXJtJyk7XG4gICAgICAgICAgbWVtby5wdXNoKCdfd3Blcm0nKTtcbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBrZXkubGVuZ3RoID4gMCAmJlxuICAgICAgICAgIC8vIFJlbW92ZSBzZWxlY3RlZCBmaWVsZCBub3QgcmVmZXJlbmNlZCBpbiB0aGUgc2NoZW1hXG4gICAgICAgICAgLy8gUmVsYXRpb24gaXMgbm90IGEgY29sdW1uIGluIHBvc3RncmVzXG4gICAgICAgICAgLy8gJHNjb3JlIGlzIGEgUGFyc2Ugc3BlY2lhbCBmaWVsZCBhbmQgaXMgYWxzbyBub3QgYSBjb2x1bW5cbiAgICAgICAgICAoKHNjaGVtYS5maWVsZHNba2V5XSAmJiBzY2hlbWEuZmllbGRzW2tleV0udHlwZSAhPT0gJ1JlbGF0aW9uJykgfHwga2V5ID09PSAnJHNjb3JlJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgbWVtby5wdXNoKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LCBbXSk7XG4gICAgICBjb2x1bW5zID0ga2V5c1xuICAgICAgICAubWFwKChrZXksIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGtleSA9PT0gJyRzY29yZScpIHtcbiAgICAgICAgICAgIHJldHVybiBgdHNfcmFua19jZCh0b190c3ZlY3RvcigkJHsyfSwgJCR7M306bmFtZSksIHRvX3RzcXVlcnkoJCR7NH0sICQkezV9KSwgMzIpIGFzIHNjb3JlYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAkJHtpbmRleCArIHZhbHVlcy5sZW5ndGggKyAxfTpuYW1lYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHZhbHVlcyA9IHZhbHVlcy5jb25jYXQoa2V5cyk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IGBTRUxFQ1QgJHtjb2x1bW5zfSBGUk9NICQxOm5hbWUgJHt3aGVyZVBhdHRlcm59ICR7c29ydFBhdHRlcm59ICR7bGltaXRQYXR0ZXJufSAke3NraXBQYXR0ZXJufWA7XG4gICAgY29uc3QgcXMgPSBleHBsYWluID8gdGhpcy5jcmVhdGVFeHBsYWluYWJsZVF1ZXJ5KG9yaWdpbmFsUXVlcnkpIDogb3JpZ2luYWxRdWVyeTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KHFzLCB2YWx1ZXMpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBRdWVyeSBvbiBub24gZXhpc3RpbmcgdGFibGUsIGRvbid0IGNyYXNoXG4gICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW107XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdHMubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIENvbnZlcnRzIGZyb20gYSBwb3N0Z3Jlcy1mb3JtYXQgb2JqZWN0IHRvIGEgUkVTVC1mb3JtYXQgb2JqZWN0LlxuICAvLyBEb2VzIG5vdCBzdHJpcCBvdXQgYW55dGhpbmcgYmFzZWQgb24gYSBsYWNrIG9mIGF1dGhlbnRpY2F0aW9uLlxuICBwb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBzY2hlbWE6IGFueSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInICYmIG9iamVjdFtmaWVsZE5hbWVdKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIG9iamVjdElkOiBvYmplY3RbZmllbGROYW1lXSxcbiAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnR2VvUG9pbnQnLFxuICAgICAgICAgIGxhdGl0dWRlOiBvYmplY3RbZmllbGROYW1lXS55LFxuICAgICAgICAgIGxvbmdpdHVkZTogb2JqZWN0W2ZpZWxkTmFtZV0ueCxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICAgIGxldCBjb29yZHMgPSBuZXcgU3RyaW5nKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgICAgY29vcmRzID0gY29vcmRzLnN1YnN0cmluZygyLCBjb29yZHMubGVuZ3RoIC0gMikuc3BsaXQoJyksKCcpO1xuICAgICAgICBjb25zdCB1cGRhdGVkQ29vcmRzID0gY29vcmRzLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgcmV0dXJuIFtwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMV0pLCBwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMF0pXTtcbiAgICAgICAgfSk7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ1BvbHlnb24nLFxuICAgICAgICAgIGNvb3JkaW5hdGVzOiB1cGRhdGVkQ29vcmRzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnRmlsZScpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICAgICAgbmFtZTogb2JqZWN0W2ZpZWxkTmFtZV0sXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgLy9UT0RPOiByZW1vdmUgdGhpcyByZWxpYW5jZSBvbiB0aGUgbW9uZ28gZm9ybWF0LiBEQiBhZGFwdGVyIHNob3VsZG4ndCBrbm93IHRoZXJlIGlzIGEgZGlmZmVyZW5jZSBiZXR3ZWVuIGNyZWF0ZWQgYXQgYW5kIGFueSBvdGhlciBkYXRlIGZpZWxkLlxuICAgIGlmIChvYmplY3QuY3JlYXRlZEF0KSB7XG4gICAgICBvYmplY3QuY3JlYXRlZEF0ID0gb2JqZWN0LmNyZWF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LnVwZGF0ZWRBdCkge1xuICAgICAgb2JqZWN0LnVwZGF0ZWRBdCA9IG9iamVjdC51cGRhdGVkQXQudG9JU09TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5leHBpcmVzQXQpIHtcbiAgICAgIG9iamVjdC5leHBpcmVzQXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5leHBpcmVzQXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQpIHtcbiAgICAgIG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSBudWxsKSB7XG4gICAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgICAgaXNvOiBvYmplY3RbZmllbGROYW1lXS50b0lTT1N0cmluZygpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICAvLyBDcmVhdGUgYSB1bmlxdWUgaW5kZXguIFVuaXF1ZSBpbmRleGVzIG9uIG51bGxhYmxlIGZpZWxkcyBhcmUgbm90IGFsbG93ZWQuIFNpbmNlIHdlIGRvbid0XG4gIC8vIGN1cnJlbnRseSBrbm93IHdoaWNoIGZpZWxkcyBhcmUgbnVsbGFibGUgYW5kIHdoaWNoIGFyZW4ndCwgd2UgaWdub3JlIHRoYXQgY3JpdGVyaWEuXG4gIC8vIEFzIHN1Y2gsIHdlIHNob3VsZG4ndCBleHBvc2UgdGhpcyBmdW5jdGlvbiB0byB1c2VycyBvZiBwYXJzZSB1bnRpbCB3ZSBoYXZlIGFuIG91dC1vZi1iYW5kXG4gIC8vIFdheSBvZiBkZXRlcm1pbmluZyBpZiBhIGZpZWxkIGlzIG51bGxhYmxlLiBVbmRlZmluZWQgZG9lc24ndCBjb3VudCBhZ2FpbnN0IHVuaXF1ZW5lc3MsXG4gIC8vIHdoaWNoIGlzIHdoeSB3ZSB1c2Ugc3BhcnNlIGluZGV4ZXMuXG4gIGFzeW5jIGVuc3VyZVVuaXF1ZW5lc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgZmllbGROYW1lczogc3RyaW5nW10pIHtcbiAgICBjb25zdCBjb25zdHJhaW50TmFtZSA9IGAke2NsYXNzTmFtZX1fdW5pcXVlXyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgY29uc3RyYWludFBhdHRlcm5zID0gZmllbGROYW1lcy5tYXAoKGZpZWxkTmFtZSwgaW5kZXgpID0+IGAkJHtpbmRleCArIDN9Om5hbWVgKTtcbiAgICBjb25zdCBxcyA9IGBDUkVBVEUgVU5JUVVFIElOREVYIElGIE5PVCBFWElTVFMgJDI6bmFtZSBPTiAkMTpuYW1lKCR7Y29uc3RyYWludFBhdHRlcm5zLmpvaW4oKX0pYDtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50Lm5vbmUocXMsIFtjbGFzc05hbWUsIGNvbnN0cmFpbnROYW1lLCAuLi5maWVsZE5hbWVzXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGNvbnN0cmFpbnROYW1lKSkge1xuICAgICAgICAvLyBJbmRleCBhbHJlYWR5IGV4aXN0cy4gSWdub3JlIGVycm9yLlxuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yICYmXG4gICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gQ2FzdCB0aGUgZXJyb3IgaW50byB0aGUgcHJvcGVyIHBhcnNlIGVycm9yXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGVzIGEgY291bnQuXG4gIGFzeW5jIGNvdW50KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHJlYWRQcmVmZXJlbmNlPzogc3RyaW5nLFxuICAgIGVzdGltYXRlPzogYm9vbGVhbiA9IHRydWVcbiAgKSB7XG4gICAgZGVidWcoJ2NvdW50Jyk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDIsXG4gICAgICBjYXNlSW5zZW5zaXRpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIHZhbHVlcy5wdXNoKC4uLndoZXJlLnZhbHVlcyk7XG5cbiAgICBjb25zdCB3aGVyZVBhdHRlcm4gPSB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBsZXQgcXMgPSAnJztcblxuICAgIGlmICh3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgfHwgIWVzdGltYXRlKSB7XG4gICAgICBxcyA9IGBTRUxFQ1QgY291bnQoKikgRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHFzID0gJ1NFTEVDVCByZWx0dXBsZXMgQVMgYXBwcm94aW1hdGVfcm93X2NvdW50IEZST00gcGdfY2xhc3MgV0hFUkUgcmVsbmFtZSA9ICQxJztcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4ge1xuICAgICAgICBpZiAoYS5hcHByb3hpbWF0ZV9yb3dfY291bnQgPT0gbnVsbCB8fCBhLmFwcHJveGltYXRlX3Jvd19jb3VudCA9PSAtMSkge1xuICAgICAgICAgIHJldHVybiAhaXNOYU4oK2EuY291bnQpID8gK2EuY291bnQgOiAwO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiArYS5hcHByb3hpbWF0ZV9yb3dfY291bnQ7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGRpc3RpbmN0KGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIHF1ZXJ5OiBRdWVyeVR5cGUsIGZpZWxkTmFtZTogc3RyaW5nKSB7XG4gICAgZGVidWcoJ2Rpc3RpbmN0Jyk7XG4gICAgbGV0IGZpZWxkID0gZmllbGROYW1lO1xuICAgIGxldCBjb2x1bW4gPSBmaWVsZE5hbWU7XG4gICAgY29uc3QgaXNOZXN0ZWQgPSBmaWVsZE5hbWUuaW5kZXhPZignLicpID49IDA7XG4gICAgaWYgKGlzTmVzdGVkKSB7XG4gICAgICBmaWVsZCA9IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzKGZpZWxkTmFtZSkuam9pbignLT4nKTtcbiAgICAgIGNvbHVtbiA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xuICAgIH1cbiAgICBjb25zdCBpc0FycmF5RmllbGQgPVxuICAgICAgc2NoZW1hLmZpZWxkcyAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSc7XG4gICAgY29uc3QgaXNQb2ludGVyRmllbGQgPVxuICAgICAgc2NoZW1hLmZpZWxkcyAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJztcbiAgICBjb25zdCB2YWx1ZXMgPSBbZmllbGQsIGNvbHVtbiwgY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogNCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9IHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gaXNBcnJheUZpZWxkID8gJ2pzb25iX2FycmF5X2VsZW1lbnRzJyA6ICdPTic7XG4gICAgbGV0IHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpuYW1lKSAkMjpuYW1lIEZST00gJDM6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIGlmIChpc05lc3RlZCkge1xuICAgICAgcXMgPSBgU0VMRUNUIERJU1RJTkNUICR7dHJhbnNmb3JtZXJ9KCQxOnJhdykgJDI6cmF3IEZST00gJDM6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KHFzLCB2YWx1ZXMpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmICghaXNOZXN0ZWQpIHtcbiAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIob2JqZWN0ID0+IG9iamVjdFtmaWVsZF0gIT09IG51bGwpO1xuICAgICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgICByZXR1cm4gb2JqZWN0W2ZpZWxkXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZF0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNoaWxkID0gZmllbGROYW1lLnNwbGl0KCcuJylbMV07XG4gICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4gb2JqZWN0W2NvbHVtbl1bY2hpbGRdKTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+XG4gICAgICAgIHJlc3VsdHMubWFwKG9iamVjdCA9PiB0aGlzLnBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKSlcbiAgICAgICk7XG4gIH1cblxuICBhc3luYyBhZ2dyZWdhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBhbnksXG4gICAgcGlwZWxpbmU6IGFueSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBoaW50OiA/bWl4ZWQsXG4gICAgZXhwbGFpbj86IGJvb2xlYW5cbiAgKSB7XG4gICAgZGVidWcoJ2FnZ3JlZ2F0ZScpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGxldCBpbmRleDogbnVtYmVyID0gMjtcbiAgICBsZXQgY29sdW1uczogc3RyaW5nW10gPSBbXTtcbiAgICBsZXQgY291bnRGaWVsZCA9IG51bGw7XG4gICAgbGV0IGdyb3VwVmFsdWVzID0gbnVsbDtcbiAgICBsZXQgd2hlcmVQYXR0ZXJuID0gJyc7XG4gICAgbGV0IGxpbWl0UGF0dGVybiA9ICcnO1xuICAgIGxldCBza2lwUGF0dGVybiA9ICcnO1xuICAgIGxldCBzb3J0UGF0dGVybiA9ICcnO1xuICAgIGxldCBncm91cFBhdHRlcm4gPSAnJztcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBpcGVsaW5lLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBzdGFnZSA9IHBpcGVsaW5lW2ldO1xuICAgICAgaWYgKHN0YWdlLiRncm91cCkge1xuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRncm91cCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJGdyb3VwW2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ19pZCcgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiB2YWx1ZSAhPT0gJycpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWUgQVMgXCJvYmplY3RJZFwiYCk7XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9Om5hbWVgO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGZpZWxkID09PSAnX2lkJyAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIE9iamVjdC5rZXlzKHZhbHVlKS5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICAgIGdyb3VwVmFsdWVzID0gdmFsdWU7XG4gICAgICAgICAgICBjb25zdCBncm91cEJ5RmllbGRzID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGFsaWFzIGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWVbYWxpYXNdID09PSAnc3RyaW5nJyAmJiB2YWx1ZVthbGlhc10pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc10pO1xuICAgICAgICAgICAgICAgIGlmICghZ3JvdXBCeUZpZWxkcy5pbmNsdWRlcyhgXCIke3NvdXJjZX1cImApKSB7XG4gICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goc291cmNlLCBhbGlhcyk7XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9wZXJhdGlvbiA9IE9iamVjdC5rZXlzKHZhbHVlW2FsaWFzXSlbMF07XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gdHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWVbYWxpYXNdW29wZXJhdGlvbl0pO1xuICAgICAgICAgICAgICAgIGlmIChtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXSkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFncm91cEJ5RmllbGRzLmluY2x1ZGVzKGBcIiR7c291cmNlfVwiYCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXBCeUZpZWxkcy5wdXNoKGBcIiR7c291cmNlfVwiYCk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goXG4gICAgICAgICAgICAgICAgICAgIGBFWFRSQUNUKCR7XG4gICAgICAgICAgICAgICAgICAgICAgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl1cbiAgICAgICAgICAgICAgICAgICAgfSBGUk9NICQke2luZGV4fTpuYW1lIEFUIFRJTUUgWk9ORSAnVVRDJyk6OmludGVnZXIgQVMgJCR7aW5kZXggKyAxfTpuYW1lYFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHNvdXJjZSwgYWxpYXMpO1xuICAgICAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06cmF3YDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGdyb3VwQnlGaWVsZHMuam9pbigpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZS4kc3VtKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUuJHN1bSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYFNVTSgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJHN1bSksIGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvdW50RmllbGQgPSBmaWVsZDtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYENPVU5UKCopIEFTICQke2luZGV4fTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQpO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kbWF4KSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgTUFYKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJG1heCksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kbWluKSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgTUlOKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJG1pbiksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kYXZnKSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgQVZHKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJGF2ZyksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbHVtbnMucHVzaCgnKicpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgIGlmIChjb2x1bW5zLmluY2x1ZGVzKCcqJykpIHtcbiAgICAgICAgICBjb2x1bW5zID0gW107XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJHByb2plY3RbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gMSB8fCB2YWx1ZSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgY29uc3QgcGF0dGVybnMgPSBbXTtcbiAgICAgICAgY29uc3Qgb3JPckFuZCA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzdGFnZS4kbWF0Y2gsICckb3InKVxuICAgICAgICAgID8gJyBPUiAnXG4gICAgICAgICAgOiAnIEFORCAnO1xuXG4gICAgICAgIGlmIChzdGFnZS4kbWF0Y2guJG9yKSB7XG4gICAgICAgICAgY29uc3QgY29sbGFwc2UgPSB7fTtcbiAgICAgICAgICBzdGFnZS4kbWF0Y2guJG9yLmZvckVhY2goZWxlbWVudCA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBlbGVtZW50KSB7XG4gICAgICAgICAgICAgIGNvbGxhcHNlW2tleV0gPSBlbGVtZW50W2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoID0gY29sbGFwc2U7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChsZXQgZmllbGQgaW4gc3RhZ2UuJG1hdGNoKSB7XG4gICAgICAgICAgY29uc3QgdmFsdWUgPSBzdGFnZS4kbWF0Y2hbZmllbGRdO1xuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ19pZCcpIHtcbiAgICAgICAgICAgIGZpZWxkID0gJ29iamVjdElkJztcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgbWF0Y2hQYXR0ZXJucyA9IFtdO1xuICAgICAgICAgIE9iamVjdC5rZXlzKFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcikuZm9yRWFjaChjbXAgPT4ge1xuICAgICAgICAgICAgaWYgKHZhbHVlW2NtcF0pIHtcbiAgICAgICAgICAgICAgY29uc3QgcGdDb21wYXJhdG9yID0gUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yW2NtcF07XG4gICAgICAgICAgICAgIG1hdGNoUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQsIHRvUG9zdGdyZXNWYWx1ZSh2YWx1ZVtjbXBdKSk7XG4gICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgaWYgKG1hdGNoUGF0dGVybnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgKCR7bWF0Y2hQYXR0ZXJucy5qb2luKCcgQU5EICcpfSlgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgJiYgbWF0Y2hQYXR0ZXJucy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQsIHZhbHVlKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHdoZXJlUGF0dGVybiA9IHBhdHRlcm5zLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHtwYXR0ZXJucy5qb2luKGAgJHtvck9yQW5kfSBgKX1gIDogJyc7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJGxpbWl0KSB7XG4gICAgICAgIGxpbWl0UGF0dGVybiA9IGBMSU1JVCAkJHtpbmRleH1gO1xuICAgICAgICB2YWx1ZXMucHVzaChzdGFnZS4kbGltaXQpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRza2lwKSB7XG4gICAgICAgIHNraXBQYXR0ZXJuID0gYE9GRlNFVCAkJHtpbmRleH1gO1xuICAgICAgICB2YWx1ZXMucHVzaChzdGFnZS4kc2tpcCk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc3RhZ2UuJHNvcnQpIHtcbiAgICAgICAgY29uc3Qgc29ydCA9IHN0YWdlLiRzb3J0O1xuICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoc29ydCk7XG4gICAgICAgIGNvbnN0IHNvcnRpbmcgPSBrZXlzXG4gICAgICAgICAgLm1hcChrZXkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdHJhbnNmb3JtZXIgPSBzb3J0W2tleV0gPT09IDEgPyAnQVNDJyA6ICdERVNDJztcbiAgICAgICAgICAgIGNvbnN0IG9yZGVyID0gYCQke2luZGV4fTpuYW1lICR7dHJhbnNmb3JtZXJ9YDtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICByZXR1cm4gb3JkZXI7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuam9pbigpO1xuICAgICAgICB2YWx1ZXMucHVzaCguLi5rZXlzKTtcbiAgICAgICAgc29ydFBhdHRlcm4gPSBzb3J0ICE9PSB1bmRlZmluZWQgJiYgc29ydGluZy5sZW5ndGggPiAwID8gYE9SREVSIEJZICR7c29ydGluZ31gIDogJyc7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGdyb3VwUGF0dGVybikge1xuICAgICAgY29sdW1ucy5mb3JFYWNoKChlLCBpLCBhKSA9PiB7XG4gICAgICAgIGlmIChlICYmIGUudHJpbSgpID09PSAnKicpIHtcbiAgICAgICAgICBhW2ldID0gJyc7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IG9yaWdpbmFsUXVlcnkgPSBgU0VMRUNUICR7Y29sdW1uc1xuICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgLmpvaW4oKX0gRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufSAke3NraXBQYXR0ZXJufSAke2dyb3VwUGF0dGVybn0gJHtzb3J0UGF0dGVybn0gJHtsaW1pdFBhdHRlcm59YDtcbiAgICBjb25zdCBxcyA9IGV4cGxhaW4gPyB0aGlzLmNyZWF0ZUV4cGxhaW5hYmxlUXVlcnkob3JpZ2luYWxRdWVyeSkgOiBvcmlnaW5hbFF1ZXJ5O1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQuYW55KHFzLCB2YWx1ZXMpLnRoZW4oYSA9PiB7XG4gICAgICBpZiAoZXhwbGFpbikge1xuICAgICAgICByZXR1cm4gYTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBhLm1hcChvYmplY3QgPT4gdGhpcy5wb3N0Z3Jlc09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3VsdCwgJ29iamVjdElkJykpIHtcbiAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGlmIChncm91cFZhbHVlcykge1xuICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IHt9O1xuICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGdyb3VwVmFsdWVzKSB7XG4gICAgICAgICAgICByZXN1bHQub2JqZWN0SWRba2V5XSA9IHJlc3VsdFtrZXldO1xuICAgICAgICAgICAgZGVsZXRlIHJlc3VsdFtrZXldO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoY291bnRGaWVsZCkge1xuICAgICAgICAgIHJlc3VsdFtjb3VudEZpZWxkXSA9IHBhcnNlSW50KHJlc3VsdFtjb3VudEZpZWxkXSwgMTApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgcGVyZm9ybUluaXRpYWxpemF0aW9uKHsgVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyB9OiBhbnkpIHtcbiAgICAvLyBUT0RPOiBUaGlzIG1ldGhvZCBuZWVkcyB0byBiZSByZXdyaXR0ZW4gdG8gbWFrZSBwcm9wZXIgdXNlIG9mIGNvbm5lY3Rpb25zIChAdml0YWx5LXQpXG4gICAgZGVidWcoJ3BlcmZvcm1Jbml0aWFsaXphdGlvbicpO1xuICAgIGF3YWl0IHRoaXMuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMoKTtcbiAgICBjb25zdCBwcm9taXNlcyA9IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMubWFwKHNjaGVtYSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVUYWJsZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpXG4gICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgfHxcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUVcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLnNjaGVtYVVwZ3JhZGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKSk7XG4gICAgfSk7XG4gICAgcHJvbWlzZXMucHVzaCh0aGlzLl9saXN0ZW5Ub1NjaGVtYSgpKTtcbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jbGllbnQudHgoJ3BlcmZvcm0taW5pdGlhbGl6YXRpb24nLCBhc3luYyB0ID0+IHtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLm1pc2MuanNvbk9iamVjdFNldEtleXMpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuYWRkKTtcbiAgICAgICAgICBhd2FpdCB0Lm5vbmUoc3FsLmFycmF5LmFkZFVuaXF1ZSk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5yZW1vdmUpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuY29udGFpbnNBbGwpO1xuICAgICAgICAgIGF3YWl0IHQubm9uZShzcWwuYXJyYXkuY29udGFpbnNBbGxSZWdleCk7XG4gICAgICAgICAgYXdhaXQgdC5ub25lKHNxbC5hcnJheS5jb250YWlucyk7XG4gICAgICAgICAgcmV0dXJuIHQuY3R4O1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbihjdHggPT4ge1xuICAgICAgICBkZWJ1ZyhgaW5pdGlhbGl6YXRpb25Eb25lIGluICR7Y3R4LmR1cmF0aW9ufWApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgfSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleGVzOiBhbnksIGNvbm46ID9hbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+XG4gICAgICB0LmJhdGNoKFxuICAgICAgICBpbmRleGVzLm1hcChpID0+IHtcbiAgICAgICAgICByZXR1cm4gdC5ub25lKCdDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyAkMTpuYW1lIE9OICQyOm5hbWUgKCQzOm5hbWUpJywgW1xuICAgICAgICAgICAgaS5uYW1lLFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgaS5rZXksXG4gICAgICAgICAgXSk7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBhbnksXG4gICAgY29ubjogP2FueVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCAoY29ubiB8fCB0aGlzLl9jbGllbnQpLm5vbmUoJ0NSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLCBbXG4gICAgICBmaWVsZE5hbWUsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0eXBlLFxuICAgIF0pO1xuICB9XG5cbiAgYXN5bmMgZHJvcEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSwgY29ubjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcXVlcmllcyA9IGluZGV4ZXMubWFwKGkgPT4gKHtcbiAgICAgIHF1ZXJ5OiAnRFJPUCBJTkRFWCAkMTpuYW1lJyxcbiAgICAgIHZhbHVlczogaSxcbiAgICB9KSk7XG4gICAgYXdhaXQgKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+IHQubm9uZSh0aGlzLl9wZ3AuaGVscGVycy5jb25jYXQocXVlcmllcykpKTtcbiAgfVxuXG4gIGFzeW5jIGdldEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBxcyA9ICdTRUxFQ1QgKiBGUk9NIHBnX2luZGV4ZXMgV0hFUkUgdGFibGVuYW1lID0gJHtjbGFzc05hbWV9JztcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LmFueShxcywgeyBjbGFzc05hbWUgfSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBVc2VkIGZvciB0ZXN0aW5nIHB1cnBvc2VzXG4gIGFzeW5jIHVwZGF0ZUVzdGltYXRlZENvdW50KGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5ub25lKCdBTkFMWVpFICQxOm5hbWUnLCBbY2xhc3NOYW1lXSk7XG4gIH1cblxuICBhc3luYyBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZXNzaW9uID0ge307XG4gICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXN1bHQgPSB0aGlzLl9jbGllbnQudHgodCA9PiB7XG4gICAgICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQgPSB0O1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5wcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICAgIH0pO1xuICAgICAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5iYXRjaCA9IFtdO1xuICAgICAgICByZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uKTtcbiAgICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZXNzaW9uLnByb21pc2U7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbW1pdFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZXNzaW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0O1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbih0cmFuc2FjdGlvbmFsU2Vzc2lvbjogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gdHJhbnNhY3Rpb25hbFNlc3Npb24ucmVzdWx0LmNhdGNoKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gucHVzaChQcm9taXNlLnJlamVjdCgpKTtcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbi5yZXNvbHZlKHRyYW5zYWN0aW9uYWxTZXNzaW9uLnQuYmF0Y2godHJhbnNhY3Rpb25hbFNlc3Npb24uYmF0Y2gpKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSW5kZXgoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIGZpZWxkTmFtZXM6IHN0cmluZ1tdLFxuICAgIGluZGV4TmFtZTogP3N0cmluZyxcbiAgICBjYXNlSW5zZW5zaXRpdmU6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zPzogT2JqZWN0ID0ge31cbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBjb25uID0gb3B0aW9ucy5jb25uICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmNvbm4gOiB0aGlzLl9jbGllbnQ7XG4gICAgY29uc3QgZGVmYXVsdEluZGV4TmFtZSA9IGBwYXJzZV9kZWZhdWx0XyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID1cbiAgICAgIGluZGV4TmFtZSAhPSBudWxsID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHsgbmFtZTogZGVmYXVsdEluZGV4TmFtZSB9O1xuICAgIGNvbnN0IGNvbnN0cmFpbnRQYXR0ZXJucyA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyBmaWVsZE5hbWVzLm1hcCgoZmllbGROYW1lLCBpbmRleCkgPT4gYGxvd2VyKCQke2luZGV4ICsgM306bmFtZSkgdmFyY2hhcl9wYXR0ZXJuX29wc2ApXG4gICAgICA6IGZpZWxkTmFtZXMubWFwKChmaWVsZE5hbWUsIGluZGV4KSA9PiBgJCR7aW5kZXggKyAzfTpuYW1lYCk7XG4gICAgY29uc3QgcXMgPSBgQ1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgJDE6bmFtZSBPTiAkMjpuYW1lICgke2NvbnN0cmFpbnRQYXR0ZXJucy5qb2luKCl9KWA7XG4gICAgY29uc3Qgc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA9XG4gICAgICBvcHRpb25zLnNldElkZW1wb3RlbmN5RnVuY3Rpb24gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuc2V0SWRlbXBvdGVuY3lGdW5jdGlvbiA6IGZhbHNlO1xuICAgIGlmIChzZXRJZGVtcG90ZW5jeUZ1bmN0aW9uKSB7XG4gICAgICBhd2FpdCB0aGlzLmVuc3VyZUlkZW1wb3RlbmN5RnVuY3Rpb25FeGlzdHMob3B0aW9ucyk7XG4gICAgfVxuICAgIGF3YWl0IGNvbm4ubm9uZShxcywgW2luZGV4TmFtZU9wdGlvbnMubmFtZSwgY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgaWYgKFxuICAgICAgICBlcnJvci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgJiZcbiAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhpbmRleE5hbWVPcHRpb25zLm5hbWUpXG4gICAgICApIHtcbiAgICAgICAgLy8gSW5kZXggYWxyZWFkeSBleGlzdHMuIElnbm9yZSBlcnJvci5cbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKGluZGV4TmFtZU9wdGlvbnMubmFtZSlcbiAgICAgICkge1xuICAgICAgICAvLyBDYXN0IHRoZSBlcnJvciBpbnRvIHRoZSBwcm9wZXIgcGFyc2UgZXJyb3JcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZGVsZXRlSWRlbXBvdGVuY3lGdW5jdGlvbihvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBxcyA9ICdEUk9QIEZVTkNUSU9OIElGIEVYSVNUUyBpZGVtcG90ZW5jeV9kZWxldGVfZXhwaXJlZF9yZWNvcmRzKCknO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMpLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZW5zdXJlSWRlbXBvdGVuY3lGdW5jdGlvbkV4aXN0cyhvcHRpb25zPzogT2JqZWN0ID0ge30pOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGNvbm4gPSBvcHRpb25zLmNvbm4gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuY29ubiA6IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCB0dGxPcHRpb25zID0gb3B0aW9ucy50dGwgIT09IHVuZGVmaW5lZCA/IGAke29wdGlvbnMudHRsfSBzZWNvbmRzYCA6ICc2MCBzZWNvbmRzJztcbiAgICBjb25zdCBxcyA9XG4gICAgICAnQ1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04gaWRlbXBvdGVuY3lfZGVsZXRlX2V4cGlyZWRfcmVjb3JkcygpIFJFVFVSTlMgdm9pZCBMQU5HVUFHRSBwbHBnc3FsIEFTICQkIEJFR0lOIERFTEVURSBGUk9NIFwiX0lkZW1wb3RlbmN5XCIgV0hFUkUgZXhwaXJlIDwgTk9XKCkgLSBJTlRFUlZBTCAkMTsgRU5EOyAkJDsnO1xuICAgIHJldHVybiBjb25uLm5vbmUocXMsIFt0dGxPcHRpb25zXSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY29udmVydFBvbHlnb25Ub1NRTChwb2x5Z29uKSB7XG4gIGlmIChwb2x5Z29uLmxlbmd0aCA8IDMpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgUG9seWdvbiBtdXN0IGhhdmUgYXQgbGVhc3QgMyB2YWx1ZXNgKTtcbiAgfVxuICBpZiAoXG4gICAgcG9seWdvblswXVswXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzBdIHx8XG4gICAgcG9seWdvblswXVsxXSAhPT0gcG9seWdvbltwb2x5Z29uLmxlbmd0aCAtIDFdWzFdXG4gICkge1xuICAgIHBvbHlnb24ucHVzaChwb2x5Z29uWzBdKTtcbiAgfVxuICBjb25zdCB1bmlxdWUgPSBwb2x5Z29uLmZpbHRlcigoaXRlbSwgaW5kZXgsIGFyKSA9PiB7XG4gICAgbGV0IGZvdW5kSW5kZXggPSAtMTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBwdCA9IGFyW2ldO1xuICAgICAgaWYgKHB0WzBdID09PSBpdGVtWzBdICYmIHB0WzFdID09PSBpdGVtWzFdKSB7XG4gICAgICAgIGZvdW5kSW5kZXggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZvdW5kSW5kZXggPT09IGluZGV4O1xuICB9KTtcbiAgaWYgKHVuaXF1ZS5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgJ0dlb0pTT046IExvb3AgbXVzdCBoYXZlIGF0IGxlYXN0IDMgZGlmZmVyZW50IHZlcnRpY2VzJ1xuICAgICk7XG4gIH1cbiAgY29uc3QgcG9pbnRzID0gcG9seWdvblxuICAgIC5tYXAocG9pbnQgPT4ge1xuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBhcnNlRmxvYXQocG9pbnRbMV0pLCBwYXJzZUZsb2F0KHBvaW50WzBdKSk7XG4gICAgICByZXR1cm4gYCgke3BvaW50WzFdfSwgJHtwb2ludFswXX0pYDtcbiAgICB9KVxuICAgIC5qb2luKCcsICcpO1xuICByZXR1cm4gYCgke3BvaW50c30pYDtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlV2hpdGVTcGFjZShyZWdleCkge1xuICBpZiAoIXJlZ2V4LmVuZHNXaXRoKCdcXG4nKSkge1xuICAgIHJlZ2V4ICs9ICdcXG4nO1xuICB9XG5cbiAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIGNvbW1lbnRzXG4gIHJldHVybiAoXG4gICAgcmVnZXhcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSkjLipcXG4vZ2ltLCAnJDEnKVxuICAgICAgLy8gcmVtb3ZlIGxpbmVzIHN0YXJ0aW5nIHdpdGggYSBjb21tZW50XG4gICAgICAucmVwbGFjZSgvXiMuKlxcbi9naW0sICcnKVxuICAgICAgLy8gcmVtb3ZlIG5vbiBlc2NhcGVkIHdoaXRlc3BhY2VcbiAgICAgIC5yZXBsYWNlKC8oW15cXFxcXSlcXHMrL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSB3aGl0ZXNwYWNlIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBsaW5lXG4gICAgICAucmVwbGFjZSgvXlxccysvLCAnJylcbiAgICAgIC50cmltKClcbiAgKTtcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1JlZ2V4UGF0dGVybihzKSB7XG4gIGlmIChzICYmIHMuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgLy8gcmVnZXggZm9yIHN0YXJ0c1dpdGhcbiAgICByZXR1cm4gJ14nICsgbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDEpKTtcbiAgfSBlbHNlIGlmIChzICYmIHMuZW5kc1dpdGgoJyQnKSkge1xuICAgIC8vIHJlZ2V4IGZvciBlbmRzV2l0aFxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMuc2xpY2UoMCwgcy5sZW5ndGggLSAxKSkgKyAnJCc7XG4gIH1cblxuICAvLyByZWdleCBmb3IgY29udGFpbnNcbiAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocyk7XG59XG5cbmZ1bmN0aW9uIGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlKSB7XG4gIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCAhdmFsdWUuc3RhcnRzV2l0aCgnXicpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbWF0Y2hlcyA9IHZhbHVlLm1hdGNoKC9cXF5cXFxcUS4qXFxcXEUvKTtcbiAgcmV0dXJuICEhbWF0Y2hlcztcbn1cblxuZnVuY3Rpb24gaXNBbGxWYWx1ZXNSZWdleE9yTm9uZSh2YWx1ZXMpIHtcbiAgaWYgKCF2YWx1ZXMgfHwgIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCB2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBjb25zdCBmaXJzdFZhbHVlc0lzUmVnZXggPSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbMF0uJHJlZ2V4KTtcbiAgaWYgKHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gZmlyc3RWYWx1ZXNJc1JlZ2V4O1xuICB9XG5cbiAgZm9yIChsZXQgaSA9IDEsIGxlbmd0aCA9IHZhbHVlcy5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChmaXJzdFZhbHVlc0lzUmVnZXggIT09IGlzU3RhcnRzV2l0aFJlZ2V4KHZhbHVlc1tpXS4kcmVnZXgpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgodmFsdWVzKSB7XG4gIHJldHVybiB2YWx1ZXMuc29tZShmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gaXNTdGFydHNXaXRoUmVnZXgodmFsdWUuJHJlZ2V4KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmc6IHN0cmluZykge1xuICByZXR1cm4gcmVtYWluaW5nXG4gICAgLnNwbGl0KCcnKVxuICAgIC5tYXAoYyA9PiB7XG4gICAgICBjb25zdCByZWdleCA9IFJlZ0V4cCgnWzAtOSBdfFxcXFxwe0x9JywgJ3UnKTsgLy8gU3VwcG9ydCBhbGwgVW5pY29kZSBsZXR0ZXIgY2hhcnNcbiAgICAgIGlmIChjLm1hdGNoKHJlZ2V4KSAhPT0gbnVsbCkge1xuICAgICAgICAvLyBEb24ndCBlc2NhcGUgYWxwaGFudW1lcmljIGNoYXJhY3RlcnNcbiAgICAgICAgcmV0dXJuIGM7XG4gICAgICB9XG4gICAgICAvLyBFc2NhcGUgZXZlcnl0aGluZyBlbHNlIChzaW5nbGUgcXVvdGVzIHdpdGggc2luZ2xlIHF1b3RlcywgZXZlcnl0aGluZyBlbHNlIHdpdGggYSBiYWNrc2xhc2gpXG4gICAgICByZXR1cm4gYyA9PT0gYCdgID8gYCcnYCA6IGBcXFxcJHtjfWA7XG4gICAgfSlcbiAgICAuam9pbignJyk7XG59XG5cbmZ1bmN0aW9uIGxpdGVyYWxpemVSZWdleFBhcnQoczogc3RyaW5nKSB7XG4gIGNvbnN0IG1hdGNoZXIxID0gL1xcXFxRKCg/IVxcXFxFKS4qKVxcXFxFJC87XG4gIGNvbnN0IHJlc3VsdDE6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjEpO1xuICBpZiAocmVzdWx0MSAmJiByZXN1bHQxLmxlbmd0aCA+IDEgJiYgcmVzdWx0MS5pbmRleCA+IC0xKSB7XG4gICAgLy8gUHJvY2VzcyBSZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBhbmQgYW4gZW5kIHNwZWNpZmllZCBmb3IgdGhlIGxpdGVyYWwgdGV4dFxuICAgIGNvbnN0IHByZWZpeCA9IHMuc3Vic3RyaW5nKDAsIHJlc3VsdDEuaW5kZXgpO1xuICAgIGNvbnN0IHJlbWFpbmluZyA9IHJlc3VsdDFbMV07XG5cbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChwcmVmaXgpICsgY3JlYXRlTGl0ZXJhbFJlZ2V4KHJlbWFpbmluZyk7XG4gIH1cblxuICAvLyBQcm9jZXNzIFJlZ2V4IHRoYXQgaGFzIGEgYmVnaW5uaW5nIHNwZWNpZmllZCBmb3IgdGhlIGxpdGVyYWwgdGV4dFxuICBjb25zdCBtYXRjaGVyMiA9IC9cXFxcUSgoPyFcXFxcRSkuKikkLztcbiAgY29uc3QgcmVzdWx0MjogYW55ID0gcy5tYXRjaChtYXRjaGVyMik7XG4gIGlmIChyZXN1bHQyICYmIHJlc3VsdDIubGVuZ3RoID4gMSAmJiByZXN1bHQyLmluZGV4ID4gLTEpIHtcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cmluZygwLCByZXN1bHQyLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQyWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gUmVtb3ZlIHByb2JsZW1hdGljIGNoYXJzIGZyb20gcmVtYWluaW5nIHRleHRcbiAgcmV0dXJuIHNcbiAgICAvLyBSZW1vdmUgYWxsIGluc3RhbmNlcyBvZiBcXFEgYW5kIFxcRVxuICAgIC5yZXBsYWNlKC8oW15cXFxcXSkoXFxcXEUpLywgJyQxJylcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxRKS8sICckMScpXG4gICAgLnJlcGxhY2UoL15cXFxcRS8sICcnKVxuICAgIC5yZXBsYWNlKC9eXFxcXFEvLCAnJylcbiAgICAvLyBFbnN1cmUgZXZlbiBudW1iZXIgb2Ygc2luZ2xlIHF1b3RlIHNlcXVlbmNlcyBieSBhZGRpbmcgYW4gZXh0cmEgc2luZ2xlIHF1b3RlIGlmIG5lZWRlZDtcbiAgICAvLyB0aGlzIGVuc3VyZXMgdGhhdCBldmVyeSBzaW5nbGUgcXVvdGUgaXMgZXNjYXBlZFxuICAgIC5yZXBsYWNlKC8nKy9nLCBtYXRjaCA9PiB7XG4gICAgICByZXR1cm4gbWF0Y2gubGVuZ3RoICUgMiA9PT0gMCA/IG1hdGNoIDogbWF0Y2ggKyBcIidcIjtcbiAgICB9KTtcbn1cblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnO1xuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsSUFBQUEsZUFBQSxHQUFBQyxPQUFBO0FBRUEsSUFBQUMsS0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBRUEsSUFBQUcsT0FBQSxHQUFBRCxzQkFBQSxDQUFBRixPQUFBO0FBRUEsSUFBQUksS0FBQSxHQUFBSixPQUFBO0FBQ0EsSUFBQUssSUFBQSxHQUFBSCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQU0sZUFBQSxHQUFBTixPQUFBO0FBQW1ELFNBQUFFLHVCQUFBSyxDQUFBLFdBQUFBLENBQUEsSUFBQUEsQ0FBQSxDQUFBQyxVQUFBLEdBQUFELENBQUEsS0FBQUUsT0FBQSxFQUFB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LEVBQUU7SUFDdkQ7SUFDQSxNQUFNb1osTUFBTSxHQUFHWCxDQUFDLENBQUNwWSxTQUFTLENBQUMsQ0FBQyxFQUFFOFksT0FBTyxDQUFDblosS0FBSyxDQUFDO0lBQzVDLE1BQU1nWixTQUFTLEdBQUdHLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFFNUIsT0FBT1IsbUJBQW1CLENBQUNTLE1BQU0sQ0FBQyxHQUFHTCxrQkFBa0IsQ0FBQ0MsU0FBUyxDQUFDO0VBQ3BFOztFQUVBO0VBQ0EsTUFBTUssUUFBUSxHQUFHLGlCQUFpQjtFQUNsQyxNQUFNQyxPQUFZLEdBQUdiLENBQUMsQ0FBQzlXLEtBQUssQ0FBQzBYLFFBQVEsQ0FBQztFQUN0QyxJQUFJQyxPQUFPLElBQUlBLE9BQU8sQ0FBQzdlLE1BQU0sR0FBRyxDQUFDLElBQUk2ZSxPQUFPLENBQUN0WixLQUFLLEdBQUcsQ0FBQyxDQUFDLEVBQUU7SUFDdkQsTUFBTW9aLE1BQU0sR0FBR1gsQ0FBQyxDQUFDcFksU0FBUyxDQUFDLENBQUMsRUFBRWlaLE9BQU8sQ0FBQ3RaLEtBQUssQ0FBQztJQUM1QyxNQUFNZ1osU0FBUyxHQUFHTSxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBRTVCLE9BQU9YLG1CQUFtQixDQUFDUyxNQUFNLENBQUMsR0FBR0wsa0JBQWtCLENBQUNDLFNBQVMsQ0FBQztFQUNwRTs7RUFFQTtFQUNBLE9BQU9QO0VBQ0w7RUFBQSxDQUNDRCxPQUFPLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUM3QkEsT0FBTyxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FDN0JBLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQ25CQSxPQUFPLENBQUMsTUFBTSxFQUFFLEVBQUU7RUFDbkI7RUFDQTtFQUFBLENBQ0NBLE9BQU8sQ0FBQyxLQUFLLEVBQUU3VyxLQUFLLElBQUk7SUFDdkIsT0FBT0EsS0FBSyxDQUFDbEgsTUFBTSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUdrSCxLQUFLLEdBQUdBLEtBQUssR0FBRyxHQUFHO0VBQ3JELENBQUMsQ0FBQztBQUNOO0FBRUEsSUFBSThELGFBQWEsR0FBRztFQUNsQkMsV0FBV0EsQ0FBQ3JKLEtBQUssRUFBRTtJQUNqQixPQUFPLE9BQU9BLEtBQUssS0FBSyxRQUFRLElBQUlBLEtBQUssS0FBSyxJQUFJLElBQUlBLEtBQUssQ0FBQ0MsTUFBTSxLQUFLLFVBQVU7RUFDbkY7QUFDRixDQUFDO0FBQUMsSUFBQWlkLFFBQUEsR0FBQXRCLE9BQUEsQ0FBQXJlLE9BQUEsR0FFYXVOLHNCQUFzQiIsImlnbm9yZUxpc3QiOltdfQ==