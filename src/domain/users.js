// Student accounts. There are no passwords by design (judges switch users in one click); the number of accounts is capped.
const config = require('../config');
const { HttpError, db, save } = require('./core');

function createStudent(rawName) {
  const name = String(rawName || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 40);
  if (!name) throw new HttpError(400, 'Please enter a name.');
  if (db().users.filter(u => u.role === 'student').length >= config.maxStudents()) throw new HttpError(429, 'Too many accounts. Ask the admin to reset the data.');
  const user = { id: 'u' + db().seq.user++, name, role: 'student', dept: null, createdAt: Date.now(), trust: 50 };
  db().users.push(user); save();
  return user;
}

const publicUser = u => ({ id: u.id, name: u.name, role: u.role, dept: u.dept, trust: u.role === 'student' ? u.trust : null, createdAt: u.createdAt });

module.exports = { createStudent, publicUser };
