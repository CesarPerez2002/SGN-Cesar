import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Eye, EyeOff, Lock } from 'lucide-react';
import { sgnApi, setStoredToken } from '../api/client.ts';
import type { Usuario } from '../shared/types.ts';

interface LoginScreenProps {
  onLoginSuccess: (user: Usuario) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [businessName, setBusinessName] = useState('Mi Negocio');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    sgnApi
      .getPublicBusinessInfo()
      .then((info) => {
        if (active && info.businessName?.trim()) {
          setBusinessName(info.businessName.trim());
        }
      })
      .catch(() => {
        // Fallback to default business name if unavailable
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!identifier.trim() || !password) {
      setError('Ingrese su nombre de usuario o correo electrónico y su contraseña.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await sgnApi.login(identifier.trim(), password);
      setStoredToken(result.token);
      onLoginSuccess(result.user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Las credenciales proporcionadas no son válidas.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-teal-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Nombre de la empresa */}
        <header className="text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center shadow-lg">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="text-white"
            >
              <path
                d="M4 7h16M4 12h10M4 17h16"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white text-balance">
              {businessName}
            </h1>
            <p className="mt-1 text-xs text-indigo-200">
              Sistema para Gestión de Negocios
            </p>
          </div>
        </header>

        {/* Tarjeta de inicio de sesión */}
        <main className="bg-white/95 backdrop-blur border border-white/25 rounded-2xl overflow-hidden shadow-2xl">
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-rose-500 to-indigo-600" />
          <div className="p-7 sm:p-8">
            <div className="mb-6">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Iniciar sesión
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Ingrese sus credenciales para acceder al sistema.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
              >
                <AlertTriangle
                  className="w-4 h-4 text-red-600 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="login-identifier"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Nombre de usuario o correo electrónico
                </label>
                <input
                  id="login-identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Usuario o correo electrónico"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ingrese su contraseña"
                    className="w-full rounded-lg border border-slate-300 bg-white pl-3.5 pr-11 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-800 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 via-violet-600 to-teal-600 hover:from-indigo-700 hover:via-violet-700 hover:to-teal-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 transition-all cursor-pointer whitespace-nowrap shadow-sm"
              >
                <Lock className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? 'Validando...' : 'Ingresar al sistema'}</span>
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
