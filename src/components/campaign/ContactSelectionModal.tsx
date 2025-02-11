import { useState, useEffect } from 'react';
import { Button } from '../shadcn/Button';
import { Card } from '../shadcn/Card';
import { supabase } from '../../lib/supabase/client';
import type { Contact, ContactList } from '../../lib/supabase/client';

interface ContactSelectionModalProps {
  onClose: () => void;
  onSave: (contacts: Contact[]) => Promise<void>;
  campaignId: string;
}

export function ContactSelectionModal({ onClose, onSave, campaignId }: ContactSelectionModalProps) {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch contact lists
        const { data: listsData, error: listsError } = await supabase
          .from('contact_lists')
          .select('*')
          .order('created_at', { ascending: false });

        if (listsError) throw listsError;
        setLists(listsData || []);

        // Fetch all contacts initially
        const { data: contactsData, error: contactsError } = await supabase
          .from('contacts')
          .select('*')
          .is('campaign_id', null) // Only get contacts not assigned to any campaign
          .order('created_at', { ascending: false });

        if (contactsError) throw contactsError;
        setContacts(contactsData || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleListChange = async (listId: string | 'all') => {
    setSelectedListId(listId);
    setLoading(true);
    try {
      if (listId === 'all') {
        // Fetch all unassigned contacts
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .is('campaign_id', null)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setContacts(data || []);
      } else {
        // First get the contact IDs from the list
        const { data: memberData, error: memberError } = await supabase
          .from('contact_list_members')
          .select('contact_id')
          .eq('list_id', listId);

        if (memberError) throw memberError;
        const contactIds = memberData.map(m => m.contact_id);

        // Then fetch the actual contacts
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .in('id', contactIds)
          .is('campaign_id', null)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setContacts(data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (contacts.length === 0) {
      setError('No contacts available to add');
      return;
    }

    setSaving(true);
    try {
      await onSave(contacts);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contacts to campaign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Add Contacts to Campaign</h2>
          <p className="text-gray-400">
            Select contacts from a list or use all available contacts
          </p>
        </div>

        {error && (
          <div className="bg-red-900 text-red-300 px-4 py-2 rounded mb-4">
            {error}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">
            Contact Source
          </label>
          <select
            value={selectedListId}
            onChange={(e) => handleListChange(e.target.value)}
            className="input mb-4"
            disabled={loading}
          >
            <option value="all">All Available Contacts</option>
            {lists.map(list => (
              <option key={list.id} value={list.id}>
                {list.name} ({list.type})
              </option>
            ))}
          </select>

          <div className="bg-background-secondary rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                Available Contacts
              </h3>
              <span className="text-gray-400">
                {contacts.length} contacts
              </span>
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-400">
                Loading contacts...
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No available contacts found
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b border-gray-700">
                      <th className="pb-2">Name</th>
                      <th className="pb-2">Email</th>
                      <th className="pb-2">Company</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map(contact => (
                      <tr key={contact.id} className="border-b border-gray-700">
                        <td className="py-2">
                          {contact.first_name} {contact.last_name}
                        </td>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || contacts.length === 0}
          >
            {saving ? 'Adding Contacts...' : `Add ${contacts.length} Contacts`}
          </Button>
        </div>
      </Card>
    </div>
  );
} 