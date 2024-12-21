# Rework MG_CrIKxS (mweibel)

# Usage

With connect

```javascript
const connect = require("connect");
// for express, just call it with 'require('connect-session-sequelize')(session.Store)'
const SequelizeStore = require("connect-session-sequelize")(
  connect.session.Store
);

connect().use(
  connect.session({
    store: new SequelizeStore(options),
    secret: "CHANGEME",
  })
);
```

With express 4:

```javascript
// load dependencies
var express = require("express");
var Sequelize = require("sequelize");
var session = require("express-session");

// initalize sequelize with session store
var SequelizeStore = require("connect-session-sequelize")(session.Store);

// create database, ensure 'sqlite3' in your package.json
var sequelize = new Sequelize("database", "username", "password", {
  dialect: "sqlite",
  storage: "./session.sqlite",
});

// configure express
var app = express();
app.use(
  session({
    secret: "keyboard cat",
    store: new SequelizeStore({
      db: sequelize,
    }),
    resave: false, // we support the touch method so per the express-session docs this should be set to false
    proxy: true, // if you do SSL outside of node.
  })
);
// continue as normal
```
If you want SequelizeStore to create/sync the database table for you, you can call `sync()` against an instance of `SequelizeStore` along with [options](https://sequelize.org/master/class/lib/model.js~Model.html#static-method-sync) if needed. This will run a sequelize `sync()` operation on the model for an initialized SequelizeStore object :

```javascript
var myStore = new SequelizeStore({
  db: sequelize,
});
app.use(
  session({
    secret: "keyboard cat",
    store: myStore,
    resave: false,
    proxy: true,
  })
);

myStore.sync();
```

# Session expiry

Session records are automatically expired and removed from the database on an interval. The `cookie.expires` property is used to set session expiry time. If that property doesn't exist, a default expiry of 24 hours is used. Expired session are removed from the database every 15 minutes by default. That interval as well as the default expiry time can be set as store options:

```javascript
new SequelizeStore({
  ...
  checkExpirationInterval: 15 * 60 * 1000, // The interval at which to cleanup expired sessions in milliseconds.
  expiration: 24 * 60 * 60 * 1000  // The maximum age (in milliseconds) of a valid session.
});
```

## Expiration interval cleanup: `stopExpiringSessions`

As expirations are checked on an interval timer, `connect-session-sequelize` can keep your process from exiting. This can be problematic e.g. in testing when it is known that the application code will no longer be used, but the test script never terminates. If you know that the process will no longer be used, you can manually clean up the interval by calling the `stopExpiringSessions` method:

```js
// assuming you have set up a typical session store, for example:
var myStore = new SequelizeStore({
  db: sequelize,
});

// you can stop expiring sessions (cancel the interval). Example using Mocha:
after("clean up resources", () => {
  myStore.stopExpiringSessions();
});
```

# Add custom field(s) as a column

The additionalFields option can be used to add custom fields to the session table. These fields will be writable and can be inserted or updated as needed. The extendDefaultFields function should be used to include these fields when the session is created or updated. 
```javascript
const SequelizeStore = require("connect-session-sequelize")(session.Store);
var sequelize = new Sequelize("database", "username", "password", {
  dialect: "sqlite",
  storage: "./session.sqlite",
});

// Configuration to add custom fields
var store = new SequelizeStore({
  db: sequelize,
  table: "Session",
  additionalFields: {
    userId: Sequelize.STRING,
  },
  extendDefaultFields: (defaults, session) => {
    return {
      ...defaults,
      userId: session.userId || null,
    };
  },
});

var app = express();
app.use(
  session({
    secret: "keyboard cat",
    store: store,
    resave: false,
    proxy: true,
  })
);

store.sync();
```

# License

MIT
