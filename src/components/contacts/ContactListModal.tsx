import { useState, useEffect } from 'react';
import { Button } from '../shadcn/Button';
import { Card } from '../shadcn/Card';
import type { Contact, ContactList } from '../../lib/supabase/client';

interface ContactListModalProps {
  onClose: () => void;
  onSave: (data: Partial<ContactList>) => Promise<void>;
  selectedContacts?: Contact[];
  existingList?: ContactList;
}

export function ContactListModal({ onClose, onSave, selectedContacts, existingList }: ContactListModalProps) {
  const [formData, setFormData] = useState<Partial<ContactList>>({
    name: existingList?.name || '',
    description: existingList?.description || '',
    type: existingList?.type || 'manual',
    rules: existingList?.rules || { conditions: [], combination: 'and' }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contact list');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <h2 className="text-xl font-bold mb-4">
          {existingList ? 'Edit Contact List' : 'Create Contact List'}
        </h2>

        {error && (
          <div className="bg-red-900 text-red-300 px-4 py-2 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              List Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="input"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              List Type
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as ContactList['type'] }))}
              className="input"
            >
              <option value="manual">Manual</option>
              <option value="dynamic">Dynamic</option>
              <option value="segment">Segment</option>
            </select>
            <p className="text-sm text-gray-400 mt-1">
              {formData.type === 'manual' && 'Manually manage contacts in this list'}
              {formData.type === 'dynamic' && 'Automatically add contacts based on rules'}
              {formData.type === 'segment' && 'Create a segment based on contact properties'}
            </p>
          </div>

          {formData.type !== 'manual' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Rules
              </label>
              <div className="space-y-2">
                {/* We'll implement advanced rules UI in the next iteration */}
                <p className="text-sm text-gray-400">
                  Advanced filtering rules coming soon. Currently defaults to manual list type.
                </p>
              </div>
            </div>
          )}

          {selectedContacts && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Selected Contacts
              </label>
              <p className="text-sm text-gray-400">
                {selectedContacts.length} contacts will be added to this list
              </p>
            </div>
          )}

          <div className="flex justify-end space-x-4 mt-6">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.name}
            >
              {loading ? 'Saving...' : existingList ? 'Update List' : 'Create List'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
} 