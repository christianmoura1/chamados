const { clearSessionCookie } = require('../lib/auth');
module.exports = function handler(req, res) {
res.setHeader('Content-Type', 'application/json; charset=utf-8');
if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });
res.setHeader('Set-Cookie', clearSessionCookie());
return res.status(200).json({ ok: true });
};