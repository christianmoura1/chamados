const { verifySession } = require('../lib/auth');
module.exports = function handler(req, res) {
res.setHeader('Content-Type', 'application/json; charset=utf-8');
if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo nao permitido' });
const ok = verifySession(req);
return res.status(ok ? 200 : 401).json({ authenticated: ok });
};