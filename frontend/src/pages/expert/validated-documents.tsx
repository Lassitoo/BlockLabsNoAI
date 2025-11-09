// pages/expert/validated-documents.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SearchCheck,
  FileCheck,
  Filter,
  RefreshCw,
  BarChart3,
  Eye,
  FileJson,
  Download,
  Info,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface Document {
  id: number;
  title: string;
  doc_type: string;
  source: string;
  country: string;
  total_pages: number;
  pages_analyzed: number;
  is_expert_validated: boolean;
  summary?: string;
}

export default function ValidatedDocuments() {
  const router = useRouter();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState<number | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchValidatedDocuments();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [documents, searchQuery, docTypeFilter, sourceFilter, statusFilter]);

  const fetchValidatedDocuments = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        'http://localhost:8000/api/expert/validated-documents/',
        { credentials: 'include' }
      );

      if (!response.ok) throw new Error('Erreur lors du chargement');

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...documents];

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (doc) =>
          doc.title?.toLowerCase().includes(query) ||
          doc.doc_type?.toLowerCase().includes(query) ||
          doc.source?.toLowerCase().includes(query) ||
          doc.country?.toLowerCase().includes(query)
      );
    }

    // Type filter
    if (docTypeFilter) {
      filtered = filtered.filter((doc) => doc.doc_type === docTypeFilter);
    }

    // Source filter
    if (sourceFilter) {
      filtered = filtered.filter((doc) => doc.source === sourceFilter);
    }

    // Status filter
    if (statusFilter === 'validated') {
      filtered = filtered.filter((doc) => !doc.is_expert_validated);
    } else if (statusFilter === 'expert_validated') {
      filtered = filtered.filter((doc) => doc.is_expert_validated);
    }

    setFilteredDocuments(filtered);
  };

  const handleAnalyzeDocument = async (docId: number) => {
    if (!confirm('Voulez-vous lancer l\'analyse page par page de ce document ?')) {
      return;
    }

    try {
      setAnalyzing(docId);
      const response = await fetch(
        `http://localhost:8000/api/expert/documents/${docId}/analyze-pages/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force_reanalyze: false })
        }
      );

      if (response.ok) {
        const data = await response.json();
        alert(`Analyse terminée: ${data.total_relations || 0} relations trouvées`);
        await fetchValidatedDocuments();
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de l\'analyse');
    } finally {
      setAnalyzing(null);
    }
  };

  const handleViewAnalysis = (docId: number) => {
    router.push(`/expert/documents/${docId}/analysis`);
  };

  const handleViewJson = (docId: number) => {
    router.push(`/expert/documents/${docId}/json`);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-green-500 to-emerald-500 text-white">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <SearchCheck className="w-6 h-6" />
              Analyse Sémantique des Documents Validés
            </CardTitle>
          </CardHeader>
        </Card>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtres
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Rechercher</label>
                <Input
                  placeholder="🔍 Rechercher par titre, type, source..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Type de document</label>
                <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Tous</SelectItem>
                    <SelectItem value="guide">Guide</SelectItem>
                    <SelectItem value="rapport">Rapport</SelectItem>
                    <SelectItem value="regulation">Réglementation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Source</label>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Toutes</SelectItem>
                    <SelectItem value="EMA">EMA</SelectItem>
                    <SelectItem value="FDA">FDA</SelectItem>
                    <SelectItem value="ANSM">ANSM</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Statut</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Tous</SelectItem>
                    <SelectItem value="validated">Validé par métadonneur</SelectItem>
                    <SelectItem value="expert_validated">Validé par expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={fetchValidatedDocuments}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Actualiser
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Documents Grid */}
        {filteredDocuments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocuments.map((doc) => (
              <Card
                key={doc.id}
                className={`transition-all hover:shadow-lg ${
                  doc.is_expert_validated
                    ? 'border-l-4 border-l-blue-500'
                    : 'border-l-4 border-l-green-500'
                }`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base line-clamp-2">
                      {doc.title || `Document #${doc.id}`}
                    </CardTitle>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {doc.is_expert_validated ? (
                      <Badge className="bg-blue-600">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Validé Expert
                      </Badge>
                    ) : (
                      <Badge className="bg-green-600">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Validé Métadonneur
                      </Badge>
                    )}
                    {doc.pages_analyzed > 0 ? (
                      <Badge variant="outline" className="bg-blue-50">
                        {doc.pages_analyzed}/{doc.total_pages} pages
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Non analysé
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground mb-4">
                    <div className="flex justify-between">
                      <span className="font-medium">Type:</span>
                      <span>{doc.doc_type || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Source:</span>
                      <span>{doc.source || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Pays:</span>
                      <span>{doc.country || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Pages:</span>
                      <span>{doc.total_pages}</span>
                    </div>
                  </div>

                  {doc.summary && (
                    <p className="text-sm line-clamp-3 mb-4">{doc.summary}</p>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleAnalyzeDocument(doc.id)}
                      disabled={analyzing === doc.id}
                    >
                      {analyzing === doc.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <BarChart3 className="w-4 h-4" />
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleViewAnalysis(doc.id)}
                      disabled={doc.pages_analyzed === 0}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleViewJson(doc.id)}
                    >
                      <FileJson className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-20 text-center">
              <Info className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">Aucun document trouvé</h3>
              <p className="text-muted-foreground">
                {searchQuery || docTypeFilter || sourceFilter || statusFilter
                  ? 'Essayez de modifier vos filtres de recherche'
                  : 'Aucun document validé disponible'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
