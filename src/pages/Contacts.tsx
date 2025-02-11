import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase/client';
import type { Contact, ContactList } from '../lib/supabase/client';
import { Button } from '../components/shadcn/Button';
import { Card } from '../components/shadcn/Card';
import Papa from 'papaparse';
import { ContactListModal } from '../components/contacts/ContactListModal';

interface ImportData {
  file: File | null;
  mapping: Record<string, string>;
  preview: Record<string, string>[];
}

interface ContactImport {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  position?: string;
  [key: string]: string | undefined;
}

interface MissingEmailsData {
  show: boolean;
  contacts: Array<{
    row: ContactImport;
    index: number;
  }>;
  validContacts: Array<{
    contact: Partial<Contact>;
    index: number;
  }>;
}

export default function Contacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'lists' | 'import'>('all');
  const [importData, setImportData] = useState<ImportData>({
    file: null,
    mapping: {},
    preview: []
  });
  const [missingEmails, setMissingEmails] = useState<MissingEmailsData>({
    show: false,
    contacts: [],
    validContacts: []
  });
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [showListModal, setShowListModal] = useState(false);
  const [sortField, setSortField] = useState<keyof Contact>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<Contact['status'] | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch contacts
        const { data: contactsData, error: contactsError } = await supabase
          .from('contacts')
          .select('*')
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false });

        if (contactsError) throw contactsError;
        setContacts(contactsData);

        // Fetch contact lists
        const { data: listsData, error: listsError } = await supabase
          .from('contact_lists')
          .select('*')
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false });

        if (listsError) throw listsError;
        setContactLists(listsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchData();
    }
  }, [user]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      preview: 5,
      complete: (results) => {
        console.log('Preview parse results:', results);
        setImportData({
          file,
          mapping: {},
          preview: results.data
        });
      }
    });
  };

  const processContacts = useCallback((data: ContactImport[], user_id: string) => {
    const validContacts: Array<{ contact: Partial<Contact>; index: number }> = [];
    const missingEmailContacts: Array<{ row: ContactImport; index: number }> = [];

    data.forEach((row, index) => {
      const email = row[importData.mapping.email];
      const mappedContact = {
        user_id,
        email: email || '',
        first_name: row[importData.mapping.first_name] || undefined,
        last_name: row[importData.mapping.last_name] || undefined,
        company: row[importData.mapping.company] || undefined,
        position: row[importData.mapping.position] || undefined,
        status: 'new' as const,
        custom_fields: Object.keys(row)
          .filter(key => !['email', 'first_name', 'last_name', 'company', 'position'].includes(key))
          .reduce((acc, key) => ({ ...acc, [key]: row[key] }), {})
      };

      if (!email) {
        missingEmailContacts.push({ row, index });
      } else {
        validContacts.push({ contact: mappedContact, index });
      }
    });

    return { validContacts, missingEmailContacts };
  }, [importData.mapping]);

  const importContacts = async (contacts: Partial<Contact>[]) => {
    const BATCH_SIZE = 100;
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase
        .from('contacts')
        .insert(batch);

      if (insertError) {
        console.error('Batch insert error:', insertError);
        throw insertError;
      }
    }
  };

  const handleImport = async () => {
    if (!importData.file || !user) return;

    try {
      setLoading(true);
      setError(null);
      
      const results = await new Promise<Papa.ParseResult<ContactImport>>((resolve, reject) => {
        Papa.parse<ContactImport>(importData.file as File, {
          header: true,
          complete: resolve,
          error: reject,
          skipEmptyLines: true
        });
      });

      console.log('Full parse results:', results);

      if (results.errors.length > 0) {
        console.error('CSV parse errors:', results.errors);
        throw new Error('Failed to parse CSV file. Please check the file format.');
      }

      const { validContacts, missingEmailContacts } = processContacts(results.data, user.id);

      if (missingEmailContacts.length > 0) {
        setMissingEmails({
          show: true,
          contacts: missingEmailContacts,
          validContacts
        });
        return;
      }

      // If no missing emails, proceed with import
      await importContacts(validContacts.map(vc => vc.contact));

      // Reset states and refresh contacts
      setImportData({ file: null, mapping: {}, preview: [] });
      const { data, error: refreshError } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (refreshError) throw refreshError;
      setContacts(data);
    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'Failed to import contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleMissingEmailsDecision = async (includeAll: boolean) => {
    if (!user) return;

    try {
      setLoading(true);
      
      let contactsToImport = missingEmails.validContacts.map(vc => vc.contact);
      
      if (includeAll) {
        // Include contacts without emails
        const additionalContacts = missingEmails.contacts.map(mc => ({
          user_id: user.id,
          email: '',
          first_name: mc.row[importData.mapping.first_name] || undefined,
          last_name: mc.row[importData.mapping.last_name] || undefined,
          company: mc.row[importData.mapping.company] || undefined,
          position: mc.row[importData.mapping.position] || undefined,
          status: 'new' as const,
          custom_fields: Object.keys(mc.row)
            .filter(key => !['email', 'first_name', 'last_name', 'company', 'position'].includes(key))
            .reduce((acc, key) => ({ ...acc, [key]: mc.row[key] }), {})
        }));
        
        contactsToImport = [...contactsToImport, ...additionalContacts];
      }

      await importContacts(contactsToImport);

      // Reset states and refresh contacts
      setImportData({ file: null, mapping: {}, preview: [] });
      setMissingEmails({ show: false, contacts: [], validContacts: [] });
      
      const { data, error: refreshError } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (refreshError) throw refreshError;
      setContacts(data);
    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'Failed to import contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleContactSelect = (contact: Contact) => {
    setSelectedContacts(prev => {
      const isSelected = prev.some(c => c.id === contact.id);
      if (isSelected) {
        return prev.filter(c => c.id !== contact.id);
      } else {
        return [...prev, contact];
      }
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedContacts(checked ? contacts : []);
  };

  const handleCreateList = async (data: Partial<ContactList>) => {
    if (!user) return;

    try {
      // Create the list
      const { data: list, error: listError } = await supabase
        .from('contact_lists')
        .insert([
          {
            ...data,
            user_id: user.id
          }
        ])
        .select()
        .single();

      if (listError) throw listError;

      // Add selected contacts to the list
      if (selectedContacts.length > 0 && list) {
        const { error: membersError } = await supabase
          .from('contact_list_members')
          .insert(
            selectedContacts.map(contact => ({
              contact_id: contact.id,
              list_id: list.id,
              score: contact.engagement_score || 0,
              engagement_metrics: {
                opens: 0,
                clicks: 0,
                replies: 0
              }
            }))
          );

        if (membersError) throw membersError;
      }

      // Refresh contact lists
      const { data: refreshedLists, error: refreshError } = await supabase
        .from('contact_lists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (refreshError) throw refreshError;
      setContactLists(refreshedLists);
      setSelectedContacts([]);
    } catch (err) {
      console.error('Failed to create list:', err);
      throw err;
    }
  };

  const sortContacts = (a: Contact, b: Contact) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    if (aValue === null || aValue === undefined) return sortDirection === 'asc' ? -1 : 1;
    if (bValue === null || bValue === undefined) return sortDirection === 'asc' ? 1 : -1;

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return sortDirection === 'asc'
      ? (aValue < bValue ? -1 : 1)
      : (bValue < aValue ? -1 : 1);
  };

  const filterContacts = (contact: Contact) => {
    const matchesStatus = filterStatus === 'all' || contact.status === filterStatus;
    const matchesSearch = !searchTerm || 
      contact.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (contact.first_name && contact.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (contact.last_name && contact.last_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (contact.company && contact.company.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesStatus && matchesSearch;
  };

  const filteredContacts = contacts
    .filter(filterContacts)
    .sort(sortContacts);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center">
        <div className="text-gray-300">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Contacts</h1>
        <div className="space-x-4">
          <Button
            variant="secondary"
            onClick={() => setActiveTab('import')}
          >
            Import Contacts
          </Button>
          <Button onClick={() => setActiveTab('lists')}>
            Manage Lists
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900 text-red-300 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      <div className="flex space-x-4 mb-8 border-b border-gray-700">
        <button
          className={`px-4 py-2 ${activeTab === 'all' ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}
          onClick={() => setActiveTab('all')}
        >
          All Contacts ({contacts.length})
        </button>
        <button
          className={`px-4 py-2 ${activeTab === 'lists' ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}
          onClick={() => setActiveTab('lists')}
        >
          Contact Lists ({contactLists.length})
        </button>
        <button
          className={`px-4 py-2 ${activeTab === 'import' ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}
          onClick={() => setActiveTab('import')}
        >
          Import
        </button>
      </div>

      {activeTab === 'all' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 items-center mb-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as Contact['status'] | 'all')}
              className="input w-auto"
            >
              <option value="all">All Statuses</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="responded">Responded</option>
              <option value="converted">Converted</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>
            {selectedContacts.length > 0 && (
              <Button onClick={() => setShowListModal(true)}>
                Add to List ({selectedContacts.length})
              </Button>
            )}
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-gray-700">
                    <th className="pb-2">
                      <input
                        type="checkbox"
                        checked={selectedContacts.length === contacts.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-gray-700 bg-background-secondary text-primary focus:ring-primary"
                      />
                    </th>
                    <th
                      className="pb-2 cursor-pointer"
                      onClick={() => {
                        if (sortField === 'first_name') {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('first_name');
                          setSortDirection('asc');
                        }
                      }}
                    >
                      Name {sortField === 'first_name' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="pb-2 cursor-pointer"
                      onClick={() => {
                        if (sortField === 'email') {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('email');
                          setSortDirection('asc');
                        }
                      }}
                    >
                      Email {sortField === 'email' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="pb-2 cursor-pointer"
                      onClick={() => {
                        if (sortField === 'company') {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('company');
                          setSortDirection('asc');
                        }
                      }}
                    >
                      Company {sortField === 'company' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="pb-2 cursor-pointer"
                      onClick={() => {
                        if (sortField === 'status') {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('status');
                          setSortDirection('asc');
                        }
                      }}
                    >
                      Status {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="pb-2 cursor-pointer"
                      onClick={() => {
                        if (sortField === 'engagement_score') {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('engagement_score');
                          setSortDirection('desc');
                        }
                      }}
                    >
                      Engagement {sortField === 'engagement_score' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="pb-2 cursor-pointer"
                      onClick={() => {
                        if (sortField === 'last_contacted') {
                          setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('last_contacted');
                          setSortDirection('desc');
                        }
                      }}
                    >
                      Last Contact {sortField === 'last_contacted' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map((contact) => (
                    <tr key={contact.id} className="border-b border-gray-700">
                      <td className="py-2">
                        <input
                          type="checkbox"
                          checked={selectedContacts.some(c => c.id === contact.id)}
                          onChange={() => handleContactSelect(contact)}
                          className="rounded border-gray-700 bg-background-secondary text-primary focus:ring-primary"
                        />
                      </td>
                      <td className="py-2">{contact.first_name} {contact.last_name}</td>
                      <td className="py-2">{contact.email}</td>
                      <td className="py-2">{contact.company || '-'}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded text-sm ${
                          contact.status === 'converted'
                            ? 'bg-green-900 text-green-300'
                            : contact.status === 'responded'
                            ? 'bg-blue-900 text-blue-300'
                            : 'bg-gray-700 text-gray-300'
                        }`}>
                          {contact.status.charAt(0).toUpperCase() + contact.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-700 rounded-full h-2 mr-2">
                            <div
                              className="bg-primary rounded-full h-2"
                              style={{ width: `${Math.min(100, contact.engagement_score)}%` }}
                            />
                          </div>
                          <span className="text-sm">{contact.engagement_score}</span>
                        </div>
                      </td>
                      <td className="py-2">
                        {contact.last_contacted
                          ? new Date(contact.last_contacted).toLocaleDateString()
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'lists' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contactLists.map((list) => (
            <Card key={list.id} variant="hover">
              <h3 className="text-lg font-semibold mb-2">{list.name}</h3>
              <p className="text-gray-400 text-sm mb-4">{list.description}</p>
              <div className="flex justify-between items-center">
                <span className={`px-2 py-1 rounded text-sm ${
                  list.type === 'dynamic'
                    ? 'bg-purple-900 text-purple-300'
                    : list.type === 'segment'
                    ? 'bg-blue-900 text-blue-300'
                    : 'bg-gray-700 text-gray-300'
                }`}>
                  {list.type.charAt(0).toUpperCase() + list.type.slice(1)}
                </span>
                <Button variant="secondary" size="sm">
                  View Contacts
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'import' && (
        <Card>
          <h2 className="text-xl font-bold mb-4">Import Contacts</h2>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Upload CSV File
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-400
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-primary file:text-white
                  hover:file:bg-primary-hover"
              />
            </div>

            {importData.preview.length > 0 && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Map Fields</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Total rows in file: {importData.file ? 'Calculating...' : '0'}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={importData.mapping.email}
                        onChange={(e) => setImportData(prev => ({
                          ...prev,
                          mapping: { ...prev.mapping, email: e.target.value }
                        }))}
                        className="input"
                      >
                        <option value="">Select field</option>
                        {Object.keys(importData.preview[0]).map(field => (
                          <option key={field} value={field}>{field}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        First Name
                      </label>
                      <select
                        value={importData.mapping.first_name}
                        onChange={(e) => setImportData(prev => ({
                          ...prev,
                          mapping: { ...prev.mapping, first_name: e.target.value }
                        }))}
                        className="input"
                      >
                        <option value="">Select field</option>
                        {Object.keys(importData.preview[0]).map(field => (
                          <option key={field} value={field}>{field}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Last Name
                      </label>
                      <select
                        value={importData.mapping.last_name}
                        onChange={(e) => setImportData(prev => ({
                          ...prev,
                          mapping: { ...prev.mapping, last_name: e.target.value }
                        }))}
                        className="input"
                      >
                        <option value="">Select field</option>
                        {Object.keys(importData.preview[0]).map(field => (
                          <option key={field} value={field}>{field}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Company
                      </label>
                      <select
                        value={importData.mapping.company}
                        onChange={(e) => setImportData(prev => ({
                          ...prev,
                          mapping: { ...prev.mapping, company: e.target.value }
                        }))}
                        className="input"
                      >
                        <option value="">Select field</option>
                        {Object.keys(importData.preview[0]).map(field => (
                          <option key={field} value={field}>{field}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-2">Preview</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left border-b border-gray-700">
                          {Object.keys(importData.preview[0]).map(header => (
                            <th key={header} className="pb-2">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importData.preview.map((row, index) => (
                          <tr key={index} className="border-b border-gray-700">
                            {Object.values(row).map((value, i) => (
                              <td key={i} className="py-2">{value as string}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-sm text-gray-400">
                    Showing first {importData.preview.length} rows
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleImport}
                    disabled={!importData.mapping.email || loading}
                  >
                    {loading ? 'Importing...' : 'Import Contacts'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Add Missing Emails Modal */}
      {missingEmails.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl">
            <h2 className="text-xl font-bold mb-4">Missing Email Addresses</h2>
            <p className="text-gray-400 mb-4">
              {missingEmails.contacts.length} out of {missingEmails.contacts.length + missingEmails.validContacts.length} contacts are missing email addresses.
            </p>
            
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">Contacts without emails:</h3>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b border-gray-700">
                      <th className="pb-2">Row</th>
                      <th className="pb-2">First Name</th>
                      <th className="pb-2">Last Name</th>
                      <th className="pb-2">Company</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingEmails.contacts.map(({ row, index }) => (
                      <tr key={index} className="border-b border-gray-700">
                        <td className="py-2">{index + 1}</td>
                        <td className="py-2">{row[importData.mapping.first_name]}</td>
                        <td className="py-2">{row[importData.mapping.last_name]}</td>
                        <td className="py-2">{row[importData.mapping.company]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end space-x-4">
              <Button
                variant="secondary"
                onClick={() => handleMissingEmailsDecision(false)}
                disabled={loading}
              >
                Import Valid Only ({missingEmails.validContacts.length})
              </Button>
              <Button
                onClick={() => handleMissingEmailsDecision(true)}
                disabled={loading}
              >
                Import All ({missingEmails.contacts.length + missingEmails.validContacts.length})
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showListModal && (
        <ContactListModal
          onClose={() => setShowListModal(false)}
          onSave={handleCreateList}
          selectedContacts={selectedContacts}
        />
      )}
    </div>
  );
} 