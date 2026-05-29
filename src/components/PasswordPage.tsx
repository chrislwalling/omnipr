import { useState } from 'react';

interface PasswordPageProps {
  onAuthenticate: () => void;
}

export default function PasswordPage({ onAuthenticate }: PasswordPageProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPassword = import.meta.env.VITE_DASHBOARD_PASSWORD;

    if (password === correctPassword) {
      setError('');
      onAuthenticate();
    } else {
      setError('Incorrect password');
      setPassword('');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="w-full max-w-md">
        <div className="rounded-lg shadow-lg p-8" style={{ backgroundColor: '#F5F5F5' }}>
          <h1 className="text-3xl font-bold mb-2" style={{ color: '#1B2F52' }}>
            Omni PR Dashboard
          </h1>
          <p className="text-gray-600 mb-6">Enter password to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                style={{ focusRingColor: '#C9A84C' }}
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm">{error}</p>
            )}

            <button
              type="submit"
              className="w-full py-2 px-4 rounded-lg font-semibold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: '#C9A84C' }}
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
