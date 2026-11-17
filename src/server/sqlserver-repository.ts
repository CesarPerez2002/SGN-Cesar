import crypto from 'node:crypto';
import sql, { type config as SqlConfig } from 'mssql';
import {
  calculateLineTotal,
  calculateOrderTotals,
  getStockStatus,
  roundCurrency,
  validatePurchaseCart,
  validateSaleCart,
} from '../shared/businessLogic.ts';
import type {
  Categoria,
  Cliente,
  Compra,
  DatosNegocio,
  DetalleCompra,
  DetalleVenta,
  EstadoCompra,
  MetodoPago,
  Producto,
  Proveedor,
  ResumenDashboard,
  RolUsuario,
  Usuario,
  Venta,
} from '../shared/types.ts';
import { DomainError, hashPassword, verifyPassword } from './security.ts';

export interface SqlServerEnvConfig {
  server: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  driver?: 'tedious' | 'msnodesqlv8';
  odbcDriver?: string;
  connectionString?: string;
  options: {
    instanceName?: string;
    trustedConnection?: boolean;
    encrypt: boolean;
    trustServerCertificate: boolean;
  };
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

export function buildSqlServerConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SqlServerEnvConfig | null {
  const connectionString = (env.MSSQL_CONNECTION_STRING ?? '').trim();
  const database = (env.MSSQL_DATABASE ?? 'SGN_Negocios').trim() || 'SGN_Negocios';
  const encrypt = parseBool(env.MSSQL_ENCRYPT, false);
  const trustServerCertificate = parseBool(env.MSSQL_TRUST_SERVER_CERTIFICATE, true);
  const odbcDriver = (env.MSSQL_ODBC_DRIVER ?? '').trim() || undefined;

  if (connectionString) {
    const usesNativeDriver =
      /trusted_connection\s*=\s*(yes|true|1)/i.test(connectionString) ||
      /\(localdb\)/i.test(connectionString);
    return {
      server: 'custom',
      database,
      user: '',
      password: '',
      driver: usesNativeDriver ? 'msnodesqlv8' : 'tedious',
      odbcDriver,
      connectionString,
      options: {
        trustedConnection: usesNativeDriver,
        encrypt,
        trustServerCertificate,
      },
    };
  }

  const rawServer = (env.MSSQL_SERVER ?? '').trim();
  if (!rawServer) return null;

  let server = rawServer;
  let instanceName = (env.MSSQL_INSTANCE ?? '').trim() || undefined;

  // Support host\INSTANCE or (localdb)\MSSQLLocalDB format directly in MSSQL_SERVER
  if (!instanceName && rawServer.includes('\\')) {
    const [hostPart, instPart] = rawServer.split('\\');
    server = hostPart.trim() || 'localhost';
    instanceName = instPart?.trim() || undefined;
  }

  const isLocalDb = server.toLowerCase() === '(localdb)';
  const user = (env.MSSQL_USER ?? '').trim();
  const password = env.MSSQL_PASSWORD ?? '';
  const trustedConnection =
    parseBool(env.MSSQL_TRUSTED_CONNECTION, false) || (isLocalDb && !user);

  if (!trustedConnection && !user) {
    throw new Error(
      'MSSQL_SERVER está definido, pero falta MSSQL_USER para autenticar en SQL Server (o active MSSQL_TRUSTED_CONNECTION=true para Autenticación de Windows).',
    );
  }

  const useNativeDriver = trustedConnection || isLocalDb;
  const parsedPort = Number(env.MSSQL_PORT);
  const port = !instanceName && !isLocalDb
    ? Number.isInteger(parsedPort) && parsedPort > 0
      ? parsedPort
      : 1433
    : undefined;

  return {
    server,
    ...(port !== undefined ? { port } : {}),
    database,
    user,
    password,
    driver: useNativeDriver ? 'msnodesqlv8' : 'tedious',
    ...(odbcDriver ? { odbcDriver } : {}),
    options: {
      ...(instanceName ? { instanceName } : {}),
      trustedConnection,
      encrypt,
      trustServerCertificate,
    },
  };
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function toNullableIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return toIso(value);
}

const DEFAULT_BUSINESS_PROFILE: DatosNegocio = {
  businessName: 'Mi Negocio',
  legalName: '',
  rtn: '',
  phone: '',
  email: '',
  address: '',
  cai: '',
  invoiceFooter: 'Gracias por su compra.',
  updatedAt: new Date().toISOString(),
};

const SCHEMA_BOOTSTRAP_SQL = `
IF OBJECT_ID('dbo.DatosNegocio', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.DatosNegocio (
    Id INT PRIMARY KEY CHECK (Id = 1),
    NombreComercial NVARCHAR(150) NOT NULL,
    RazonSocial NVARCHAR(180) NULL,
    RTN NVARCHAR(30) NULL,
    Telefono NVARCHAR(30) NULL,
    Correo NVARCHAR(150) NULL,
    Direccion NVARCHAR(250) NULL,
    CAI NVARCHAR(80) NULL,
    PieFactura NVARCHAR(300) NULL,
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.Usuarios', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Usuarios (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    NombreCompleto NVARCHAR(120) NOT NULL,
    NombreUsuario NVARCHAR(60) NOT NULL UNIQUE,
    Correo NVARCHAR(150) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    Rol NVARCHAR(20) NOT NULL CHECK (Rol IN ('Administrador', 'Cajero')),
    Activo BIT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UltimoAcceso DATETIME2 NULL
  );
END;

IF OBJECT_ID('dbo.Categorias', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Categorias (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(80) NOT NULL UNIQUE,
    Descripcion NVARCHAR(250) NULL
  );
END;

IF OBJECT_ID('dbo.Productos', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Productos (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    SKU NVARCHAR(40) NOT NULL UNIQUE,
    Nombre NVARCHAR(150) NOT NULL,
    Descripcion NVARCHAR(400) NULL,
    CategoriaId INT NOT NULL,
    PrecioVenta DECIMAL(12,2) NOT NULL CHECK (PrecioVenta >= 0),
    CostoCompra DECIMAL(12,2) NOT NULL CHECK (CostoCompra >= 0),
    Existencia INT NOT NULL DEFAULT 0 CHECK (Existencia >= 0),
    StockMinimo INT NOT NULL DEFAULT 5 CHECK (StockMinimo >= 0),
    Activo BIT NOT NULL DEFAULT 1,
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Productos_Categorias FOREIGN KEY (CategoriaId) REFERENCES dbo.Categorias(Id)
  );
END;

IF OBJECT_ID('dbo.Clientes', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Clientes (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(150) NOT NULL,
    RTN NVARCHAR(30) NULL,
    Telefono NVARCHAR(30) NOT NULL,
    Correo NVARCHAR(150) NULL,
    Direccion NVARCHAR(250) NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.Proveedores', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Proveedores (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    RazonSocial NVARCHAR(150) NOT NULL,
    ContactoPrincipal NVARCHAR(120) NOT NULL,
    RTN NVARCHAR(30) NULL,
    Telefono NVARCHAR(30) NOT NULL,
    Correo NVARCHAR(150) NULL,
    Direccion NVARCHAR(250) NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.Ventas', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Ventas (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Folio NVARCHAR(30) NOT NULL UNIQUE,
    NumeroFactura NVARCHAR(30) NOT NULL UNIQUE,
    ClienteId INT NOT NULL,
    ClienteNombre NVARCHAR(150) NOT NULL,
    ClienteRTN NVARCHAR(30) NULL,
    ClienteTelefono NVARCHAR(30) NULL,
    ClienteDireccion NVARCHAR(250) NULL,
    UsuarioId INT NOT NULL,
    UsuarioNombre NVARCHAR(120) NOT NULL,
    MetodoPago NVARCHAR(20) NOT NULL CHECK (MetodoPago IN ('Efectivo', 'Tarjeta', 'Transferencia')),
    IncluyeISV BIT NOT NULL DEFAULT 1,
    Subtotal DECIMAL(12,2) NOT NULL,
    ISV DECIMAL(12,2) NOT NULL,
    Total DECIMAL(12,2) NOT NULL,
    Notas NVARCHAR(300) NULL,
    DatosNegocioSnapshot NVARCHAR(MAX) NULL,
    FechaVenta DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Ventas_Clientes FOREIGN KEY (ClienteId) REFERENCES dbo.Clientes(Id),
    CONSTRAINT FK_Ventas_Usuarios FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios(Id)
  );
END;

IF OBJECT_ID('dbo.DetalleVentas', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.DetalleVentas (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    VentaId INT NOT NULL,
    ProductoId INT NOT NULL,
    ProductoSKU NVARCHAR(40) NOT NULL,
    ProductoNombre NVARCHAR(150) NOT NULL,
    Cantidad INT NOT NULL CHECK (Cantidad > 0),
    PrecioUnitario DECIMAL(12,2) NOT NULL,
    ImporteLinea DECIMAL(12,2) NOT NULL,
    CONSTRAINT FK_DetalleVentas_Ventas FOREIGN KEY (VentaId) REFERENCES dbo.Ventas(Id) ON DELETE CASCADE,
    CONSTRAINT FK_DetalleVentas_Productos FOREIGN KEY (ProductoId) REFERENCES dbo.Productos(Id)
  );
END;

IF OBJECT_ID('dbo.Compras', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Compras (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Folio NVARCHAR(30) NOT NULL UNIQUE,
    ProveedorId INT NOT NULL,
    UsuarioId INT NOT NULL,
    Estado NVARCHAR(20) NOT NULL CHECK (Estado IN ('Pendiente', 'Confirmada')),
    IncluyeISV BIT NOT NULL DEFAULT 1,
    Subtotal DECIMAL(12,2) NOT NULL,
    ISV DECIMAL(12,2) NOT NULL,
    Total DECIMAL(12,2) NOT NULL,
    Notas NVARCHAR(300) NULL,
    FechaCompra DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaConfirmacion DATETIME2 NULL,
    CONSTRAINT FK_Compras_Proveedores FOREIGN KEY (ProveedorId) REFERENCES dbo.Proveedores(Id),
    CONSTRAINT FK_Compras_Usuarios FOREIGN KEY (UsuarioId) REFERENCES dbo.Usuarios(Id)
  );
END;

IF OBJECT_ID('dbo.DetalleCompras', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.DetalleCompras (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    CompraId INT NOT NULL,
    ProductoId INT NOT NULL,
    ProductoSKU NVARCHAR(40) NOT NULL,
    ProductoNombre NVARCHAR(150) NOT NULL,
    Cantidad INT NOT NULL CHECK (Cantidad > 0),
    CostoUnitario DECIMAL(12,2) NOT NULL,
    ImporteLinea DECIMAL(12,2) NOT NULL,
    CONSTRAINT FK_DetalleCompras_Compras FOREIGN KEY (CompraId) REFERENCES dbo.Compras(Id) ON DELETE CASCADE,
    CONSTRAINT FK_DetalleCompras_Productos FOREIGN KEY (ProductoId) REFERENCES dbo.Productos(Id)
  );
END;
`;

export class SqlServerRepository {
  private pool: sql.ConnectionPool;
  private sqlDriver: typeof sql;

  private constructor(pool: sql.ConnectionPool, sqlDriver: typeof sql = sql) {
    this.pool = pool;
    this.sqlDriver = sqlDriver;
  }

  private static buildOdbcConnectionString(
    envConfig: SqlServerEnvConfig,
    driverName: string,
    targetDatabase: string,
  ): string {
    const serverTarget = envConfig.options.instanceName
      ? `${envConfig.server}\\${envConfig.options.instanceName}`
      : `${envConfig.server},${envConfig.port ?? 1433}`;
    const authPart = envConfig.options.trustedConnection
      ? 'Trusted_Connection=Yes;'
      : `Uid=${envConfig.user};Pwd=${envConfig.password};`;
    const encryptPart = `Encrypt=${envConfig.options.encrypt ? 'Yes' : 'No'};TrustServerCertificate=${envConfig.options.trustServerCertificate ? 'Yes' : 'No'};`;
    return `Driver={${driverName}};Server=${serverTarget};Database=${targetDatabase};${authPart}${encryptPart}`;
  }

  private static isOdbcDriverMissingError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('IM002') ||
      /data source name not found/i.test(msg) ||
      /no se encuentra el nombre del origen de datos/i.test(msg)
    );
  }

  private static isDatabaseMissingError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      /cannot open database/i.test(msg) ||
      /no se puede abrir la base de datos/i.test(msg)
    );
  }

  private static async openPool(
    activeSql: typeof sql,
    envConfig: SqlServerEnvConfig,
    targetDatabase: string,
  ): Promise<sql.ConnectionPool> {
    if (envConfig.driver === 'msnodesqlv8') {
      if (envConfig.connectionString) {
        const pool = new activeSql.ConnectionPool({
          connectionString: envConfig.connectionString,
          pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
        } as unknown as SqlConfig);
        return pool.connect();
      }

      const candidateDrivers = envConfig.odbcDriver
        ? [envConfig.odbcDriver]
        : [
            'ODBC Driver 18 for SQL Server',
            'ODBC Driver 17 for SQL Server',
            'SQL Server Native Client 11.0',
            'SQL Server',
          ];

      let lastErr: unknown;
      for (const driverName of candidateDrivers) {
        const connStr = SqlServerRepository.buildOdbcConnectionString(
          envConfig,
          driverName,
          targetDatabase,
        );
        try {
          const pool = new activeSql.ConnectionPool({
            connectionString: connStr,
            pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
          } as unknown as SqlConfig);
          return await pool.connect();
        } catch (err) {
          lastErr = err;
          if (!SqlServerRepository.isOdbcDriverMissingError(err)) {
            throw err;
          }
        }
      }
      throw lastErr;
    }

    const poolConfig: SqlConfig = {
      server: envConfig.server,
      ...(envConfig.port !== undefined ? { port: envConfig.port } : {}),
      database: targetDatabase,
      user: envConfig.user,
      password: envConfig.password,
      options: envConfig.options,
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };

    return new activeSql.ConnectionPool(poolConfig).connect();
  }

  static async connect(envConfig: SqlServerEnvConfig): Promise<SqlServerRepository> {
    let activeSql: typeof sql = sql;
    if (envConfig.driver === 'msnodesqlv8') {
      try {
        const mod = await import('mssql/msnodesqlv8');
        activeSql = ((mod as { default?: unknown }).default ?? mod) as unknown as typeof sql;
      } catch {
        throw new Error(
          'Para conectar con (localdb)\\MSSQLLocalDB o Autenticación de Windows en Node.js, ejecute primero en la terminal: npm install msnodesqlv8',
        );
      }
    }

    let pool: sql.ConnectionPool;
    try {
      pool = await SqlServerRepository.openPool(activeSql, envConfig, envConfig.database);
    } catch (err) {
      if (!envConfig.connectionString && SqlServerRepository.isDatabaseMissingError(err)) {
        // Connect to master to auto-create the database on local SQL Server if missing
        const masterPool = await SqlServerRepository.openPool(activeSql, envConfig, 'master');
        try {
          await masterPool
            .request()
            .input('DbName', activeSql.NVarChar(128), envConfig.database)
            .query(`
              IF DB_ID(@DbName) IS NULL
              BEGIN
                DECLARE @createSql NVARCHAR(MAX) = N'CREATE DATABASE ' + QUOTENAME(@DbName);
                EXEC sp_executesql @createSql;
              END
            `);
        } finally {
          await masterPool.close();
        }
        pool = await SqlServerRepository.openPool(activeSql, envConfig, envConfig.database);
      } else {
        throw err;
      }
    }

    const repo = new SqlServerRepository(pool, activeSql);
    await repo.ensureSchemaAndInitialAdmin();
    return repo;
  }

  async close(): Promise<void> {
    await this.pool.close();
  }

  private async ensureSchemaAndInitialAdmin(): Promise<void> {
    await this.pool.request().batch(SCHEMA_BOOTSTRAP_SQL);

    const bizCheck = await this.pool
      .request()
      .query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM dbo.DatosNegocio WHERE Id = 1');
    if ((bizCheck.recordset[0]?.cnt ?? 0) === 0) {
      await this.pool
        .request()
        .input('NombreComercial', sql.NVarChar(150), DEFAULT_BUSINESS_PROFILE.businessName)
        .input('PieFactura', sql.NVarChar(300), DEFAULT_BUSINESS_PROFILE.invoiceFooter)
        .query(`
          INSERT INTO dbo.DatosNegocio (Id, NombreComercial, RazonSocial, RTN, Telefono, Correo, Direccion, CAI, PieFactura)
          VALUES (1, @NombreComercial, '', '', '', '', '', '', @PieFactura)
        `);
    }

    const userCheck = await this.pool
      .request()
      .query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM dbo.Usuarios');
    if ((userCheck.recordset[0]?.cnt ?? 0) === 0) {
      await this.pool
        .request()
        .input('NombreCompleto', sql.NVarChar(120), 'Administrador General')
        .input('NombreUsuario', sql.NVarChar(60), 'admin')
        .input('Correo', sql.NVarChar(150), 'admin@sgn-negocios.com')
        .input('PasswordHash', sql.NVarChar(255), hashPassword('Admin123!'))
        .input('Rol', sql.NVarChar(20), 'Administrador')
        .query(`
          INSERT INTO dbo.Usuarios (NombreCompleto, NombreUsuario, Correo, PasswordHash, Rol, Activo)
          VALUES (@NombreCompleto, @NombreUsuario, @Correo, @PasswordHash, @Rol, 1)
        `);
    }
  }

  async getBusinessProfile(): Promise<DatosNegocio> {
    const res = await this.pool.request().query<{
      NombreComercial: string;
      RazonSocial: string | null;
      RTN: string | null;
      Telefono: string | null;
      Correo: string | null;
      Direccion: string | null;
      CAI: string | null;
      PieFactura: string | null;
      FechaActualizacion: Date;
    }>(`
      SELECT TOP 1 NombreComercial, RazonSocial, RTN, Telefono, Correo, Direccion, CAI, PieFactura, FechaActualizacion
      FROM dbo.DatosNegocio WHERE Id = 1
    `);

    const row = res.recordset[0];
    if (!row) return { ...DEFAULT_BUSINESS_PROFILE, updatedAt: new Date().toISOString() };

    return {
      businessName: row.NombreComercial,
      legalName: row.RazonSocial ?? '',
      rtn: row.RTN ?? '',
      phone: row.Telefono ?? '',
      email: row.Correo ?? '',
      address: row.Direccion ?? '',
      cai: row.CAI ?? '',
      invoiceFooter: row.PieFactura ?? 'Gracias por su compra.',
      updatedAt: toIso(row.FechaActualizacion),
    };
  }

  async updateBusinessProfile(input: Partial<DatosNegocio>): Promise<DatosNegocio> {
    const businessName = (input.businessName ?? '').trim();
    if (!businessName) {
      throw new DomainError('El nombre comercial del negocio es obligatorio.');
    }

    const legalName = (input.legalName ?? '').trim();
    const rtn = (input.rtn ?? '').trim().toUpperCase();
    const phone = (input.phone ?? '').trim();
    const email = (input.email ?? '').trim().toLowerCase();
    const address = (input.address ?? '').trim();
    const cai = (input.cai ?? '').trim().toUpperCase();
    const invoiceFooter = (input.invoiceFooter ?? '').trim() || 'Gracias por su compra.';

    await this.pool
      .request()
      .input('NombreComercial', sql.NVarChar(150), businessName)
      .input('RazonSocial', sql.NVarChar(180), legalName)
      .input('RTN', sql.NVarChar(30), rtn)
      .input('Telefono', sql.NVarChar(30), phone)
      .input('Correo', sql.NVarChar(150), email)
      .input('Direccion', sql.NVarChar(250), address)
      .input('CAI', sql.NVarChar(80), cai)
      .input('PieFactura', sql.NVarChar(300), invoiceFooter)
      .query(`
        UPDATE dbo.DatosNegocio
        SET NombreComercial = @NombreComercial,
            RazonSocial = @RazonSocial,
            RTN = @RTN,
            Telefono = @Telefono,
            Correo = @Correo,
            Direccion = @Direccion,
            CAI = @CAI,
            PieFactura = @PieFactura,
            FechaActualizacion = SYSUTCDATETIME()
        WHERE Id = 1
      `);

    return this.getBusinessProfile();
  }

  private mapUserRow(row: {
    Id: number;
    NombreCompleto: string;
    NombreUsuario: string;
    Correo: string;
    Rol: RolUsuario;
    Activo: boolean;
    FechaCreacion: Date;
    UltimoAcceso: Date | null;
  }): Usuario {
    return {
      id: row.Id,
      fullName: row.NombreCompleto,
      username: row.NombreUsuario,
      email: row.Correo,
      role: row.Rol === 'Administrador' ? 'Administrador' : 'Cajero',
      active: Boolean(row.Activo),
      createdAt: toIso(row.FechaCreacion),
      lastLoginAt: toNullableIso(row.UltimoAcceso),
    };
  }

  async authenticate(identifier: string, password: string): Promise<Usuario> {
    const cleanId = identifier.trim().toLowerCase();
    if (!cleanId || !password) {
      throw new DomainError(
        'Por favor ingrese su usuario o correo electrónico y su contraseña.',
        400,
      );
    }

    const res = await this.pool
      .request()
      .input('Identifier', sql.NVarChar(150), cleanId)
      .query<{
        Id: number;
        NombreCompleto: string;
        NombreUsuario: string;
        Correo: string;
        PasswordHash: string;
        Rol: RolUsuario;
        Activo: boolean;
        FechaCreacion: Date;
        UltimoAcceso: Date | null;
      }>(`
        SELECT TOP 1 Id, NombreCompleto, NombreUsuario, Correo, PasswordHash, Rol, Activo, FechaCreacion, UltimoAcceso
        FROM dbo.Usuarios
        WHERE LOWER(NombreUsuario) = @Identifier OR LOWER(Correo) = @Identifier
      `);

    const found = res.recordset[0];
    if (!found || !verifyPassword(password, found.PasswordHash)) {
      throw new DomainError(
        'Las credenciales proporcionadas no son válidas. Verifique su usuario/correo y contraseña.',
        401,
      );
    }

    if (!found.Activo) {
      throw new DomainError(
        'Esta cuenta se encuentra desactivada. Contacte al Administrador del sistema.',
        403,
      );
    }

    await this.pool
      .request()
      .input('Id', sql.Int, found.Id)
      .query('UPDATE dbo.Usuarios SET UltimoAcceso = SYSUTCDATETIME() WHERE Id = @Id');

    const updated = await this.getUserById(found.Id);
    if (!updated) throw new DomainError('Error al cargar el usuario.', 500);
    return updated;
  }

  async getUserById(id: number): Promise<Usuario | null> {
    const res = await this.pool
      .request()
      .input('Id', sql.Int, id)
      .query<{
        Id: number;
        NombreCompleto: string;
        NombreUsuario: string;
        Correo: string;
        Rol: RolUsuario;
        Activo: boolean;
        FechaCreacion: Date;
        UltimoAcceso: Date | null;
      }>(`
        SELECT TOP 1 Id, NombreCompleto, NombreUsuario, Correo, Rol, Activo, FechaCreacion, UltimoAcceso
        FROM dbo.Usuarios WHERE Id = @Id
      `);
    const row = res.recordset[0];
    return row ? this.mapUserRow(row) : null;
  }

  async listUsers(): Promise<Usuario[]> {
    const res = await this.pool.request().query<{
      Id: number;
      NombreCompleto: string;
      NombreUsuario: string;
      Correo: string;
      Rol: RolUsuario;
      Activo: boolean;
      FechaCreacion: Date;
      UltimoAcceso: Date | null;
    }>(`
      SELECT Id, NombreCompleto, NombreUsuario, Correo, Rol, Activo, FechaCreacion, UltimoAcceso
      FROM dbo.Usuarios ORDER BY Id ASC
    `);
    return res.recordset.map((r) => this.mapUserRow(r));
  }

  async createUser(input: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    role: RolUsuario;
    active: boolean;
  }): Promise<Usuario> {
    const fullName = input.fullName.trim();
    const username = input.username.trim();
    const email = input.email.trim().toLowerCase();

    if (!fullName || !username || !email || !input.password) {
      throw new DomainError('Todos los campos del usuario son obligatorios.');
    }
    if (input.password.length < 6) {
      throw new DomainError('La contraseña debe tener al menos 6 caracteres.');
    }

    const dupUser = await this.pool
      .request()
      .input('Username', sql.NVarChar(60), username.toLowerCase())
      .input('Email', sql.NVarChar(150), email)
      .query<{ NombreUsuario: string; Correo: string }>(`
        SELECT NombreUsuario, Correo FROM dbo.Usuarios
        WHERE LOWER(NombreUsuario) = @Username OR LOWER(Correo) = @Email
      `);

    if (dupUser.recordset.length > 0) {
      const match = dupUser.recordset[0];
      if (match.NombreUsuario.toLowerCase() === username.toLowerCase()) {
        throw new DomainError('El nombre de usuario ya se encuentra registrado.');
      }
      throw new DomainError('El correo electrónico ya se encuentra registrado.');
    }

    const role: RolUsuario = input.role === 'Administrador' ? 'Administrador' : 'Cajero';
    const inserted = await this.pool
      .request()
      .input('NombreCompleto', sql.NVarChar(120), fullName)
      .input('NombreUsuario', sql.NVarChar(60), username)
      .input('Correo', sql.NVarChar(150), email)
      .input('PasswordHash', sql.NVarChar(255), hashPassword(input.password))
      .input('Rol', sql.NVarChar(20), role)
      .input('Activo', sql.Bit, input.active ? 1 : 0)
      .query<{ Id: number }>(`
        INSERT INTO dbo.Usuarios (NombreCompleto, NombreUsuario, Correo, PasswordHash, Rol, Activo)
        OUTPUT INSERTED.Id
        VALUES (@NombreCompleto, @NombreUsuario, @Correo, @PasswordHash, @Rol, @Activo)
      `);

    const created = await this.getUserById(inserted.recordset[0].Id);
    if (!created) throw new DomainError('No fue posible recuperar el usuario creado.', 500);
    return created;
  }

  async updateUser(
    id: number,
    actingUserId: number,
    input: {
      fullName: string;
      username: string;
      email: string;
      password?: string;
      role: RolUsuario;
      active: boolean;
    },
  ): Promise<Usuario> {
    const existing = await this.getUserById(id);
    if (!existing) throw new DomainError('Usuario no encontrado.', 404);

    const fullName = input.fullName.trim();
    const username = input.username.trim();
    const email = input.email.trim().toLowerCase();

    if (!fullName || !username || !email) {
      throw new DomainError('Nombre completo, usuario y correo son obligatorios.');
    }
    if (id === actingUserId && (!input.active || input.role !== 'Administrador')) {
      throw new DomainError(
        'No puede desactivar su propia cuenta ni retirar sus privilegios de Administrador.',
      );
    }

    const dupCheck = await this.pool
      .request()
      .input('Id', sql.Int, id)
      .input('Username', sql.NVarChar(60), username.toLowerCase())
      .input('Email', sql.NVarChar(150), email)
      .query<{ NombreUsuario: string; Correo: string }>(`
        SELECT NombreUsuario, Correo FROM dbo.Usuarios
        WHERE Id <> @Id AND (LOWER(NombreUsuario) = @Username OR LOWER(Correo) = @Email)
      `);

    if (dupCheck.recordset.length > 0) {
      if (dupCheck.recordset[0].NombreUsuario.toLowerCase() === username.toLowerCase()) {
        throw new DomainError('El nombre de usuario ya está en uso por otra cuenta.');
      }
      throw new DomainError('El correo electrónico ya está en uso por otra cuenta.');
    }

    const role: RolUsuario = input.role === 'Administrador' ? 'Administrador' : 'Cajero';
    const newPassword = input.password?.trim();
    if (newPassword && newPassword.length > 0 && newPassword.length < 6) {
      throw new DomainError('La nueva contraseña debe tener al menos 6 caracteres.');
    }

    const req = this.pool
      .request()
      .input('Id', sql.Int, id)
      .input('NombreCompleto', sql.NVarChar(120), fullName)
      .input('NombreUsuario', sql.NVarChar(60), username)
      .input('Correo', sql.NVarChar(150), email)
      .input('Rol', sql.NVarChar(20), role)
      .input('Activo', sql.Bit, input.active ? 1 : 0);

    if (newPassword && newPassword.length > 0) {
      req.input('PasswordHash', sql.NVarChar(255), hashPassword(newPassword));
      await req.query(`
        UPDATE dbo.Usuarios
        SET NombreCompleto = @NombreCompleto,
            NombreUsuario = @NombreUsuario,
            Correo = @Correo,
            Rol = @Rol,
            Activo = @Activo,
            PasswordHash = @PasswordHash
        WHERE Id = @Id
      `);
    } else {
      await req.query(`
        UPDATE dbo.Usuarios
        SET NombreCompleto = @NombreCompleto,
            NombreUsuario = @NombreUsuario,
            Correo = @Correo,
            Rol = @Rol,
            Activo = @Activo
        WHERE Id = @Id
      `);
    }

    const updated = await this.getUserById(id);
    if (!updated) throw new DomainError('Usuario no encontrado.', 404);
    return updated;
  }

  async listCategories(): Promise<Categoria[]> {
    const res = await this.pool.request().query<{
      Id: number;
      Nombre: string;
      Descripcion: string | null;
    }>('SELECT Id, Nombre, Descripcion FROM dbo.Categorias ORDER BY Nombre ASC');

    return res.recordset.map((r) => ({
      id: r.Id,
      name: r.Nombre,
      description: r.Descripcion ?? '',
    }));
  }

  async createCategory(input: { name: string; description: string }): Promise<Categoria> {
    const name = input.name.trim();
    if (!name) throw new DomainError('El nombre de la categoría es obligatorio.');

    const dup = await this.pool
      .request()
      .input('Name', sql.NVarChar(80), name.toLowerCase())
      .query<{ Id: number }>('SELECT Id FROM dbo.Categorias WHERE LOWER(Nombre) = @Name');
    if (dup.recordset.length > 0) {
      throw new DomainError('Ya existe una categoría con ese nombre.');
    }

    const description = (input.description ?? '').trim();
    const res = await this.pool
      .request()
      .input('Nombre', sql.NVarChar(80), name)
      .input('Descripcion', sql.NVarChar(250), description)
      .query<{ Id: number }>(`
        INSERT INTO dbo.Categorias (Nombre, Descripcion)
        OUTPUT INSERTED.Id
        VALUES (@Nombre, @Descripcion)
      `);

    return {
      id: res.recordset[0].Id,
      name,
      description,
    };
  }

  async updateCategory(
    id: number,
    input: { name: string; description: string },
  ): Promise<Categoria> {
    const exists = await this.pool
      .request()
      .input('Id', sql.Int, id)
      .query<{ Id: number }>('SELECT Id FROM dbo.Categorias WHERE Id = @Id');
    if (exists.recordset.length === 0) throw new DomainError('Categoría no encontrada.', 404);

    const name = input.name.trim();
    if (!name) throw new DomainError('El nombre de la categoría es obligatorio.');

    const dup = await this.pool
      .request()
      .input('Id', sql.Int, id)
      .input('Name', sql.NVarChar(80), name.toLowerCase())
      .query<{ Id: number }>(
        'SELECT Id FROM dbo.Categorias WHERE Id <> @Id AND LOWER(Nombre) = @Name',
      );
    if (dup.recordset.length > 0) {
      throw new DomainError('Ya existe otra categoría con ese nombre.');
    }

    const description = (input.description ?? '').trim();
    await this.pool
      .request()
      .input('Id', sql.Int, id)
      .input('Nombre', sql.NVarChar(80), name)
      .input('Descripcion', sql.NVarChar(250), description)
      .query('UPDATE dbo.Categorias SET Nombre = @Nombre, Descripcion = @Descripcion WHERE Id = @Id');

    return { id, name, description };
  }

  async deleteCategory(id: number): Promise<void> {
    const exists = await this.pool
      .request()
      .input('Id', sql.Int, id)
      .query<{ Id: number }>('SELECT Id FROM dbo.Categorias WHERE Id = @Id');
    if (exists.recordset.length === 0) throw new DomainError('Categoría no encontrada.', 404);

    const inUse = await this.pool
      .request()
      .input('Id', sql.Int, id)
      .query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM dbo.Productos WHERE CategoriaId = @Id');
    if ((inUse.recordset[0]?.cnt ?? 0) > 0) {
      throw new DomainError(
        'No se puede eliminar la categoría porque tiene productos asociados.',
      );
    }

    await this.pool.request().input('Id', sql.Int, id).query('DELETE FROM dbo.Categorias WHERE Id = @Id');
  }

  async listProducts(): Promise<Producto[]> {
    const res = await this.pool.request().query<{
      Id: number;
      SKU: string;
      Nombre: string;
      Descripcion: string | null;
      CategoriaId: number;
      CategoriaNombre: string | null;
      PrecioVenta: number;
      CostoCompra: number;
      Existencia: number;
      StockMinimo: number;
      Activo: boolean;
      FechaActualizacion: Date;
    }>(`
      SELECT p.Id, p.SKU, p.Nombre, p.Descripcion, p.CategoriaId, c.Nombre AS CategoriaNombre,
             p.PrecioVenta, p.CostoCompra, p.Existencia, p.StockMinimo, p.Activo, p.FechaActualizacion
      FROM dbo.Productos p
      LEFT JOIN dbo.Categorias c ON c.Id = p.CategoriaId
      ORDER BY p.Nombre ASC
    `);

    return res.recordset.map((r) => ({
      id: r.Id,
      sku: r.SKU,
      name: r.Nombre,
      description: r.Descripcion ?? '',
      categoryId: r.CategoriaId,
      categoryName: r.CategoriaNombre ?? 'Sin categoría',
      salePrice: Number(r.PrecioVenta),
      costPrice: Number(r.CostoCompra),
      stock: Number(r.Existencia),
      minStock: Number(r.StockMinimo),
      active: Boolean(r.Activo),
      updatedAt: toIso(r.FechaActualizacion),
    }));
  }

  async createProduct(input: {
    sku: string;
    name: string;
    description: string;
    categoryId: number;
    salePrice: number;
    costPrice: number;
    stock: number;
    minStock: number;
    active?: boolean;
  }): Promise<Producto> {
    const sku = input.sku.trim().toUpperCase();
    const name = input.name.trim();
    if (!sku || !name) {
      throw new DomainError('El código SKU y el nombre del producto son obligatorios.');
    }

    const dupSku = await this.pool
      .request()
      .input('SKU', sql.NVarChar(40), sku)
      .query<{ Id: number }>('SELECT Id FROM dbo.Productos WHERE UPPER(SKU) = @SKU');
    if (dupSku.recordset.length > 0) {
      throw new DomainError('Ya existe un producto con ese código SKU.');
    }

    const catRes = await this.pool
      .request()
      .input('CategoryId', sql.Int, Number(input.categoryId))
      .query<{ Id: number; Nombre: string }>(
        'SELECT Id, Nombre FROM dbo.Categorias WHERE Id = @CategoryId',
      );
    const category = catRes.recordset[0];
    if (!category) {
      throw new DomainError('Seleccione una categoría válida.');
    }

    const salePrice = roundCurrency(Number(input.salePrice));
    const costPrice = roundCurrency(Number(input.costPrice));
    const stock = Math.trunc(Number(input.stock));
    const minStock = Math.trunc(Number(input.minStock));
    if (salePrice < 0 || costPrice < 0 || stock < 0 || minStock < 0) {
      throw new DomainError('Precios y existencias deben ser valores iguales o mayores a cero.');
    }

    const description = (input.description ?? '').trim();
    const active = input.active ?? true;

    const inserted = await this.pool
      .request()
      .input('SKU', sql.NVarChar(40), sku)
      .input('Nombre', sql.NVarChar(150), name)
      .input('Descripcion', sql.NVarChar(400), description)
      .input('CategoriaId', sql.Int, category.Id)
      .input('PrecioVenta', sql.Decimal(12, 2), salePrice)
      .input('CostoCompra', sql.Decimal(12, 2), costPrice)
      .input('Existencia', sql.Int, stock)
      .input('StockMinimo', sql.Int, minStock)
      .input('Activo', sql.Bit, active ? 1 : 0)
      .query<{ Id: number; FechaActualizacion: Date }>(`
        INSERT INTO dbo.Productos (SKU, Nombre, Descripcion, CategoriaId, PrecioVenta, CostoCompra, Existencia, StockMinimo, Activo)
        OUTPUT INSERTED.Id, INSERTED.FechaActualizacion
        VALUES (@SKU, @Nombre, @Descripcion, @CategoriaId, @PrecioVenta, @CostoCompra, @Existencia, @StockMinimo, @Activo)
      `);

    return {
      id: inserted.recordset[0].Id,
      sku,
      name,
      description,
      categoryId: category.Id,
      categoryName: category.Nombre,
      salePrice,
      costPrice,
      stock,
      minStock,
      active,
      updatedAt: toIso(inserted.recordset[0].FechaActualizacion),
    };
  }

  async updateProduct(
    id: number,
    input: {
      sku: string;
      name: string;
      description: string;
      categoryId: number;
      salePrice: number;
      costPrice: number;
      stock: number;
      minStock: number;
      active: boolean;
    },
  ): Promise<Producto> {
    const existing = await this.pool
      .request()
      .input('Id', sql.Int, id)
      .query<{ Id: number }>('SELECT Id FROM dbo.Productos WHERE Id = @Id');
    if (existing.recordset.length === 0) throw new DomainError('Producto no encontrado.', 404);

    const sku = input.sku.trim().toUpperCase();
    const name = input.name.trim();
    if (!sku || !name) {
      throw new DomainError('El código SKU y el nombre del producto son obligatorios.');
    }

    const dupSku = await this.pool
      .request()
      .input('Id', sql.Int, id)
      .input('SKU', sql.NVarChar(40), sku)
      .query<{ Id: number }>('SELECT Id FROM dbo.Productos WHERE Id <> @Id AND UPPER(SKU) = @SKU');
    if (dupSku.recordset.length > 0) {
      throw new DomainError('Ya existe otro producto con ese código SKU.');
    }

    const catRes = await this.pool
      .request()
      .input('CategoryId', sql.Int, Number(input.categoryId))
      .query<{ Id: number; Nombre: string }>(
        'SELECT Id, Nombre FROM dbo.Categorias WHERE Id = @CategoryId',
      );
    const category = catRes.recordset[0];
    if (!category) throw new DomainError('Seleccione una categoría válida.');

    const salePrice = roundCurrency(Number(input.salePrice));
    const costPrice = roundCurrency(Number(input.costPrice));
    const stock = Math.trunc(Number(input.stock));
    const minStock = Math.trunc(Number(input.minStock));
    if (salePrice < 0 || costPrice < 0 || stock < 0 || minStock < 0) {
      throw new DomainError('Precios y existencias deben ser valores iguales o mayores a cero.');
    }

    const description = (input.description ?? '').trim();
    const active = Boolean(input.active);

    const updated = await this.pool
      .request()
      .input('Id', sql.Int, id)
      .input('SKU', sql.NVarChar(40), sku)
      .input('Nombre', sql.NVarChar(150), name)
      .input('Descripcion', sql.NVarChar(400), description)
      .input('CategoriaId', sql.Int, category.Id)
      .input('PrecioVenta', sql.Decimal(12, 2), salePrice)
      .input('CostoCompra', sql.Decimal(12, 2), costPrice)
      .input('Existencia', sql.Int, stock)
      .input('StockMinimo', sql.Int, minStock)
      .input('Activo', sql.Bit, active ? 1 : 0)
      .query<{ FechaActualizacion: Date }>(`
        UPDATE dbo.Productos
        SET SKU = @SKU,
            Nombre = @Nombre,
            Descripcion = @Descripcion,
            CategoriaId = @CategoriaId,
            PrecioVenta = @PrecioVenta,
            CostoCompra = @CostoCompra,
            Existencia = @Existencia,
            StockMinimo = @StockMinimo,
            Activo = @Activo,
            FechaActualizacion = SYSUTCDATETIME()
        OUTPUT INSERTED.FechaActualizacion
        WHERE Id = @Id
      `);

    return {
      id,
      sku,
      name,
      description,
      categoryId: category.Id,
      categoryName: category.Nombre,
      salePrice,
      costPrice,
      stock,
      minStock,
      active,
      updatedAt: toIso(updated.recordset[0].FechaActualizacion),
    };
  }

  async listCustomers(): Promise<Cliente[]> {
    const res = await this.pool.request().query<{
      Id: number;
      Nombre: string;
      RTN: string | null;
      Telefono: string;
      Correo: string | null;
      Direccion: string | null;
      FechaCreacion: Date;
    }>(
      'SELECT Id, Nombre, RTN, Telefono, Correo, Direccion, FechaCreacion FROM dbo.Clientes ORDER BY Nombre ASC',
    );

    return res.recordset.map((r) => ({
      id: r.Id,
      name: r.Nombre,
      taxId: r.RTN ?? '',
      phone: r.Telefono,
      email: r.Correo ?? '',
      address: r.Direccion ?? '',
      createdAt: toIso(r.FechaCreacion),
    }));
  }

  async createCustomer(input: {
    name: string;
    taxId: string;
    phone: string;
    email: string;
    address: string;
  }): Promise<Cliente> {
    const name = input.name.trim();
    const phone = input.phone.trim();
    if (!name || !phone) {
      throw new DomainError('El nombre y teléfono del cliente son obligatorios.');
    }
    const taxId = (input.taxId ?? '').trim().toUpperCase();
    const email = (input.email ?? '').trim().toLowerCase();
    const address = (input.address ?? '').trim();

    const res = await this.pool
      .request()
      .input('Nombre', sql.NVarChar(150), name)
      .input('RTN', sql.NVarChar(30), taxId)
      .input('Telefono', sql.NVarChar(30), phone)
      .input('Correo', sql.NVarChar(150), email)
      .input('Direccion', sql.NVarChar(250), address)
      .query<{ Id: number; FechaCreacion: Date }>(`
        INSERT INTO dbo.Clientes (Nombre, RTN, Telefono, Correo, Direccion)
        OUTPUT INSERTED.Id, INSERTED.FechaCreacion
        VALUES (@Nombre, @RTN, @Telefono, @Correo, @Direccion)
      `);

    return {
      id: res.recordset[0].Id,
      name,
      taxId,
      phone,
      email,
      address,
      createdAt: toIso(res.recordset[0].FechaCreacion),
    };
  }

  async updateCustomer(
    id: number,
    input: {
      name: string;
      taxId: string;
      phone: string;
      email: string;
      address: string;
    },
  ): Promise<Cliente> {
    const exists = await this.pool
      .request()
      .input('Id', sql.Int, id)
      .query<{ Id: number; FechaCreacion: Date }>(
        'SELECT Id, FechaCreacion FROM dbo.Clientes WHERE Id = @Id',
      );
    if (exists.recordset.length === 0) throw new DomainError('Cliente no encontrado.', 404);

    const name = input.name.trim();
    const phone = input.phone.trim();
    if (!name || !phone) {
      throw new DomainError('El nombre y teléfono del cliente son obligatorios.');
    }
    const taxId = (input.taxId ?? '').trim().toUpperCase();
    const email = (input.email ?? '').trim().toLowerCase();
    const address = (input.address ?? '').trim();

    await this.pool
      .request()
      .input('Id', sql.Int, id)
      .input('Nombre', sql.NVarChar(150), name)
      .input('RTN', sql.NVarChar(30), taxId)
      .input('Telefono', sql.NVarChar(30), phone)
      .input('Correo', sql.NVarChar(150), email)
      .input('Direccion', sql.NVarChar(250), address)
      .query(`
        UPDATE dbo.Clientes
        SET Nombre = @Nombre, RTN = @RTN, Telefono = @Telefono, Correo = @Correo, Direccion = @Direccion
        WHERE Id = @Id
      `);

    return {
      id,
      name,
      taxId,
      phone,
      email,
      address,
      createdAt: toIso(exists.recordset[0].FechaCreacion),
    };
  }

  async listSuppliers(): Promise<Proveedor[]> {
    const res = await this.pool.request().query<{
      Id: number;
      RazonSocial: string;
      ContactoPrincipal: string;
      RTN: string | null;
      Telefono: string;
      Correo: string | null;
      Direccion: string | null;
      FechaCreacion: Date;
    }>(
      'SELECT Id, RazonSocial, ContactoPrincipal, RTN, Telefono, Correo, Direccion, FechaCreacion FROM dbo.Proveedores ORDER BY RazonSocial ASC',
    );

    return res.recordset.map((r) => ({
      id: r.Id,
      companyName: r.RazonSocial,
      contactName: r.ContactoPrincipal,
      taxId: r.RTN ?? '',
      phone: r.Telefono,
      email: r.Correo ?? '',
      address: r.Direccion ?? '',
      createdAt: toIso(r.FechaCreacion),
    }));
  }

  async createSupplier(input: {
    companyName: string;
    contactName: string;
    taxId: string;
    phone: string;
    email: string;
    address: string;
  }): Promise<Proveedor> {
    const companyName = input.companyName.trim();
    const contactName = input.contactName.trim();
    const phone = input.phone.trim();
    if (!companyName || !contactName || !phone) {
      throw new DomainError(
        'La razón social, contacto principal y teléfono del proveedor son obligatorios.',
      );
    }

    const taxId = (input.taxId ?? '').trim().toUpperCase();
    const email = (input.email ?? '').trim().toLowerCase();
    const address = (input.address ?? '').trim();

    const res = await this.pool
      .request()
      .input('RazonSocial', sql.NVarChar(150), companyName)
      .input('ContactoPrincipal', sql.NVarChar(120), contactName)
      .input('RTN', sql.NVarChar(30), taxId)
      .input('Telefono', sql.NVarChar(30), phone)
      .input('Correo', sql.NVarChar(150), email)
      .input('Direccion', sql.NVarChar(250), address)
      .query<{ Id: number; FechaCreacion: Date }>(`
        INSERT INTO dbo.Proveedores (RazonSocial, ContactoPrincipal, RTN, Telefono, Correo, Direccion)
        OUTPUT INSERTED.Id, INSERTED.FechaCreacion
        VALUES (@RazonSocial, @ContactoPrincipal, @RTN, @Telefono, @Correo, @Direccion)
      `);

    return {
      id: res.recordset[0].Id,
      companyName,
      contactName,
      taxId,
      phone,
      email,
      address,
      createdAt: toIso(res.recordset[0].FechaCreacion),
    };
  }

  async updateSupplier(
    id: number,
    input: {
      companyName: string;
      contactName: string;
      taxId: string;
      phone: string;
      email: string;
      address: string;
    },
  ): Promise<Proveedor> {
    const exists = await this.pool
      .request()
      .input('Id', sql.Int, id)
      .query<{ Id: number; FechaCreacion: Date }>(
        'SELECT Id, FechaCreacion FROM dbo.Proveedores WHERE Id = @Id',
      );
    if (exists.recordset.length === 0) throw new DomainError('Proveedor no encontrado.', 404);

    const companyName = input.companyName.trim();
    const contactName = input.contactName.trim();
    const phone = input.phone.trim();
    if (!companyName || !contactName || !phone) {
      throw new DomainError(
        'La razón social, contacto principal y teléfono del proveedor son obligatorios.',
      );
    }

    const taxId = (input.taxId ?? '').trim().toUpperCase();
    const email = (input.email ?? '').trim().toLowerCase();
    const address = (input.address ?? '').trim();

    await this.pool
      .request()
      .input('Id', sql.Int, id)
      .input('RazonSocial', sql.NVarChar(150), companyName)
      .input('ContactoPrincipal', sql.NVarChar(120), contactName)
      .input('RTN', sql.NVarChar(30), taxId)
      .input('Telefono', sql.NVarChar(30), phone)
      .input('Correo', sql.NVarChar(150), email)
      .input('Direccion', sql.NVarChar(250), address)
      .query(`
        UPDATE dbo.Proveedores
        SET RazonSocial = @RazonSocial, ContactoPrincipal = @ContactoPrincipal,
            RTN = @RTN, Telefono = @Telefono, Correo = @Correo, Direccion = @Direccion
        WHERE Id = @Id
      `);

    return {
      id,
      companyName,
      contactName,
      taxId,
      phone,
      email,
      address,
      createdAt: toIso(exists.recordset[0].FechaCreacion),
    };
  }

  async listSales(): Promise<Venta[]> {
    const salesRes = await this.pool.request().query<{
      Id: number;
      Folio: string;
      NumeroFactura: string;
      ClienteId: number;
      ClienteNombre: string;
      ClienteRTN: string | null;
      ClienteTelefono: string | null;
      ClienteDireccion: string | null;
      UsuarioId: number;
      UsuarioNombre: string;
      MetodoPago: MetodoPago;
      IncluyeISV: boolean;
      Subtotal: number;
      ISV: number;
      Total: number;
      Notas: string | null;
      DatosNegocioSnapshot: string | null;
      FechaVenta: Date;
    }>(`
      SELECT Id, Folio, NumeroFactura, ClienteId, ClienteNombre, ClienteRTN, ClienteTelefono, ClienteDireccion,
             UsuarioId, UsuarioNombre, MetodoPago, IncluyeISV, Subtotal, ISV, Total, Notas, DatosNegocioSnapshot, FechaVenta
      FROM dbo.Ventas
      ORDER BY FechaVenta DESC, Id DESC
    `);

    if (salesRes.recordset.length === 0) return [];

    const itemsRes = await this.pool.request().query<{
      Id: number;
      VentaId: number;
      ProductoId: number;
      ProductoSKU: string;
      ProductoNombre: string;
      Cantidad: number;
      PrecioUnitario: number;
      ImporteLinea: number;
    }>(`
      SELECT Id, VentaId, ProductoId, ProductoSKU, ProductoNombre, Cantidad, PrecioUnitario, ImporteLinea
      FROM dbo.DetalleVentas
      ORDER BY Id ASC
    `);

    const itemsBySale = new Map<number, DetalleVenta[]>();
    for (const row of itemsRes.recordset) {
      const list = itemsBySale.get(row.VentaId) ?? [];
      list.push({
        id: row.Id,
        saleId: row.VentaId,
        productId: row.ProductoId,
        productSku: row.ProductoSKU,
        productName: row.ProductoNombre,
        quantity: Number(row.Cantidad),
        unitPrice: Number(row.PrecioUnitario),
        lineTotal: Number(row.ImporteLinea),
      });
      itemsBySale.set(row.VentaId, list);
    }

    return salesRes.recordset.map((s) => {
      let businessSnapshot: DatosNegocio = { ...DEFAULT_BUSINESS_PROFILE };
      if (s.DatosNegocioSnapshot) {
        try {
          businessSnapshot = JSON.parse(s.DatosNegocioSnapshot) as DatosNegocio;
        } catch {
          // Keep default fallback
        }
      }
      return {
        id: s.Id,
        folio: s.Folio,
        invoiceNumber: s.NumeroFactura,
        customerId: s.ClienteId,
        customerName: s.ClienteNombre,
        customerTaxId: s.ClienteRTN ?? '',
        customerPhone: s.ClienteTelefono ?? '',
        customerAddress: s.ClienteDireccion ?? '',
        userId: s.UsuarioId,
        userName: s.UsuarioNombre,
        paymentMethod: s.MetodoPago,
        includeTax: Boolean(s.IncluyeISV),
        subtotal: Number(s.Subtotal),
        tax: Number(s.ISV),
        total: Number(s.Total),
        notes: s.Notas ?? '',
        businessSnapshot,
        createdAt: toIso(s.FechaVenta),
        items: itemsBySale.get(s.Id) ?? [],
      };
    });
  }

  async createSale(
    user: Usuario,
    input: {
      customerId: number;
      paymentMethod: MetodoPago;
      includeTax: boolean;
      notes?: string;
      items: Array<{ productId: number; quantity: number }>;
    },
  ): Promise<Venta> {
    const customerRes = await this.pool
      .request()
      .input('CustomerId', sql.Int, Number(input.customerId))
      .query<{
        Id: number;
        Nombre: string;
        RTN: string | null;
        Telefono: string;
        Direccion: string | null;
      }>('SELECT Id, Nombre, RTN, Telefono, Direccion FROM dbo.Clientes WHERE Id = @CustomerId');

    const customer = customerRes.recordset[0];
    if (!customer) {
      throw new DomainError('Debe seleccionar o registrar un cliente válido.');
    }

    const normalizedItems = (input.items ?? []).map((item) => ({
      productId: Number(item.productId),
      quantity: Math.trunc(Number(item.quantity)),
    }));

    const businessSnapshot = await this.getBusinessProfile();
    const tx = new this.sqlDriver.Transaction(this.pool);
    await tx.begin();

    try {
      const prodRes = await tx.request().query<{
        Id: number;
        SKU: string;
        Nombre: string;
        PrecioVenta: number;
        Existencia: number;
      }>('SELECT Id, SKU, Nombre, PrecioVenta, Existencia FROM dbo.Productos WITH (UPDLOCK, ROWLOCK)');

      const productsById = new Map(
        prodRes.recordset.map((p) => [
          p.Id,
          {
            id: p.Id,
            sku: p.SKU,
            name: p.Nombre,
            salePrice: Number(p.PrecioVenta),
            stock: Number(p.Existencia),
          },
        ]),
      );

      const validationError = validateSaleCart(normalizedItems, productsById);
      if (validationError) {
        throw new DomainError(validationError);
      }

      const lineDrafts = normalizedItems.map((item) => {
        const prod = productsById.get(item.productId)!;
        const lineTotal = calculateLineTotal(item.quantity, prod.salePrice);
        return {
          productId: prod.id,
          productSku: prod.sku,
          productName: prod.name,
          quantity: item.quantity,
          unitPrice: prod.salePrice,
          lineTotal,
        };
      });

      const includeTax = Boolean(input.includeTax);
      const totals = calculateOrderTotals(
        lineDrafts.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice })),
        includeTax,
      );

      const paymentMethod: MetodoPago =
        input.paymentMethod === 'Tarjeta' || input.paymentMethod === 'Transferencia'
          ? input.paymentMethod
          : 'Efectivo';
      const notes = (input.notes ?? '').trim();
      const tempToken = `TMP-${crypto.randomUUID().slice(0, 18)}`;

      const saleInsert = await tx
        .request()
        .input('TempFolio', sql.NVarChar(30), `${tempToken}-V`)
        .input('TempFactura', sql.NVarChar(30), `${tempToken}-F`)
        .input('ClienteId', sql.Int, customer.Id)
        .input('ClienteNombre', sql.NVarChar(150), customer.Nombre)
        .input('ClienteRTN', sql.NVarChar(30), customer.RTN ?? '')
        .input('ClienteTelefono', sql.NVarChar(30), customer.Telefono ?? '')
        .input('ClienteDireccion', sql.NVarChar(250), customer.Direccion ?? '')
        .input('UsuarioId', sql.Int, user.id)
        .input('UsuarioNombre', sql.NVarChar(120), user.fullName)
        .input('MetodoPago', sql.NVarChar(20), paymentMethod)
        .input('IncluyeISV', sql.Bit, includeTax ? 1 : 0)
        .input('Subtotal', sql.Decimal(12, 2), totals.subtotal)
        .input('ISV', sql.Decimal(12, 2), totals.tax)
        .input('Total', sql.Decimal(12, 2), totals.total)
        .input('Notas', sql.NVarChar(300), notes)
        .input('Snapshot', sql.NVarChar(sql.MAX), JSON.stringify(businessSnapshot))
        .query<{ Id: number; FechaVenta: Date }>(`
          INSERT INTO dbo.Ventas (
            Folio, NumeroFactura, ClienteId, ClienteNombre, ClienteRTN, ClienteTelefono, ClienteDireccion,
            UsuarioId, UsuarioNombre, MetodoPago, IncluyeISV, Subtotal, ISV, Total, Notas, DatosNegocioSnapshot
          )
          OUTPUT INSERTED.Id, INSERTED.FechaVenta
          VALUES (
            @TempFolio, @TempFactura, @ClienteId, @ClienteNombre, @ClienteRTN, @ClienteTelefono, @ClienteDireccion,
            @UsuarioId, @UsuarioNombre, @MetodoPago, @IncluyeISV, @Subtotal, @ISV, @Total, @Notas, @Snapshot
          )
        `);

      const saleId = saleInsert.recordset[0].Id;
      const createdAt = toIso(saleInsert.recordset[0].FechaVenta);
      const padded = String(saleId).padStart(4, '0');
      const folio = `VTA-${padded}`;
      const invoiceNumber = `FAC-${padded}`;

      await tx
        .request()
        .input('Id', sql.Int, saleId)
        .input('Folio', sql.NVarChar(30), folio)
        .input('NumeroFactura', sql.NVarChar(30), invoiceNumber)
        .query('UPDATE dbo.Ventas SET Folio = @Folio, NumeroFactura = @NumeroFactura WHERE Id = @Id');

      const insertedItems: DetalleVenta[] = [];
      for (const draft of lineDrafts) {
        const itemRes = await tx
          .request()
          .input('VentaId', sql.Int, saleId)
          .input('ProductoId', sql.Int, draft.productId)
          .input('ProductoSKU', sql.NVarChar(40), draft.productSku)
          .input('ProductoNombre', sql.NVarChar(150), draft.productName)
          .input('Cantidad', sql.Int, draft.quantity)
          .input('PrecioUnitario', sql.Decimal(12, 2), draft.unitPrice)
          .input('ImporteLinea', sql.Decimal(12, 2), draft.lineTotal)
          .query<{ Id: number }>(`
            INSERT INTO dbo.DetalleVentas (VentaId, ProductoId, ProductoSKU, ProductoNombre, Cantidad, PrecioUnitario, ImporteLinea)
            OUTPUT INSERTED.Id
            VALUES (@VentaId, @ProductoId, @ProductoSKU, @ProductoNombre, @Cantidad, @PrecioUnitario, @ImporteLinea)
          `);

        insertedItems.push({
          id: itemRes.recordset[0].Id,
          saleId,
          ...draft,
        });

        await tx
          .request()
          .input('ProductoId', sql.Int, draft.productId)
          .input('Qty', sql.Int, draft.quantity)
          .query(`
            UPDATE dbo.Productos
            SET Existencia = Existencia - @Qty,
                FechaActualizacion = SYSUTCDATETIME()
            WHERE Id = @ProductoId
          `);
      }

      await tx.commit();

      return {
        id: saleId,
        folio,
        invoiceNumber,
        customerId: customer.Id,
        customerName: customer.Nombre,
        customerTaxId: customer.RTN ?? '',
        customerPhone: customer.Telefono ?? '',
        customerAddress: customer.Direccion ?? '',
        userId: user.id,
        userName: user.fullName,
        paymentMethod,
        includeTax,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        notes,
        businessSnapshot,
        createdAt,
        items: insertedItems,
      };
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async listPurchases(): Promise<Compra[]> {
    const purchasesRes = await this.pool.request().query<{
      Id: number;
      Folio: string;
      ProveedorId: number;
      ProveedorNombre: string;
      UsuarioId: number;
      UsuarioNombre: string;
      Estado: EstadoCompra;
      IncluyeISV: boolean;
      Subtotal: number;
      ISV: number;
      Total: number;
      Notas: string | null;
      FechaCompra: Date;
      FechaConfirmacion: Date | null;
    }>(`
      SELECT c.Id, c.Folio, c.ProveedorId, p.RazonSocial AS ProveedorNombre,
             c.UsuarioId, u.NombreCompleto AS UsuarioNombre,
             c.Estado, c.IncluyeISV, c.Subtotal, c.ISV, c.Total, c.Notas, c.FechaCompra, c.FechaConfirmacion
      FROM dbo.Compras c
      INNER JOIN dbo.Proveedores p ON p.Id = c.ProveedorId
      INNER JOIN dbo.Usuarios u ON u.Id = c.UsuarioId
      ORDER BY c.FechaCompra DESC, c.Id DESC
    `);

    if (purchasesRes.recordset.length === 0) return [];

    const itemsRes = await this.pool.request().query<{
      Id: number;
      CompraId: number;
      ProductoId: number;
      ProductoSKU: string;
      ProductoNombre: string;
      Cantidad: number;
      CostoUnitario: number;
      ImporteLinea: number;
    }>(`
      SELECT Id, CompraId, ProductoId, ProductoSKU, ProductoNombre, Cantidad, CostoUnitario, ImporteLinea
      FROM dbo.DetalleCompras
      ORDER BY Id ASC
    `);

    const itemsByPurchase = new Map<number, DetalleCompra[]>();
    for (const row of itemsRes.recordset) {
      const list = itemsByPurchase.get(row.CompraId) ?? [];
      list.push({
        id: row.Id,
        purchaseId: row.CompraId,
        productId: row.ProductoId,
        productSku: row.ProductoSKU,
        productName: row.ProductoNombre,
        quantity: Number(row.Cantidad),
        unitCost: Number(row.CostoUnitario),
        lineTotal: Number(row.ImporteLinea),
      });
      itemsByPurchase.set(row.CompraId, list);
    }

    return purchasesRes.recordset.map((p) => ({
      id: p.Id,
      folio: p.Folio,
      supplierId: p.ProveedorId,
      supplierName: p.ProveedorNombre,
      userId: p.UsuarioId,
      userName: p.UsuarioNombre,
      status: p.Estado,
      includeTax: Boolean(p.IncluyeISV),
      subtotal: Number(p.Subtotal),
      tax: Number(p.ISV),
      total: Number(p.Total),
      notes: p.Notas ?? '',
      createdAt: toIso(p.FechaCompra),
      confirmedAt: toNullableIso(p.FechaConfirmacion),
      items: itemsByPurchase.get(p.Id) ?? [],
    }));
  }

  async createPurchase(
    user: Usuario,
    input: {
      supplierId: number;
      status: EstadoCompra;
      includeTax: boolean;
      notes?: string;
      items: Array<{ productId: number; quantity: number; unitCost: number }>;
    },
  ): Promise<Compra> {
    const supRes = await this.pool
      .request()
      .input('SupplierId', sql.Int, Number(input.supplierId))
      .query<{ Id: number; RazonSocial: string }>(
        'SELECT Id, RazonSocial FROM dbo.Proveedores WHERE Id = @SupplierId',
      );
    const supplier = supRes.recordset[0];
    if (!supplier) throw new DomainError('Debe seleccionar un proveedor válido.');

    const normalizedItems = (input.items ?? []).map((item) => ({
      productId: Number(item.productId),
      quantity: Math.trunc(Number(item.quantity)),
      unitCost: roundCurrency(Number(item.unitCost)),
    }));

    const validationError = validatePurchaseCart(normalizedItems);
    if (validationError) throw new DomainError(validationError);

    const status: EstadoCompra = input.status === 'Confirmada' ? 'Confirmada' : 'Pendiente';
    const includeTax = Boolean(input.includeTax);
    const notes = (input.notes ?? '').trim();

    const tx = new this.sqlDriver.Transaction(this.pool);
    await tx.begin();

    try {
      const prodRes = await tx.request().query<{ Id: number; SKU: string; Nombre: string }>(
        'SELECT Id, SKU, Nombre FROM dbo.Productos WITH (UPDLOCK, ROWLOCK)',
      );
      const productsById = new Map(
        prodRes.recordset.map((p) => [p.Id, { id: p.Id, sku: p.SKU, name: p.Nombre }]),
      );

      for (const item of normalizedItems) {
        if (!productsById.has(item.productId)) {
          throw new DomainError('Uno de los productos seleccionados no existe en el inventario.');
        }
      }

      const lineDrafts = normalizedItems.map((item) => {
        const prod = productsById.get(item.productId)!;
        return {
          productId: prod.id,
          productSku: prod.sku,
          productName: prod.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          lineTotal: calculateLineTotal(item.quantity, item.unitCost),
        };
      });

      const totals = calculateOrderTotals(
        lineDrafts.map((i) => ({ quantity: i.quantity, unitPrice: i.unitCost })),
        includeTax,
      );

      const tempFolio = `TMP-${crypto.randomUUID().slice(0, 18)}`;
      const purchaseInsert = await tx
        .request()
        .input('Folio', sql.NVarChar(30), tempFolio)
        .input('ProveedorId', sql.Int, supplier.Id)
        .input('UsuarioId', sql.Int, user.id)
        .input('Estado', sql.NVarChar(20), status)
        .input('IncluyeISV', sql.Bit, includeTax ? 1 : 0)
        .input('Subtotal', sql.Decimal(12, 2), totals.subtotal)
        .input('ISV', sql.Decimal(12, 2), totals.tax)
        .input('Total', sql.Decimal(12, 2), totals.total)
        .input('Notas', sql.NVarChar(300), notes)
        .query<{ Id: number; FechaCompra: Date; FechaConfirmacion: Date | null }>(`
          INSERT INTO dbo.Compras (
            Folio, ProveedorId, UsuarioId, Estado, IncluyeISV, Subtotal, ISV, Total, Notas, FechaConfirmacion
          )
          OUTPUT INSERTED.Id, INSERTED.FechaCompra, INSERTED.FechaConfirmacion
          VALUES (
            @Folio, @ProveedorId, @UsuarioId, @Estado, @IncluyeISV, @Subtotal, @ISV, @Total, @Notas,
            CASE WHEN @Estado = 'Confirmada' THEN SYSUTCDATETIME() ELSE NULL END
          )
        `);

      const purchaseId = purchaseInsert.recordset[0].Id;
      const folio = `CMP-${String(purchaseId).padStart(4, '0')}`;

      await tx
        .request()
        .input('Id', sql.Int, purchaseId)
        .input('Folio', sql.NVarChar(30), folio)
        .query('UPDATE dbo.Compras SET Folio = @Folio WHERE Id = @Id');

      const insertedItems: DetalleCompra[] = [];
      for (const draft of lineDrafts) {
        const itemRes = await tx
          .request()
          .input('CompraId', sql.Int, purchaseId)
          .input('ProductoId', sql.Int, draft.productId)
          .input('ProductoSKU', sql.NVarChar(40), draft.productSku)
          .input('ProductoNombre', sql.NVarChar(150), draft.productName)
          .input('Cantidad', sql.Int, draft.quantity)
          .input('CostoUnitario', sql.Decimal(12, 2), draft.unitCost)
          .input('ImporteLinea', sql.Decimal(12, 2), draft.lineTotal)
          .query<{ Id: number }>(`
            INSERT INTO dbo.DetalleCompras (CompraId, ProductoId, ProductoSKU, ProductoNombre, Cantidad, CostoUnitario, ImporteLinea)
            OUTPUT INSERTED.Id
            VALUES (@CompraId, @ProductoId, @ProductoSKU, @ProductoNombre, @Cantidad, @CostoUnitario, @ImporteLinea)
          `);

        insertedItems.push({
          id: itemRes.recordset[0].Id,
          purchaseId,
          ...draft,
        });

        if (status === 'Confirmada') {
          await tx
            .request()
            .input('ProductoId', sql.Int, draft.productId)
            .input('Qty', sql.Int, draft.quantity)
            .input('UnitCost', sql.Decimal(12, 2), draft.unitCost)
            .query(`
              UPDATE dbo.Productos
              SET Existencia = Existencia + @Qty,
                  CostoCompra = @UnitCost,
                  FechaActualizacion = SYSUTCDATETIME()
              WHERE Id = @ProductoId
            `);
        }
      }

      await tx.commit();

      return {
        id: purchaseId,
        folio,
        supplierId: supplier.Id,
        supplierName: supplier.RazonSocial,
        userId: user.id,
        userName: user.fullName,
        status,
        includeTax,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        notes,
        createdAt: toIso(purchaseInsert.recordset[0].FechaCompra),
        confirmedAt: toNullableIso(purchaseInsert.recordset[0].FechaConfirmacion),
        items: insertedItems,
      };
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  async confirmPurchase(id: number): Promise<Compra> {
    const tx = new this.sqlDriver.Transaction(this.pool);
    await tx.begin();

    try {
      const purchRes = await tx
        .request()
        .input('Id', sql.Int, id)
        .query<{ Id: number; Estado: EstadoCompra }>(
          'SELECT Id, Estado FROM dbo.Compras WITH (UPDLOCK, ROWLOCK) WHERE Id = @Id',
        );

      const purchase = purchRes.recordset[0];
      if (!purchase) throw new DomainError('Compra no encontrada.', 404);
      if (purchase.Estado === 'Confirmada') {
        throw new DomainError('Esta compra ya fue confirmada previamente.');
      }

      const itemsRes = await tx
        .request()
        .input('CompraId', sql.Int, id)
        .query<{ ProductoId: number; Cantidad: number; CostoUnitario: number }>(
          'SELECT ProductoId, Cantidad, CostoUnitario FROM dbo.DetalleCompras WHERE CompraId = @CompraId',
        );

      for (const item of itemsRes.recordset) {
        await tx
          .request()
          .input('ProductoId', sql.Int, item.ProductoId)
          .input('Qty', sql.Int, item.Cantidad)
          .input('UnitCost', sql.Decimal(12, 2), item.CostoUnitario)
          .query(`
            UPDATE dbo.Productos
            SET Existencia = Existencia + @Qty,
                CostoCompra = @UnitCost,
                FechaActualizacion = SYSUTCDATETIME()
            WHERE Id = @ProductoId
          `);
      }

      await tx
        .request()
        .input('Id', sql.Int, id)
        .query(`
          UPDATE dbo.Compras
          SET Estado = 'Confirmada',
              FechaConfirmacion = SYSUTCDATETIME()
          WHERE Id = @Id
        `);

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    const all = await this.listPurchases();
    const updated = all.find((p) => p.id === id);
    if (!updated) throw new DomainError('Compra no encontrada.', 404);
    return updated;
  }

  async getDashboardSummary(role: RolUsuario): Promise<ResumenDashboard> {
    const [products, sales, customers, suppliers, purchases] = await Promise.all([
      this.listProducts(),
      this.listSales(),
      this.listCustomers(),
      role === 'Administrador' ? this.listSuppliers() : Promise.resolve([]),
      role === 'Administrador' ? this.listPurchases() : Promise.resolve([]),
    ]);

    const lowStockProducts = products.filter(
      (p) => getStockStatus(p.stock, p.minStock) !== 'Óptimo',
    );
    const outOfStockCount = products.filter((p) => p.stock <= 0).length;
    const lowStockCount = products.filter(
      (p) => p.stock > 0 && p.stock <= p.minStock,
    ).length;

    const totalSalesAmount = roundCurrency(sales.reduce((sum, s) => sum + s.total, 0));
    const totalPurchasesAmount = roundCurrency(
      purchases
        .filter((p) => p.status === 'Confirmada')
        .reduce((sum, p) => sum + p.total, 0),
    );
    const pendingPurchasesCount = purchases.filter((p) => p.status === 'Pendiente').length;

    return {
      totalSalesAmount,
      totalSalesCount: sales.length,
      totalPurchasesAmount,
      pendingPurchasesCount,
      totalProductsCount: products.length,
      lowStockCount,
      outOfStockCount,
      totalCustomersCount: customers.length,
      totalSuppliersCount: role === 'Administrador' ? suppliers.length : 0,
      lowStockProducts,
      recentSales: sales.slice(0, 5),
      recentPurchases: purchases.slice(0, 5),
    };
  }
}
