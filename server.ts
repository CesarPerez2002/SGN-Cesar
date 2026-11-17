import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { DomainError } from './src/server/security.ts';
import {
  buildSqlServerConfigFromEnv,
  SqlServerRepository,
} from './src/server/sqlserver-repository.ts';
import type { RolUsuario, Usuario } from './src/shared/types.ts';

const PORT = 3000;
const TOKEN_SECRET = process.env.SGN_SESSION_SECRET || 'sgn-dev-secret-key-2026';

interface AuthenticatedRequest extends Request {
  currentUser?: Usuario;
}

function signSessionToken(userId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, iat: Date.now() }),
    'utf-8',
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      uid?: number;
    };
    return typeof decoded.uid === 'number' ? decoded.uid : null;
  } catch {
    return null;
  }
}

async function initSqlServer(): Promise<{
  repo: SqlServerRepository | null;
  configError: string | null;
}> {
  try {
    const sqlConfig = buildSqlServerConfigFromEnv();
    if (!sqlConfig) {
      const msg =
        'Base de datos Microsoft SQL Server no configurada. Configure MSSQL_SERVER, MSSQL_DATABASE, MSSQL_USER y MSSQL_PASSWORD en el archivo .env.';
      console.warn(msg);
      return { repo: null, configError: msg };
    }

    const repo = await SqlServerRepository.connect(sqlConfig);
    const target = sqlConfig.connectionString
      ? `${sqlConfig.database} (cadena personalizada)`
      : sqlConfig.options.instanceName
        ? `${sqlConfig.server}\\${sqlConfig.options.instanceName}/${sqlConfig.database}`
        : `${sqlConfig.server}:${sqlConfig.port}/${sqlConfig.database}`;
    console.log(`SGN conectado a Microsoft SQL Server (${target})`);
    return { repo, configError: null };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const msg = `No se pudo conectar a Microsoft SQL Server: ${detail}`;
    console.error(msg);
    return { repo: null, configError: msg };
  }
}

async function startServer() {
  const app = express();
  let { repo, configError } = await initSqlServer();

  const requireDatabase = (): SqlServerRepository => {
    if (!repo) {
      throw new DomainError(
        configError ??
          'Base de datos Microsoft SQL Server no configurada en el archivo .env.',
        503,
      );
    }
    return repo;
  };

  app.use(express.json());

  const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = requireDatabase();
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token) {
        res.status(401).json({ error: 'Sesión no iniciada o expirada.' });
        return;
      }

      const userId = verifySessionToken(token);
      if (!userId) {
        res.status(401).json({ error: 'Token de sesión inválido.' });
        return;
      }

      const user = await db.getUserById(userId);
      if (!user || !user.active) {
        res.status(401).json({ error: 'Usuario no válido o inactivo.' });
        return;
      }

      req.currentUser = user;
      next();
    } catch (err) {
      if (err instanceof DomainError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('Error al validar sesión en SGN:', err);
      res.status(500).json({ error: 'Error interno al verificar la sesión.' });
    }
  };

  const requireRole =
    (...roles: RolUsuario[]) =>
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.currentUser || !roles.includes(req.currentUser.role)) {
        res.status(403).json({
          error: 'No cuenta con permisos suficientes para realizar esta operación.',
        });
        return;
      }
      next();
    };

  const handleRoute =
    (fn: (req: AuthenticatedRequest, res: Response) => void | Promise<void>) =>
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        await fn(req, res);
      } catch (err) {
        if (err instanceof DomainError) {
          res.status(err.status).json({ error: err.message });
          return;
        }
        console.error('Error en API SGN:', err);
        res.status(500).json({ error: 'Error interno al procesar la solicitud.' });
      }
    };

  // Public business display name for login screen
  app.get(
    '/api/public/business-info',
    handleRoute(async (_req, res) => {
      if (!repo) {
        res.json({ businessName: 'Mi Negocio', dbConfigured: false });
        return;
      }
      const profile = await repo.getBusinessProfile();
      res.json({ businessName: profile.businessName, dbConfigured: true });
    }),
  );

  // Auth routes
  app.post(
    '/api/auth/login',
    handleRoute(async (req, res) => {
      const db = requireDatabase();
      const { identifier, password } = req.body ?? {};
      const user = await db.authenticate(String(identifier ?? ''), String(password ?? ''));
      const token = signSessionToken(user.id);
      res.json({ token, user });
    }),
  );

  app.get(
    '/api/auth/me',
    requireAuth,
    handleRoute((req, res) => {
      res.json({ user: req.currentUser });
    }),
  );

  app.post('/api/auth/logout', (_req, res) => {
    res.json({ ok: true });
  });

  // Business Profile (for invoices)
  app.get(
    '/api/business-profile',
    requireAuth,
    handleRoute(async (_req, res) => {
      res.json(await requireDatabase().getBusinessProfile());
    }),
  );

  app.put(
    '/api/business-profile',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (req, res) => {
      const updated = await requireDatabase().updateBusinessProfile(req.body ?? {});
      res.json(updated);
    }),
  );

  // Dashboard
  app.get(
    '/api/dashboard',
    requireAuth,
    handleRoute(async (req, res) => {
      res.json(await requireDatabase().getDashboardSummary(req.currentUser!.role));
    }),
  );

  // Categories
  app.get(
    '/api/categories',
    requireAuth,
    handleRoute(async (_req, res) => {
      res.json(await requireDatabase().listCategories());
    }),
  );

  app.post(
    '/api/categories',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (req, res) => {
      const category = await requireDatabase().createCategory(req.body ?? {});
      res.status(201).json(category);
    }),
  );

  app.put(
    '/api/categories/:id',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (req, res) => {
      const category = await requireDatabase().updateCategory(
        Number(req.params.id),
        req.body ?? {},
      );
      res.json(category);
    }),
  );

  app.delete(
    '/api/categories/:id',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (req, res) => {
      await requireDatabase().deleteCategory(Number(req.params.id));
      res.json({ ok: true });
    }),
  );

  // Products / Inventory
  app.get(
    '/api/products',
    requireAuth,
    handleRoute(async (_req, res) => {
      res.json(await requireDatabase().listProducts());
    }),
  );

  app.post(
    '/api/products',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (req, res) => {
      const product = await requireDatabase().createProduct(req.body ?? {});
      res.status(201).json(product);
    }),
  );

  app.put(
    '/api/products/:id',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (req, res) => {
      const product = await requireDatabase().updateProduct(Number(req.params.id), req.body ?? {});
      res.json(product);
    }),
  );

  // Customers
  app.get(
    '/api/customers',
    requireAuth,
    handleRoute(async (_req, res) => {
      res.json(await requireDatabase().listCustomers());
    }),
  );

  app.post(
    '/api/customers',
    requireAuth,
    handleRoute(async (req, res) => {
      const customer = await requireDatabase().createCustomer(req.body ?? {});
      res.status(201).json(customer);
    }),
  );

  app.put(
    '/api/customers/:id',
    requireAuth,
    handleRoute(async (req, res) => {
      const customer = await requireDatabase().updateCustomer(
        Number(req.params.id),
        req.body ?? {},
      );
      res.json(customer);
    }),
  );

  // Suppliers (Admin only)
  app.get(
    '/api/suppliers',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (_req, res) => {
      res.json(await requireDatabase().listSuppliers());
    }),
  );

  app.post(
    '/api/suppliers',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (req, res) => {
      const supplier = await requireDatabase().createSupplier(req.body ?? {});
      res.status(201).json(supplier);
    }),
  );

  app.put(
    '/api/suppliers/:id',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (req, res) => {
      const supplier = await requireDatabase().updateSupplier(
        Number(req.params.id),
        req.body ?? {},
      );
      res.json(supplier);
    }),
  );

  // Sales (Admin & Cajero)
  app.get(
    '/api/sales',
    requireAuth,
    handleRoute(async (_req, res) => {
      res.json(await requireDatabase().listSales());
    }),
  );

  app.post(
    '/api/sales',
    requireAuth,
    handleRoute(async (req, res) => {
      const sale = await requireDatabase().createSale(req.currentUser!, req.body ?? {});
      res.status(201).json(sale);
    }),
  );

  // Purchases (Admin only)
  app.get(
    '/api/purchases',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (_req, res) => {
      res.json(await requireDatabase().listPurchases());
    }),
  );

  app.post(
    '/api/purchases',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (req, res) => {
      const purchase = await requireDatabase().createPurchase(req.currentUser!, req.body ?? {});
      res.status(201).json(purchase);
    }),
  );

  app.post(
    '/api/purchases/:id/confirm',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (req, res) => {
      const purchase = await requireDatabase().confirmPurchase(Number(req.params.id));
      res.json(purchase);
    }),
  );

  // Users & Security (Admin only)
  app.get(
    '/api/users',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (_req, res) => {
      res.json(await requireDatabase().listUsers());
    }),
  );

  app.post(
    '/api/users',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (req, res) => {
      const user = await requireDatabase().createUser(req.body ?? {});
      res.status(201).json(user);
    }),
  );

  app.put(
    '/api/users/:id',
    requireAuth,
    requireRole('Administrador'),
    handleRoute(async (req, res) => {
      const user = await requireDatabase().updateUser(
        Number(req.params.id),
        req.currentUser!.id,
        req.body ?? {},
      );
      res.json(user);
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SGN servidor activo en http://localhost:${PORT}`);
  });
}

startServer();
