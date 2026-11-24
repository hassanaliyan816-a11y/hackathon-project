// Shared basics for the domain modules: the data handle, HTTP-style errors and small lookups.
const Store = require('../storage/store');

const MIN = 60000;                              // one minute in milliseconds
const OPEN = ['new', 'in_progress', 'reopened']; // statuses that still need work

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

const db = () => Store.get();
const save = () => Store.save();
const userById = id => db().users.find(u => u.id === id);
const issueById = id => db().issues.find(i => i.id === Number(id));
const logEvent = (issue, text) => issue.history.push({ ts: Date.now(), text });

module.exports = { MIN, OPEN, HttpError, db, save, userById, issueById, logEvent };
