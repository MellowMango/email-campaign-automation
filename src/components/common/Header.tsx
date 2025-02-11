import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function Header() {
  const { user, signOut } = useAuth();

  return (
    <header className="bg-background-secondary">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <Link to="/" className="text-2xl font-bold text-white">
            MailVanta
          </Link>

          <nav className="flex items-center space-x-6">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  to="/settings"
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Settings
                </Link>
                <button
                  onClick={() => signOut()}
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="text-gray-300 hover:text-white transition-colors"
              >
                Sign In
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
} 