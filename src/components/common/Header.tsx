import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function Header() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => setMenuOpen(prev => !prev);

  return (
    <header className="sticky top-0 z-50 bg-gradient-to-r from-gray-900/95 to-gray-850/95 backdrop-blur-md shadow-lg">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <Link to="/" className="flex items-center space-x-2">
          {/* Creative Logo Icon */}
          <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h18v18H3V3z" />
          </svg>
          <span className="text-2xl md:text-3xl font-extrabold text-white">MailVanta</span>
        </Link>
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-6">
          {user ? (
            <>
              <Link to="/dashboard" className="text-gray-300 hover:text-white transition-colors duration-200">
                Dashboard
              </Link>
              <Link to="/settings" className="text-gray-300 hover:text-white transition-colors duration-200">
                Settings
              </Link>
              <button
                onClick={signOut}
                className="text-gray-300 hover:text-white transition-colors duration-200"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="text-gray-300 hover:text-white transition-colors duration-200"
            >
              Sign In
            </Link>
          )}
        </nav>
        {/* Mobile Navigation Toggle */}
        <button
          onClick={toggleMenu}
          className="md:hidden text-gray-300 hover:text-white transition-colors duration-200 focus:outline-none"
        >
          {menuOpen ? (
            // Close Icon
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            // Hamburger Icon
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>
      {/* Mobile Navigation Menu */}
      {menuOpen && (
        <nav className="md:hidden px-4 pb-4 bg-gradient-to-r from-gray-900/95 to-gray-850/95 backdrop-blur-sm transition-all duration-300">
          <ul className="flex flex-col space-y-4">
            {user ? (
              <>
                <li>
                  <Link
                    to="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="block text-gray-300 hover:text-white transition-colors duration-200"
                  >
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link
                    to="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="block text-gray-300 hover:text-white transition-colors duration-200"
                  >
                    Settings
                  </Link>
                </li>
                <li>
                  <button
                    onClick={() => {
                      signOut();
                      setMenuOpen(false);
                    }}
                    className="block text-gray-300 hover:text-white transition-colors duration-200"
                  >
                    Sign Out
                  </button>
                </li>
              </>
            ) : (
              <li>
                <Link
                  to="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="block text-gray-300 hover:text-white transition-colors duration-200"
                >
                  Sign In
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}