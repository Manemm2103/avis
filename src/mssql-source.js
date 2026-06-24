import sql from "mssql";

export function isMssqlConfigured(config) {
  return Boolean(config.host && config.database && config.user && config.password && config.query);
}

export async function fetchOrdersFromMssql(config) {
  if (!isMssqlConfigured(config)) {
    return [];
  }

  return fetchRowsFromMssql(config, config.query);
}

export async function fetchToursFromMssql(config) {
  if (!hasMssqlConnection(config) || !config.toursQuery) {
    return [];
  }

  return fetchRowsFromMssql(config, config.toursQuery);
}

function hasMssqlConnection(config) {
  return Boolean(config.host && config.database && config.user && config.password);
}

async function fetchRowsFromMssql(config, query) {
  const pool = new sql.ConnectionPool({
    server: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    options: {
      encrypt: config.encrypt,
      trustServerCertificate: config.trustServerCertificate
    }
  });

  try {
    await pool.connect();
    const result = await pool.request().query(query);
    return result.recordset || [];
  } finally {
    await pool.close();
  }
}
