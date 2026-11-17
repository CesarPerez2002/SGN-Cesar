import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './security.ts';
import { buildSqlServerConfigFromEnv } from './sqlserver-repository.ts';

test('buildSqlServerConfigFromEnv returns null when MSSQL_SERVER is empty', () => {
  assert.equal(buildSqlServerConfigFromEnv({}), null);
  assert.equal(buildSqlServerConfigFromEnv({ MSSQL_SERVER: '   ' }), null);
});

test('buildSqlServerConfigFromEnv parses host and port for local SQL Server', () => {
  const config = buildSqlServerConfigFromEnv({
    MSSQL_SERVER: 'localhost',
    MSSQL_PORT: '1433',
    MSSQL_DATABASE: 'SGN_Negocios',
    MSSQL_USER: 'sa',
    MSSQL_PASSWORD: 'MiPassword123!',
  });

  assert.deepEqual(config, {
    server: 'localhost',
    port: 1433,
    database: 'SGN_Negocios',
    user: 'sa',
    password: 'MiPassword123!',
    driver: 'tedious',
    options: {
      trustedConnection: false,
      encrypt: false,
      trustServerCertificate: true,
    },
  });
});

test('buildSqlServerConfigFromEnv supports SQL Server Express named instances', () => {
  const config = buildSqlServerConfigFromEnv({
    MSSQL_SERVER: 'localhost\\SQLEXPRESS',
    MSSQL_DATABASE: 'SGN_Local',
    MSSQL_USER: 'sgn_app',
    MSSQL_PASSWORD: 'secret',
    MSSQL_ENCRYPT: 'true',
    MSSQL_TRUST_SERVER_CERTIFICATE: 'false',
  });

  assert.deepEqual(config, {
    server: 'localhost',
    database: 'SGN_Local',
    user: 'sgn_app',
    password: 'secret',
    driver: 'tedious',
    options: {
      instanceName: 'SQLEXPRESS',
      trustedConnection: false,
      encrypt: true,
      trustServerCertificate: false,
    },
  });
});

test('buildSqlServerConfigFromEnv supports (localdb)\\MSSQLLocalDB with Windows Auth', () => {
  const config = buildSqlServerConfigFromEnv({
    MSSQL_SERVER: '(localdb)\\MSSQLLocalDB',
    MSSQL_DATABASE: 'SGN_Negocios',
    MSSQL_TRUSTED_CONNECTION: 'true',
  });

  assert.deepEqual(config, {
    server: '(localdb)',
    database: 'SGN_Negocios',
    user: '',
    password: '',
    driver: 'msnodesqlv8',
    options: {
      instanceName: 'MSSQLLocalDB',
      trustedConnection: true,
      encrypt: false,
      trustServerCertificate: true,
    },
  });
});

test('buildSqlServerConfigFromEnv throws helpful error if MSSQL_USER is missing', () => {
  assert.throws(
    () =>
      buildSqlServerConfigFromEnv({
        MSSQL_SERVER: 'localhost',
        MSSQL_DATABASE: 'SGN_Negocios',
      }),
    /MSSQL_USER/,
  );
});

test('hashPassword and verifyPassword securely validate user passwords', () => {
  const hash = hashPassword('Admin123!');
  assert.ok(hash.includes(':'));
  assert.equal(verifyPassword('Admin123!', hash), true);
  assert.equal(verifyPassword('WrongPass', hash), false);
});
