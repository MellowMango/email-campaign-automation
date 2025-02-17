import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { NotificationsPopover } from './NotificationsPopover';
import { Button } from '../shadcn/Button';
import type { Campaign } from '../../types';
import { supabase } from '../../lib/supabase/client';

export function Header() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(false);
  const [recentCampaigns, setRecentCampaigns] = useState<Campaign[]>([]);
  const navigate = useNavigate();

  const toggleMenu = () => setMenuOpen(prev => !prev);

  useEffect(() => {
    const fetchRecentCampaigns = async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(5);
      if (data) {
        setRecentCampaigns(data);
      }
    };
    fetchRecentCampaigns();
  }, []);

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
              <div className="relative">
                <Button
                  variant="ghost"
                  className="text-gray-300 hover:text-white"
                  onClick={() => setShowCampaigns(!showCampaigns)}
                >
                  Campaigns
                  <svg
                    className="w-4 h-4 ml-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </Button>
                {showCampaigns && (
                  <div className="absolute z-50 mt-2 w-64 rounded-md shadow-lg bg-gray-800 ring-1 ring-black ring-opacity-5">
                    <div className="py-1" role="menu">
                      {recentCampaigns.map((campaign) => (
                        <button
                          key={campaign.id}
                          className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                          onClick={() => {
                            navigate(`/campaign/${campaign.id}`);
                            setShowCampaigns(false);
                          }}
                        >
                          <div className="font-medium">{campaign.name}</div>
                          <div className="text-xs text-gray-400">
                            {new Date(campaign.updated_at).toLocaleDateString()}
                          </div>
                        </button>
                      ))}
                      <div className="border-t border-gray-700 mt-1 pt-1">
                        <button
                          className="w-full text-left px-4 py-2 text-sm text-indigo-400 hover:bg-gray-700"
                          onClick={() => {
                            navigate('/dashboard');
                            setShowCampaigns(false);
                          }}
                        >
                          View All Campaigns
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <NotificationsPopover />
              <button
                onClick={signOut}
                className="text-gray-300 hover:text-white transition-colors duration-200"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/pricing"
                className="text-gray-300 hover:text-white transition-colors duration-200"
              >
                Pricing
              </Link>
              <Link
                to="/auth"
                className="text-gray-300 hover:text-white transition-colors duration-200"
              >
                Sign In
              </Link>
            </>
          )}
        </nav>
        {/* Mobile Navigation Toggle */}
        <div className="md:hidden flex items-center space-x-4">
          {user && <NotificationsPopover />}
          <button
            onClick={toggleMenu}
            className="text-gray-300 hover:text-white transition-colors duration-200 focus:outline-none"
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