const auth = require('../config/dashboard-auth.json');
const { createSession, sessionCookie } = require('../lib/auth');

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      const { user, password } = JSON.parse(body);
      if (user === auth.user && password === auth.password) {
        const token = createSession(user);
        res.setHeader('Set-Cookie', sessionCookie(token));
        return res.status(200).json({ ok: true, user });
      }
      return res.status(401).json({ error: 'Credenciais invalidas' });
    } catch {
      return res.status(400).json({ error: 'JSON invalido' });
    }
  });
};