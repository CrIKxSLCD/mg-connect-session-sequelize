/**
 * Sequelize based session store.
 *
 * Author: MG_CrIKxS (Rework) - Michael Weibel <michael.weibel@gmail.com>
 * License: MIT
 */

const { Op, Sequelize } = require('sequelize');
const debug = require('debug')('connect:session-sequelize');

function promisify(promise, fn) {
  if (typeof fn === 'function') {
    promise = promise.then(obj => {
      fn(null, obj);
    }).catch(err => {
      fn(err || new Error(err));
    });
  }
  return promise;
}

class SequelizeStoreException extends Error {
  constructor(message) {
    super(message);
    this.name = 'SequelizeStoreException';
  }
}

const defaultOptions = {
  checkExpirationInterval: 15 * 60 * 1000, // The interval at which to cleanup expired sessions.
  expiration: 24 * 60 * 60 * 1000, // The maximum age (in milliseconds) of a valid session. Used when cookie.expires is not set.
  disableTouch: false, // When true, we will not update the db in the touch function call. Useful when you want more control over db writes.
  modelKey: 'Session',
  tableName: 'Sessions',
  extendDefaultFields: null,
  additionalFields: {},
};

module.exports = function SequelizeSessionInit(Store) {
  class SequelizeStore extends Store {
    constructor(options = {}) {
      super(options);
      this.options = { ...defaultOptions, ...options };

      if (!this.options.db) {
        throw new SequelizeStoreException('Database connection is required');
      }

      this._initializeModel();
      this._initializeDatabase();
      this.startExpiringSessions();
    }

    _initializeModel() {
      const modelName = this.options.table || this.options.modelKey;

      // Base session fields
      const sessionAttributes = {
        sid: {
          type: Sequelize.STRING,
          primaryKey: true,
        },
        data: {
          type: Sequelize.TEXT,
          allowNull: false,
        },
        expires: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      };

      // Add additional fields to the session model
      const additionalFields = this.options.additionalFields || {};
      Object.assign(sessionAttributes, additionalFields);

      this.sessionModel = this.options.db.models[modelName] || 
        this.options.db.define(
          modelName,
          sessionAttributes,
          {
            tableName: this.options.tableName,
            timestamps: true,
          }
        );
    }

    async _initializeDatabase() {
      try {
        debug('Synchronizing database...');
        await this.options.db.authenticate();
        await this.sessionModel.sync();
        debug('Session table synchronized');
      } catch (err) {
        throw new SequelizeStoreException('Failed to initialize database: ' + err.message);
      }
    }

    sync(options) {
      return this.sessionModel.sync(options);
    }

    get(sid, fn) {
      debug('Getting session:', sid);

      const promise = this.sessionModel.findOne({ where: { sid } })
        .then(session => {
          if (!session) {
            debug('No session found');
            return null;
          }
          try {
            return JSON.parse(session.data);
          } catch (err) {
            throw new SequelizeStoreException('Error parsing session data');
          }
        });

      return promisify(promise, fn);
    }

    set(sid, data, fn) {
      debug('Setting session:', sid);

      const expires = this._calculateExpiration(data);
      let defaults = {
        sid: sid,
        data: JSON.stringify(data),
        expires: expires,
      };

      if (this.options.extendDefaultFields) {
        defaults = this.options.extendDefaultFields(defaults, data);
      }

      const promise = this.sessionModel.upsert(defaults)
        .then(() => this.sessionModel.findOne({ where: { sid: sid } }))
        .catch(err => {
          throw new SequelizeStoreException('Error setting session: ' + err.message);
        });

      return promisify(promise, fn);
    }

    touch(sid, data, fn) {
      debug('Touching session:', sid);

      if (this.options.disableTouch) {
        debug('Touch disabled');
        return promisify(Promise.resolve(), fn);
      }

      const expires = this._calculateExpiration(data);
      const promise = this.sessionModel.update(
        { expires: expires },
        { where: { sid: sid } }
      )
        .then(() => this.sessionModel.findOne({ where: { sid } }))
        .catch(err => {
          throw new SequelizeStoreException('Error touching session: ' + err.message);
        });

      return promisify(promise, fn);
    }

    destroy(sid, fn) {
      debug('Destroying session:', sid);

      const promise = this.sessionModel.destroy({ where: { sid } })
        .catch(err => {
          throw new SequelizeStoreException('Error destroying session: ' + err.message);
        });

      return promisify(promise, fn);
    }

    length(fn) {
      const promise = this.sessionModel.count()
        .catch(err => {
          throw new SequelizeStoreException('Error counting sessions: ' + err.message);
        });

      return promisify(promise, fn);
    }

    clearExpiredSessions(fn) {
      debug('Clearing expired sessions');

      const promise = this.sessionModel.destroy({
        where: { expires: { [Op.lt]: new Date() } }
      })
        .then(affectedRows => {
          debug(`${affectedRows} expired sessions cleared`);
          return affectedRows;
        })
        .catch(err => {
          throw new SequelizeStoreException('Error clearing expired sessions: ' + err.message);
        });

      return promisify(promise, fn);
    }

    startExpiringSessions() {
      if (this.options.checkExpirationInterval > 0) {
        this.stopExpiringSessions();
        this._expirationInterval = setInterval(
          () => this.clearExpiredSessions(),
          this.options.checkExpirationInterval
        );
        this._expirationInterval.unref();
      }
    }

    stopExpiringSessions() {
      if (this._expirationInterval) {
        clearInterval(this._expirationInterval);
        this._expirationInterval = null;
      }
    }

    _calculateExpiration(data) {
      if (data.cookie && data.cookie.expires) {
        return new Date(data.cookie.expires);
      }
      return new Date(Date.now() + this.options.expiration);
    }
  }

  return SequelizeStore;
};