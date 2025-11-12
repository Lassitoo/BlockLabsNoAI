import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileText, Calendar, User, CheckCircle, Clock, Globe, Building, Tag, Languages, ExternalLink, AlignLeft, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';

interface DocumentMetadata {
  title?: string;
  type?: string;
  publication_date?: string;
  version?: string;
  source?: string;
  country?: string;
  language?: string;
  url_source?: string;
  context?: string;
}

interface Document {
  id: number;
  title: string;
  file_name: string;
  status: string;
  uploaded_by: string;
  created_at: string;
  annotated_pages: number;
  total_pages?: number;
  metadata: DocumentMetadata;
  validated_at?: string;
}

const DocumentMetadataView = () => {
  const router = useRouter();
  const { id } = router.query;
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [structuredHtml, setStructuredHtml] = useState<string>('');
  const [structuredHtmlCss, setStructuredHtmlCss] = useState<string>('');
  const [loadingStructured, setLoadingStructured] = useState(false);

  useEffect(() => {
    if (id) {
      fetchDocument();
      fetchStructuredHtml();
    }
  }, [id]);

  const fetchStructuredHtml = async () => {
    setLoadingStructured(true);
    try {
      const response = await fetch(`http://localhost:8000/api/document/${id}/structured/`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStructuredHtml(data.structured_html || '');
          setStructuredHtmlCss(data.structured_html_css || '');
        }
      }
    } catch (error) {
      console.error('Error fetching structured HTML:', error);
    } finally {
      setLoadingStructured(false);
    }
  };

  const fetchDocument = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8000/api/annotation/document/${id}/`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const docData = data.data?.document || data.document || data;
          if (docData) {
            const metadata = docData.metadata || {
              title: docData.title,
              type: docData.doc_type || docData.type,
              publication_date: docData.publication_date,
              version: docData.version,
              source: docData.source,
              country: docData.country,
              language: docData.language,
              url_source: docData.url_source,
              context: docData.context,
            };

            setDocument({ ...docData, metadata });
          } else {
            setError('Structure de réponse invalide');
          }
        } else {
          setError(data.error || 'Erreur lors du chargement');
        }
      } else {
        setError('Erreur lors du chargement');
      }
    } catch (error) {
      console.error('Error fetching document:', error);
      setError('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const metadataFields = [
    { key: 'title', label: 'Titre', icon: FileText, fullWidth: true },
    { key: 'type', label: 'Type', icon: Tag },
    { key: 'publication_date', label: 'Date de publication', icon: Calendar },
    { key: 'version', label: 'Version', icon: Tag },
    { key: 'source', label: 'Source', icon: Building },
    { key: 'country', label: 'Pays', icon: Globe },
    { key: 'language', label: 'Langue', icon: Languages },
    { key: 'url_source', label: 'URL', icon: ExternalLink, fullWidth: true },
    { key: 'context', label: 'Contexte', icon: AlignLeft, fullWidth: true },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto"></div>
            <p className="text-sm text-gray-600">Chargement...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !document) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto mt-8">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-red-900 mb-2">Erreur</h3>
              <p className="text-sm text-red-700">{error || 'Document non trouvé'}</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const hasMetadata = document.metadata && Object.values(document.metadata).some(v => v);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="mb-3 -ml-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Retour
            </Button>
            
            <h1 className="text-2xl font-semibold text-gray-900 mb-3 break-words line-clamp-3">
              {document.title || document.file_name}
            </h1>
            
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>{new Date(document.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4" />
                <span>{document.uploaded_by}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {document.validated_at ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-700" />
                    <span className="text-green-700 font-medium">Validé</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="text-amber-600 font-medium">En attente</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">Fichier</p>
              <p className="text-sm font-medium text-gray-900 truncate">{document.file_name}</p>
            </CardContent>
          </Card>
          
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">Statut</p>
              <Badge 
                variant={document.status === 'validated' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {document.status?.replace('_', ' ')}
              </Badge>
            </CardContent>
          </Card>
          
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">Pages annotées</p>
              <p className="text-sm font-medium text-gray-900">
                {document.annotated_pages || 0} / {document.total_pages || 0}
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">Validé le</p>
              <p className="text-sm font-medium text-gray-900">
                {document.validated_at
                  ? new Date(document.validated_at).toLocaleDateString('fr-FR')
                  : '—'
                }
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Metadata Section */}
        <Card className="border-gray-200">
          <CardHeader className="border-b border-gray-100 pb-4">
            <CardTitle className="text-lg font-semibold text-gray-900">
              Métadonnées du document
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {!hasMetadata ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  Aucune métadonnée disponible
                </p>
                <p className="text-sm text-gray-500">
                  Les métadonnées n&apos;ont pas encore été extraites
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {metadataFields.map((field) => {
                  const value = document.metadata?.[field.key as keyof DocumentMetadata];
                  const Icon = field.icon;

                  if (!value) return null;

                  return (
                    <div 
                      key={field.key} 
                      className={`${field.fullWidth ? 'md:col-span-2' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4 h-4 text-gray-400" />
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {field.label}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-md p-3 border border-gray-100">
                        {field.key === 'url_source' ? (
                          <a
                            href={value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-700 hover:underline break-all"
                          >
                            {value}
                          </a>
                        ) : (
                          <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                            {value}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Structured Content Section */}
        <Card className="border-gray-200">
          <CardHeader className="border-b border-gray-100 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-gray-900">
                Contenu structuré
              </CardTitle>
              {structuredHtml && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchStructuredHtml}
                  disabled={loadingStructured}
                  className="text-gray-600 hover:text-gray-900"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingStructured ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {structuredHtmlCss && (
              <style dangerouslySetInnerHTML={{ __html: structuredHtmlCss }} />
            )}

            <div className="h-[700px] overflow-y-auto">
              {loadingStructured ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-3">
                    <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto"></div>
                    <p className="text-sm text-gray-600">Chargement du contenu...</p>
                  </div>
                </div>
              ) : structuredHtml ? (
                <div
                  className="pdf-document-container prose prose-sm max-w-none bg-white p-8"
                  dangerouslySetInnerHTML={{ __html: structuredHtml }}
                />
              ) : (
                <div className="flex items-center justify-center h-full p-8">
                  <div className="text-center max-w-md">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-2">
                      Aucun contenu structuré
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      Le contenu n&apos;a pas encore été extrait pour ce document
                    </p>
                    <Button
                      variant="outline"
                      onClick={fetchStructuredHtml}
                      className="text-sm"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Recharger
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default DocumentMetadataView;