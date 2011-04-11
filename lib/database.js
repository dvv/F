'use strict';

/*
 *
 * Simple database
 *
 * Copyright(c) 2011 Vladimir Dronnikov <dronnikov@gmail.com>
 * MIT Licensed
 *
*/

var __hasProp = Object.prototype.hasOwnProperty;
var __extends = function(child, parent) {
  for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; }
  function ctor() { this.constructor = child; }
  ctor.prototype = parent.prototype;
  child.prototype = new ctor;
  child.__super__ = parent.prototype;
  return child;
};

var parseUrl = require('url').parse;
var Mongo = require('mongodb');
var Events = require('events');

var Database = (function() {

  __extends(Database, Events.EventEmitter);
  function Database(options, definitions, callback) {
    var name, port;
    if (!options) options = {};
    var conn = parseUrl(options.url || '');
    var host = conn.hostname;
    if (conn.port) port = +conn.port;
    if (conn.auth) this.auth = conn.auth;
    if (conn.pathname) name = conn.pathname.substring(1);
    this.collections = {};
    this.model = {};
    this.idFactory = function() { return (new Mongo.BSONPure.ObjectID).toHexString(); };
    this.attrInactive = options.attrInactive;
    this.db = new Mongo.Db(name || 'test', new Mongo.Server(host || '127.0.0.1', port || 27017));
    if (definitions) {
      this.open(definitions, callback);
    }
  }

  Database.prototype.open = function(collections, callback) {
    var self = this;
    self.db.open(function(err, result) {
      var password, username, _ref;
      if (self.auth) {
        _ref = self.auth.split(':', 2), username = _ref[0], password = _ref[1];
        return self.db.authenticate(username, password, function(err, result) {
          if (err) {
            return typeof callback == "function" ? callback(err.message) : void 0;
          }
          self.register(collections, callback);
        });
      } else {
        if (err) {
          return typeof callback == "function" ? callback(err.message) : void 0;
        }
        return self.register(collections, callback);
      }
    });
  };

  Database.prototype.register = function(schema, callback) {
    var definition, name;
    var self = this;
    var len = _.size(schema);
    var _fn = function(name) {
      var colName = definition.collection || name;
      self.db.collection(colName, function(err, coll) {
        var k, store, v, _ref;
        self.collections[colName] = coll;
        store = self.getModel(name, definition);
        if (definition != null ? definition.prototype : void 0) {
          _ref = definition.prototype;
          for (k in _ref) {
            if (!__hasProp.call(_ref, k)) continue;
            v = _ref[k];
            store[k] = _.isFunction(v) ? v.bind(store) : v;
          }
          delete definition.prototype;
        }
        Object.defineProperties(store, {
          id: {
            value: name
          },
          schema: {
            value: definition
          }
        });
        self.model[name] = store;
        if (--len <= 0) {
          return typeof callback == "function" ? callback(err != null ? err.message : void 0, self.model) : void 0;
        }
      });
    };
    for (name in schema) {
      definition = schema[name];
      _fn(name);
    }
  };

  Database.prototype.query = function(collection, own, schema, context, query, callback) {
    var self, uid;
    self = this;
    query = _.rql(query);
    if (own) {
      uid = context && context.user && context.user.id;
      if (uid) {
        query = query.eq('_meta.history.0.who', uid);
      }
    }
    _.each(schema != null ? schema.constraints : void 0, function(constraint) {
      return query = query[constraint.op](constraint.key, constraint.value);
    });
    if (this.attrInactive) {
      query = query.ne(this.attrInactive, true);
    }
    query = query.toMongo();
    self.emit('query', {
      collection: collection,
      user: uid,
      search: query.search,
      params: query.meta
    });
//console.log('QUERY?', query.search, query.meta);
    this.collections[collection].find(query.search, query.meta, function(err, cursor) {
//console.log('QUERY', err);
      if (err) {
        return typeof callback == "function" ? callback(err.message) : void 0;
      }
      cursor.toArray(function(err, docs) {
//console.log('QUERY!', err, docs);
        var doc, i, _len;
        if (err) {
          return typeof callback == "function" ? callback(err.message) : void 0;
        }
        for (i = 0, _len = docs.length; i < _len; i++) {
          doc = docs[i];
          doc.id = doc._id;
          delete doc._id;
          if (schema) {
            _.validate(doc, schema, {
              veto: true,
              removeAdditionalProps: !schema.additionalProperties,
              flavor: 'query'
            });
          }
        }
        if (query.meta.values) {
          docs = _.map(docs, _.values);
        }
        if (typeof callback == "function") {
          callback(null, docs);
        }
      });
    });
  };
  Database.prototype.get = function(collection, own, schema, context, id, callback) {
    var query, uid;
    query = _.rql('limit(1)').eq('id', id);
    if (own) {
      uid = context && context.user && context.user.id;
      if (uid) {
        query = query.eq('_meta.history.0.who', uid);
      }
    }
    _.each(schema != null ? schema.constraints : void 0, function(constraint) {
      return query = query[constraint.op](constraint.key, constraint.value);
    });
    this.query(collection, own, null, context, query, function(err, result) {
      var doc;
      if (callback) {
        if (err) {
          callback(err.message);
        } else {
          doc = result[0] || null;
          if (schema && doc) {
            _.validate(doc, schema, {
              veto: true,
              removeAdditionalProps: !schema.additionalProperties,
              flavor: 'get'
            });
          }
          callback(null, doc);
        }
      }
    });
  };
  Database.prototype.add = function(collection, schema, context, document, callback) {
    var self, uid;
    if (document == null) {
      document = {};
    }
    self = this;
    if (!document.id) {
      document.id = this.idFactory();
    }
    uid = context && context.user && context.user.id;
    Next(self, function(err, result, next) {
      if (schema) {
        _.validate.call(context, document, schema, {
          veto: true,
          removeAdditionalProps: !schema.additionalProperties,
          flavor: 'add',
          coerce: true
        }, next);
      } else {
        next(null, document);
      }
    }, function(err, document, next) {
//console.log('AADDDD', err, document, schema);
      var parents, _ref, _ref2, _ref3;
      if (err) {
        return next(err);
      }
      document._id = document.id;
      delete document.id;
      parents = (context != null ? (_ref = context.user) != null ? (_ref2 = _ref._meta) != null ? (_ref3 = _ref2.history) != null ? _ref3[0].who : void 0 : void 0 : void 0 : void 0) || [];
      parents.unshift(uid);
      document._meta = {
        history: [
          {
            who: parents,
            when: Date.now()
          }
        ]
      };
      this.collections[collection].insert(document, {
        safe: true
      }, next);
    }, function(err, result, next) {
      var _ref;
      if (err) {
        if (((_ref = err.message) != null ? _ref.substring(0, 6) : void 0) === 'E11000') {
          err = [
            {
              property: 'id',
              message: 'duplicated'
            }
          ];
        }
        if (typeof callback == "function") {
          callback(err);
        }
      } else {
        result = result[0];
        result.id = result._id;
        delete result._id;
        if (schema) {
          _.validate(result, schema, {
            veto: true,
            removeAdditionalProps: !schema.additionalProperties,
            flavor: 'get'
          });
        }
        if (typeof callback == "function") {
          callback(null, result);
        }
        self.emit('add', {
          collection: collection,
          user: uid,
          result: result
        });
      }
    });
  };
  Database.prototype.update = function(collection, own, schema, context, query, changes, callback) {
    var self, uid;
    if (changes == null) {
      changes = {};
    }
    self = this;
    uid = context && context.user && context.user.id;
    query = _.rql(query);
    if (own && uid) {
      query = query.eq('_meta.history.0.who', uid);
    }
    _.each(schema != null ? schema.constraints : void 0, function(constraint) {
      return query = query[constraint.op](constraint.key, constraint.value);
    });
    query = query.toMongo();
    query.search.$atomic = 1;
    Next(self, function(err, result, next) {
      if (schema) {
        _.validate.call(context, changes, schema, {
          veto: true,
          removeAdditionalProps: !schema.additionalProperties,
          existingOnly: true,
          flavor: 'update',
          coerce: true
        }, next);
      } else {
        next(null, changes);
      }
    }, function(err, changes, next) {
      var history;
      if (err || !_.size(changes)) {
        return next(err);
      }
      history = {
        who: uid,
        when: Date.now()
      };
      delete changes._meta;
      history.what = changes;
      changes = {
        $set: changes
      };
      if (schema != null ? schema.saveChanges : void 0) {
        changes.$push = {
          '_meta.history': history
        };
      }
      this.collections[collection].update(query.search, changes, {
        multi: true
      }, next);
    }, function(err, result) {
      if (typeof callback == "function") {
        callback((err != null ? err.message : void 0) || err);
      }
      self.emit('update', {
        collection: collection,
        user: uid,
        search: query.search,
        changes: changes,
        err: (err != null ? err.message : void 0) || err
      });
    });
  };
  Database.prototype.remove = function(collection, own, context, query, callback) {
    var self, uid;
    self = this;
    query = _.rql(query);
    uid = context && context.user && context.user.id;
    if (own && uid) {
      query = query.eq('_meta.history.0.who', uid);
    }
    _.each(typeof schema != "undefined" && schema !== null ? schema.constraints : void 0, function(constraint) {
      return query = query[constraint.op](constraint.key, constraint.value);
    });
    query = query.toMongo();
    if (!_.size(query.search)) {
      return typeof callback == "function" ? callback('Refuse to remove all documents w/o conditions') : void 0;
    }
    this.collections[collection].remove(query.search, function(err) {
      if (typeof callback == "function") {
        callback(err != null ? err.message : void 0);
      }
      self.emit('remove', {
        collection: collection,
        user: uid,
        search: query.search,
        error: err != null ? err.message : void 0
      });
    });
  };
  Database.prototype["delete"] = function(collection, own, context, query, callback) {
    var changes;
    if (this.attrInactive) {
      query = _.rql(query).ne(this.attrInactive, true);
      changes = {};
      changes[this.attrInactive] = true;
      this.update(collection, own, null, context, query, changes, callback);
    } else {
      this.remove(collection, own, context, query, callback);
    }
  };
  Database.prototype.undelete = function(collection, own, context, query, callback) {
    var changes;
    if (this.attrInactive) {
      query = _.rql(query).eq(this.attrInactive, true);
      changes = {};
      changes[this.attrInactive] = false;
      this.update(collection, own, null, context, query, changes, callback);
    } else {
      if (typeof callback == "function") {
        callback();
      }
    }
  };
  Database.prototype.purge = function(collection, own, context, query, callback) {
    if (this.attrInactive) {
      query = _.rql(query).eq(this.attrInactive, true);
      this.remove(collection, own, context, query, callback);
    } else {
      if (typeof callback == "function") {
        callback();
      }
    }
  };
  Database.prototype.getModel = function(entity, schema) {
    var collection, db, store;
    collection = schema.collection || entity;
    db = this;
    store = {
      _add: db.add.bind(db, collection, false),
      _queryAny: db.query.bind(db, collection, false),
      _queryOwn: db.query.bind(db, collection, true),
      _getAny: db.get.bind(db, collection, false),
      _getOwn: db.get.bind(db, collection, true),
      _updateAny: db.update.bind(db, collection, false),
      _updateOwn: db.update.bind(db, collection, true),
      add: db.add.bind(db, collection, schema),
      queryAny: db.query.bind(db, collection, false, schema),
      queryOwn: db.query.bind(db, collection, true, schema),
      getAny: db.get.bind(db, collection, false, schema),
      getOwn: db.get.bind(db, collection, true, schema),
      updateAny: db.update.bind(db, collection, false, schema),
      updateOwn: db.update.bind(db, collection, true, schema),
      removeAny: db.remove.bind(db, collection, false),
      removeOwn: db.remove.bind(db, collection, true)
    };
    if (this.attrInactive) {
      _.extend(store, {
        deleteAny: db["delete"].bind(db, collection, false),
        deleteOwn: db["delete"].bind(db, collection, true),
        undeleteAny: db.undelete.bind(db, collection, false),
        undeleteOwn: db.undelete.bind(db, collection, true),
        purgeAny: db.purge.bind(db, collection, false),
        purgeOwn: db.purge.bind(db, collection, true)
      });
    }
    return store;
  };
  return Database;
})();

module.exports.Database = Database;

//
// helpers to tune properties
//
_.extend(module.exports, {
	// read-only
	ro: function(attr) {return _.extend({}, attr, {veto: {update: true}});},
	// query-only
	qo: function(attr) {return _.extend({}, attr, {veto: {get: true, update: true}});},
	// write-only
	wo: function(attr) {return _.extend({}, attr, {veto: {query: true, get: true}});},
	// create-only
	co: function(attr) {return _.extend({}, attr, {veto: {query: true, get: true, update: true}});},
	// fix the value
	fix: function(attr, value) {return _.extend({}, attr, {value: value});},
	// define default value
	def: function(attr, value) {return _.extend({}, attr, {default: value});},
});
