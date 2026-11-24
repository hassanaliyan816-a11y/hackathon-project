// The domain layer's public API. The HTTP layer only talks to this file.
//   core.js     data handle, errors          trust.js   trust ledger and weights
//   crowd.js    crowd priority, brigading    voting.js  verification of fixes, auto-close
//   issues.js   reports, grouping, actions   views.js   what each role may see
//   users.js    accounts                     admin.js   AI summary and Word-export data
const core = require('./core');
const issues = require('./issues');
const views = require('./views');
const trust = require('./trust');
const users = require('./users');
const admin = require('./admin');
const { tick } = require('./voting');

module.exports = {
  HttpError: core.HttpError, userById: core.userById,
  submitReport: issues.submitReport, join: issues.join, vote: issues.vote, setStatus: issues.setStatus, reassign: issues.reassign,
  listIssues: views.listIssues, trending: views.trending,
  trustView: trust.trustView, createStudent: users.createStudent, publicUser: users.publicUser,
  adminSummary: admin.adminSummary, exportViews: admin.exportViews, tick,
};
