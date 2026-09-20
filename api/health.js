const { neon } = require('@neondatabase/serverless');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método não permitido' });
  }

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    return res.status(503).json({ ok: false, database: 'missing_environment_variable' });
  }

  try {
    const sql = neon(connectionString);
    const result = await sql`SELECT 1 AS connected`;
    return res.status(200).json({ ok: true, database: result[0]?.connected === 1 });
  } catch (error) {
    console.error('Database health check failed', error);
    return res.status(503).json({ ok: false, database: 'unavailable' });
  }
};
