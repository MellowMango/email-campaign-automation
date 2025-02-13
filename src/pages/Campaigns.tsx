import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCampaigns } from '../hooks/useCampaigns';
import { Button } from '../components/shadcn/Button';
import { Card } from '../components/shadcn/Card';
import { Input } from '../components/shadcn/Input';
import type { Campaign } from '../types';

export default function Campaigns() {
  const { campaigns, loading, error } = useCampaigns();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<Campaign['status'] | 'all'>('all');
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center">
        <div className="text-gray-300">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center">
        <div className="text-red-500">Error: {error.message}</div>
      </div>
    );
  }

  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (campaign.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-gray-700 pb-4">
          <div>
            <Button
              variant="secondary"
              onClick={() => navigate('/dashboard')}
              className="mb-4 md:mb-0"
            >
              ← Back to Dashboard
            </Button>
            <h1 className="text-3xl md:text-4xl font-bold">Campaigns</h1>
            <p className="text-gray-400">Manage all your email campaigns</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search campaigns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Campaign['status'] | 'all')}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Campaigns Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCampaigns.map((campaign) => (
            <Link key={campaign.id} to={`/campaign/${campaign.id}`}>
              <Card variant="hover" className="h-full p-6 hover:shadow-lg transition-shadow">
                <div className="flex flex-col h-full">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-2">{campaign.name}</h3>
                    <p className="text-gray-400 mb-4 line-clamp-2">
                      {campaign.description || 'No description'}
                    </p>
                    
                    {/* Campaign Details */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center text-sm text-gray-400">
                        <span className="mr-2">Type:</span>
                        <span className="capitalize">{campaign.sequence_type}</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-400">
                        <span className="mr-2">Duration:</span>
                        <span>{campaign.duration} days</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-400">
                        <span className="mr-2">Emails/Week:</span>
                        <span>{campaign.emails_per_week}</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-between items-center pt-4 border-t border-gray-700">
                    <span
                      className={`px-2 py-1 rounded text-sm ${
                        campaign.status === 'active'
                          ? 'bg-green-900 text-green-300'
                          : campaign.status === 'draft'
                          ? 'bg-gray-700 text-gray-300'
                          : campaign.status === 'paused'
                          ? 'bg-yellow-900 text-yellow-300'
                          : 'bg-blue-900 text-blue-300'
                      }`}
                    >
                      {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                    </span>
                    <div className="text-sm text-gray-400">
                      Updated {new Date(campaign.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {filteredCampaigns.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">
              {searchTerm || statusFilter !== 'all'
                ? 'No campaigns match your filters'
                : 'No campaigns created yet'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
} 