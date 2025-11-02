import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tag, Trash2, Search, Filter, FileText, User, CheckCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface Annotation {
  id: number;
  text: string;
  full_text: string;
  type: {
    id: number;
    name: string;
    display_name: string;
    color: string;
  };
  document: {
    id: number;
    title: string;
  };
  page_number: number;
  confidence: number;
  created_by: string;
  created_at: string | null;
  is_validated: boolean;
}

interface FilterOptions {
  types: Array<{ id: number; name: string; display_name: string }>;
  creators: Array<{ id: number; username: string }>;
  documents: Array<{ id: number; title: string }>;
}

const AnnotationManagement = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  
  // Filters
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterDocument, setFilterDocument] = useState('all');
  const [filterCreator, setFilterCreator] = useState('all');
  const [minConfidence, setMinConfidence] = useState('0');

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/login');
      return;
    }
    fetchAnnotations();
  }, [user, router, filterType, filterDocument, filterCreator, minConfidence]);

  const fetchAnnotations = async () => {
    try {
      const params = new URLSearchParams();
      if (filterType !== 'all') params.append('type', filterType);
      if (filterDocument !== 'all') params.append('document_id', filterDocument);
      if (filterCreator !== 'all') params.append('created_by', filterCreator);
      if (minConfidence !== '0') params.append('min_confidence', minConfidence);

      const response = await axios.get<{ 
        success: boolean; 
        annotations: Annotation[];
        total_count: number;
        filter_options: FilterOptions;
      }>(
        `http://localhost:8000/api/admin/annotations/?${params.toString()}`,
        { withCredentials: true }
      );

      if (response.data.success) {
        setAnnotations(response.data.annotations);
        setFilterOptions(response.data.filter_options);
      }
    } catch (error) {
      console.error('Error fetching annotations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      alert('Select annotations to delete');
      return;
    }

    if (!confirm(`Delete ${selectedIds.length} annotation(s)?`)) return;

    try {
      await axios.post(
        'http://localhost:8000/api/admin/annotations/bulk-delete/',
        { annotation_ids: selectedIds },
        { withCredentials: true }
      );
      setSelectedIds([]);
      fetchAnnotations();
    } catch (error) {
      console.error('Error deleting annotations:', error);
      alert('Failed to delete annotations');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === annotations.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(annotations.map(a => a.id));
    }
  };

  const filteredAnnotations = annotations.filter(ann =>
    ann.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ann.document.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Annotation Management</h1>
            <p className="text-slate-600 mt-2">View and manage all system annotations</p>
          </div>
          <div className="flex items-center space-x-2">
            {selectedIds.length > 0 && (
              <Button onClick={handleBulkDelete} variant="destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected ({selectedIds.length})
              </Button>
            )}
            <Button onClick={() => router.push('/admin/AnnotationTypeManagement')} variant="outline">
              <Tag className="w-4 h-4 mr-2" />
              Manage Types
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="bg-white border-slate-200 shadow-lg mb-6">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Filter className="w-5 h-5 mr-2" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Search className="w-4 h-4 inline mr-1" />
                  Search Text
                </label>
                <Input
                  placeholder="Search annotations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Tag className="w-4 h-4 inline mr-1" />
                  Annotation Type
                </label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {filterOptions?.types.map(type => (
                      <SelectItem key={type.id} value={type.id.toString()}>
                        {type.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <FileText className="w-4 h-4 inline mr-1" />
                  Document
                </label>
                <Select value={filterDocument} onValueChange={setFilterDocument}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Documents</SelectItem>
                    {filterOptions?.documents.map(doc => (
                      <SelectItem key={doc.id} value={doc.id.toString()}>
                        {doc.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <User className="w-4 h-4 inline mr-1" />
                  Created By
                </label>
                <Select value={filterCreator} onValueChange={setFilterCreator}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {filterOptions?.creators.map(creator => (
                      <SelectItem key={creator.id} value={creator.username}>
                        {creator.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Min Confidence
                </label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(e.target.value)}
                  placeholder="0-100"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Annotations Table */}
        <Card className="bg-white border-slate-200 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <Tag className="w-5 h-5 mr-2" />
                Annotations ({filteredAnnotations.length})
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={selectedIds.length === annotations.length && annotations.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm text-slate-600">Select All</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 w-12"></th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Text</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Document</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Page</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Confidence</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Creator</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAnnotations.length > 0 ? (
                    filteredAnnotations.map((ann) => (
                      <tr key={ann.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <Checkbox
                            checked={selectedIds.includes(ann.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedIds([...selectedIds, ann.id]);
                              } else {
                                setSelectedIds(selectedIds.filter(id => id !== ann.id));
                              }
                            }}
                          />
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <p className="text-sm text-slate-900 truncate" title={ann.full_text}>
                            {ann.text}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className="px-2 py-1 rounded text-xs font-medium"
                            style={{
                              backgroundColor: ann.type.color + '20',
                              color: ann.type.color
                            }}
                          >
                            {ann.type.display_name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-700 max-w-xs truncate">
                          {ann.document.title}
                        </td>
                        <td className="py-3 px-4 text-center text-sm font-semibold text-slate-900">
                          {ann.page_number}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`text-sm font-semibold ${
                            ann.confidence >= 80 ? 'text-green-600' :
                            ann.confidence >= 60 ? 'text-orange-600' :
                            'text-red-600'
                          }`}>
                            {ann.confidence}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-700">
                          {ann.created_by}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {ann.is_validated ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs flex items-center justify-center">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Validated
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-12 text-center">
                        <Tag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">No annotations found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AnnotationManagement;