import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/shadcn/Button';
import { Card } from '../components/shadcn/Card';

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-6 text-gradient">
          AI-Powered Outreach Solution
        </h1>
        <p className="text-xl mb-8 text-gray-300">
          Supercharge your marketing campaigns with AI-generated content and real-time analytics
        </p>
        <div className="space-x-4">
          {user ? (
            <Link to="/dashboard">
              <Button size="lg">Go to Dashboard</Button>
            </Link>
          ) : (
            <Link to="/auth">
              <Button size="lg">Get Started</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card variant="hover">
          <h3 className="text-xl font-semibold mb-4">AI-Powered Copy</h3>
          <p className="text-gray-300">
            Generate engaging content that resonates with your audience using advanced AI technology.
          </p>
        </Card>
        <Card variant="hover">
          <h3 className="text-xl font-semibold mb-4">Real-time Analytics</h3>
          <p className="text-gray-300">
            Track campaign performance and optimize your outreach strategy with detailed analytics.
          </p>
        </Card>
        <Card variant="hover">
          <h3 className="text-xl font-semibold mb-4">Automated Campaigns</h3>
          <p className="text-gray-300">
            Set up and manage automated marketing campaigns that save time and drive results.
          </p>
        </Card>
      </div>
    </div>
  );
} 