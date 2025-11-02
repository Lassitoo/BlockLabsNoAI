import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, Trash2, Plus } from 'lucide-react';

interface AnnotationType {
  id: number;
  name: string;
  display_name: string;
  color: string;
  description: string;
  usage_count: number;
}

const AnnotationTypeManagement = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [types, setTypes] = useState<AnnotationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newType, setNewType] = useState({
    name: '',
    display_name: '',
    color: '#3b82f6',
    description: ''
  });

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/login');
      return;
    }
    fetchTypes();
  }, [user, router]);

  const fetchTypes = async () => {
    try {
      const response = await axios.get<{ success: boolean; annotation_types: AnnotationType[] }>(
        'http://localhost:8000/api/admin/annotation-types/',
        { withCredentials: true }
      );
      if (response.data.success) {
        setTypes(response.data.annotation_types);
      }
    } catch (error) {
      console.error('Error fetching annotation types:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateType = async () => {
    if (!newType.name || !newType.display_name) {
      alert('Name and display name are required');
      return;
    }

    try {
      await axios.post(
        'http://localhost:8000/api/admin/annotation-types/create/',
        newType,
        { withCredentials: true }
      );
      fetchTypes();
      setShowCreateForm(false);
      setNewType({ name: '', display_name: '', color: '#3b82f6', description: '' });
    } catch (error) {
      console.error('Error creating annotation type:', error);
      alert('Failed to create annotation type');
    }
  };

  const handleDeleteType = async (typeId: number, name: string) => {
    if (!confirm(`Delete annotation type "${name}"? This will also delete all annotations of this type.`)) return;

    try {
      await axios.delete(`http://localhost:8000/api/admin/annotation-types/${typeId}/delete/`, {
        withCredentials: true
      });
      fetchTypes();
    } catch (error) {
      console.error('Error deleting annotation type:', error);
      alert('Failed to delete annotation type');
    }
  };

  if (!user || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <nav className="w-full px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <span className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              BlockLabs Admin
            </span>
          </div>
          <button
            onClick={() => router.push('/admin/AdminDashboard')}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-blue-600"
          >
            ← Back to Dashboard
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Annotation Type Management</h1>
            <p className="text-slate-600 mt-2">Manage annotation types and categories</p>
          </div>
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-gradient-to-r from-blue-600 to-indigo-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Type
          </Button>
        </div>

        {showCreateForm && (
          <Card className="bg-white border-slate-200 shadow-lg mb-6">
            <CardHeader>
              <CardTitle>Create New Annotation Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Name (lowercase, underscores)
                  </label>
                  <Input
                    placeholder="required_document"
                    value={newType.name}
                    onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Display Name
                  </label>
                  <Input
                    placeholder="Required Document"
                    value={newType.display_name}
                    onChange={(e) => setNewType({ ...newType, display_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Color
                  </label>
                  <Input
                    type="color"
                    value={newType.color}
                    onChange={(e) => setNewType({ ...newType, color: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Description
                  </label>
                  <Input
                    placeholder="Description..."
                    value={newType.description}
                    onChange={(e) => setNewType({ ...newType, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2 mt-4">
                <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateType} className="bg-green-600 hover:bg-green-700">
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-white border-slate-200 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Tag className="w-5 h-5 mr-2" />
              All Annotation Types ({types.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {types.map((type) => (
                <div
                  key={type.id}
                  className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: type.color }}
                      />
                      <h3 className="font-semibold text-slate-900">{type.display_name}</h3>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteType(type.id, type.display_name)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                  <p className="text-xs text-slate-600 mb-2">{type.name}</p>
                  <p className="text-sm text-slate-700 mb-3">{type.description || 'No description'}</p>
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Usage: {type.usage_count} annotations</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AnnotationTypeManagement;