import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Trash2, Search, CheckCircle, Clock, XCircle } from 'lucide-react';

interface Document {
  id: number;
  title: string;
  doc_type: string;
  owner: string;
  is_validated: boolean;
  is_ready_for_expert: boolean;
  is_expert_validated: boolean;
  total_pages: number;
  created_at: string;
  validated_at: string | null;
}

const DocumentManagement = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocs, setFilteredDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      router.push('/login');
      return;
    }
    fetchDocuments();
  }, [user, router]);

  useEffect(() => {
    const filtered = documents.filter(doc =>
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.owner.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredDocs(filtered);
  }, [searchTerm, documents]);

  const fetchDocuments = async () => {
    try {
      const response = await axios.get<{ success: boolean; documents: Document[] }>(
        'http://localhost:8000/api/admin/documents/',
        { withCredentials: true }
      );
      if (response.data.success) {
        setDocuments(response.data.documents);
        setFilteredDocs(response.data.documents);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = async (docId: number, title: string) => {
    if (!confirm(`Are you sure you want to delete document "${title}"?`)) return;

    try {
      await axios.delete(`http://localhost:8000/api/admin/documents/${docId}/delete/`, {
        withCredentials: true
      });
      fetchDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Failed to delete document');
    }
  };

  const getStatusBadge = (doc: Document) => {
    if (doc.is_expert_validated) {
      return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs flex items-center">
        <CheckCircle className="w-3 h-3 mr-1" /> Expert Validated
      </span>;
    }
    if (doc.is_ready_for_expert) {
      return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs flex items-center">
        <Clock className="w-3 h-3 mr-1" /> Ready for Expert
      </span>;
    }
    if (doc.is_validated) {
      return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs flex items-center">
        <CheckCircle className="w-3 h-3 mr-1" /> Validated
      </span>;
    }
    return <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs flex items-center">
      <Clock className="w-3 h-3 mr-1" /> Pending
    </span>;
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
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Document Management</h1>
          <p className="text-slate-600 mt-2">View and manage all system documents</p>
        </div>

        <Card className="bg-white border-slate-200 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                All Documents ({filteredDocs.length})
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search documents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Title</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Owner</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Pages</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                    <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Created</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((doc) => (
                    <tr key={doc.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900 max-w-xs truncate">
                        {doc.title}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{doc.doc_type}</td>
                      <td className="py-3 px-4 text-slate-600">{doc.owner}</td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-900">
                        {doc.total_pages}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getStatusBadge(doc)}
                      </td>
                      <td className="py-3 px-4 text-center text-sm text-slate-600">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteDocument(doc.id, doc.title)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DocumentManagement;