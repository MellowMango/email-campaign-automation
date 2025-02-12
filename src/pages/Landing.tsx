import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/shadcn/Button';
import { Card } from '../components/shadcn/Card';

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-850 text-white">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-24 text-center">
        <div className="mb-6 inline-block rounded-full bg-indigo-600/20 px-4 py-2">
          <span className="text-indigo-400 font-semibold tracking-wide uppercase">New Feature: AI Email Wizard</span>
        </div>
        <h1 className="text-6xl md:text-7xl font-extrabold mb-6 bg-gradient-to-r from-indigo-400 to-indigo-200 bg-clip-text text-transparent leading-tight">
          Revolutionize Your Email Outreach
        </h1>
        <p className="text-2xl md:text-3xl mb-10 text-gray-300 max-w-3xl mx-auto leading-relaxed">
          MailVanta empowers your sales team with AI-driven personalization, smart automation, and real-time analytics to turn cold leads into warm conversations.
        </p>
        <div className="flex flex-col md:flex-row justify-center items-center gap-6">
          {user ? (
            <Link to="/dashboard">
              <Button size="lg" className="px-10 py-5 text-lg">
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/auth">
                <Button size="lg" className="px-10 py-5 text-lg flex items-center group">
                  Start Free Trial
                  <svg
                    className="w-5 h-5 ml-2 transition-transform duration-300 group-hover:translate-x-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="lg" variant="secondary" className="px-10 py-5 text-lg flex items-center">
                  Watch Demo
                  <svg
                    className="w-5 h-5 ml-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Button>
              </Link>
            </>
          )}
        </div>
        <div className="mt-10 flex justify-center gap-8 text-sm text-gray-400">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            14-Day Free Trial
          </div>
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            No Credit Card
          </div>
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            Cancel Anytime
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container mx-auto px-4 py-16 border-t border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-5xl font-bold text-indigo-400 mb-2">93%</div>
            <div className="text-gray-400 text-lg">Higher Response Rate</div>
          </div>
          <div>
            <div className="text-5xl font-bold text-indigo-400 mb-2">5x</div>
            <div className="text-gray-400 text-lg">Faster Campaign Creation</div>
          </div>
          <div>
            <div className="text-5xl font-bold text-indigo-400 mb-2">10hrs</div>
            <div className="text-gray-400 text-lg">Saved Weekly</div>
          </div>
          <div>
            <div className="text-5xl font-bold text-indigo-400 mb-2">2.3x</div>
            <div className="text-gray-400 text-lg">Higher Conversion</div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <div className="text-indigo-400 font-semibold uppercase mb-4 tracking-wider">Features</div>
          <h2 className="text-4xl font-bold mb-4">All the Tools You Need for High-Impact Outreach</h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            From AI-driven personalization to smart automation and real-time insights, MailVanta equips you to win every deal.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {/* Feature 1 */}
          <Card className="p-8 hover:scale-105 transform transition duration-300">
            <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-indigo-600/10 mb-6">
              <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-3">AI-Powered Personalization</h3>
            <p className="text-gray-400 mb-4">
              Create tailored email content that speaks directly to each prospect, maximizing engagement.
            </p>
            <ul className="space-y-2 text-gray-400">
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Context-aware messaging
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Dynamic content adaptation
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Multi-language support
              </li>
            </ul>
          </Card>
          {/* Feature 2 */}
          <Card className="p-8 hover:scale-105 transform transition duration-300">
            <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-indigo-600/10 mb-6">
              <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-3">Real-Time Smart Analytics</h3>
            <p className="text-gray-400 mb-4">
              Monitor campaign performance live with actionable insights to refine your strategy instantly.
            </p>
            <ul className="space-y-2 text-gray-400">
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Real-time tracking
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Actionable insights
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                A/B Testing
              </li>
            </ul>
          </Card>
          {/* Feature 3 */}
          <Card className="p-8 hover:scale-105 transform transition duration-300">
            <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-indigo-600/10 mb-6">
              <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-3">Automated Follow-Up Sequences</h3>
            <p className="text-gray-400 mb-4">
              Let our smart automation handle follow-ups, so you can focus on closing deals.
            </p>
            <ul className="space-y-2 text-gray-400">
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Smart scheduling
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Behavior-based flows
              </li>
              <li className="flex items-center">
                <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Auto-optimization
              </li>
            </ul>
          </Card>
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-24 border-t border-gray-700">
        <div className="text-center mb-16">
          <div className="text-indigo-400 font-semibold uppercase mb-4 tracking-wider">How It Works</div>
          <h2 className="text-4xl font-bold mb-4">Simple, Fast, Effective</h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Get started in minutes. Import your contacts, set up campaigns, and let MailVanta do the heavy lifting.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {[
            {
              step: "1",
              title: "Import Contacts",
              desc: "Upload your list or sync your CRM seamlessly.",
            },
            {
              step: "2",
              title: "Launch Campaign",
              desc: "Craft your campaign with AI-powered templates and smart sequences.",
            },
            {
              step: "3",
              title: "Track & Optimize",
              desc: "Monitor performance and let real-time insights drive improvements.",
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="w-20 h-20 rounded-full bg-indigo-600/10 flex items-center justify-center mx-auto mb-6 text-3xl font-bold text-indigo-400">
                {item.step}
              </div>
              <h3 className="text-2xl font-semibold mb-3">{item.title}</h3>
              <p className="text-gray-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="container mx-auto px-4 py-24 border-t border-gray-700">
        <div className="text-center mb-16">
          <div className="text-indigo-400 font-semibold uppercase mb-4 tracking-wider">Testimonials</div>
          <h2 className="text-4xl font-bold mb-4">Trusted by Leading Sales Teams</h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Hear how MailVanta has redefined outreach for companies around the globe.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {[
            {
              quote: "MailVanta has revolutionized our outreach. The AI content and smart follow-ups save us countless hours and drive amazing results.",
              name: "Sarah Chen",
              role: "Growth Lead, TechStart",
            },
            {
              quote: "The real-time analytics and automated sequences have boosted our conversion rates dramatically. Truly a game changer!",
              name: "Michael Rodriguez",
              role: "Sales Director, GrowthX",
            },
            {
              quote: "Thanks to MailVanta, our team is more efficient than ever. The intuitive interface and powerful features are unmatched.",
              name: "Emma Thompson",
              role: "Head of Sales, CloudTech",
            },
          ].map((testimonial, idx) => (
            <Card key={idx} className="p-8">
              <div className="mb-6 flex justify-center">
                <div className="flex text-yellow-400">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
              </div>
              <p className="text-gray-300 mb-6 italic">"{testimonial.quote}"</p>
              <div className="text-center">
                <div className="font-semibold">{testimonial.name}</div>
                <div className="text-sm text-gray-400">{testimonial.role}</div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Integrations */}
      <section className="container mx-auto px-4 py-24 border-t border-gray-700">
        <div className="text-center mb-16">
          <div className="text-indigo-400 font-semibold uppercase mb-4 tracking-wider">Integrations</div>
          <h2 className="text-4xl font-bold mb-4">Seamless Integrations</h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Easily connect with your favorite CRM and productivity tools for a smooth workflow.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center">
          {["Salesforce", "HubSpot", "Pipedrive", "Slack"].map((tool, idx) => (
            <div key={idx} className="flex items-center justify-center p-8 bg-gray-800 rounded-lg">
              <span className="text-xl font-semibold text-gray-400">{tool}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="container mx-auto px-4 py-24 text-center border-t border-gray-700">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Ready to Supercharge Your Outreach?</h2>
          <p className="text-xl text-gray-400 mb-8">
            Join thousands of professionals using MailVanta to drive engagement, boost conversions, and win more deals.
          </p>
          {!user && (
            <div className="space-y-4">
              <Link to="/auth">
                <Button size="lg" className="px-10 py-5 text-lg flex items-center justify-center">
                  Start Your Free Trial
                  <svg className="w-5 h-5 ml-2 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Button>
              </Link>
              <p className="text-sm text-gray-400">
                No credit card • 14-day trial • Full feature access
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}