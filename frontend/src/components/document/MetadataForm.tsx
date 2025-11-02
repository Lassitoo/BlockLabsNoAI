import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RawDocument, DocumentMetadata } from '@/types/document';
import { documentService } from '@/services/documentService';
import { toast } from 'sonner';
import {
  Save,
  RefreshCw,
  CheckCircle,
  Heading,
  FileType,
  Calendar,
  Tag,
  Building,
  Globe,
  Languages,
  Link as LinkIcon,
  AlignLeft,
  Plus,
} from 'lucide-react';

interface MetadataFormProps {
  document: RawDocument;
  onUpdate?: (updatedDoc: RawDocument) => void;
}

export const MetadataForm = ({ document, onUpdate }: MetadataFormProps) => {
  const [metadata, setMetadata] = useState<DocumentMetadata>(document.metadata);
  const [isSaving, setIsSaving] = useState(false);
  const [isReextracting, setIsReextracting] = useState(false);
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');

  const handleFieldChange = (field: keyof DocumentMetadata, value: string) => {
    setMetadata(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await documentService.updateMetadata(document.id, metadata);
      toast.success('Métadonnées sauvegardées avec succès!');
      
      if (onUpdate) {
        onUpdate({ ...document, metadata });
      }
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error(error.response?.data?.error || 'Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReextract = async () => {
    setIsReextracting(true);
    try {
      const newMetadata = await documentService.reextractMetadata(document.id);
      setMetadata(newMetadata);
      toast.success('Métadonnées réextraites avec succès!');
    } catch (error: any) {
      console.error('Reextract error:', error);
      toast.error(error.response?.data?.error || 'Erreur lors de la réextraction');
    } finally {
      setIsReextracting(false);
    }
  };

  const handleValidate = async () => {
    try {
      await documentService.validateDocument(document.id);
      toast.success('Document validé avec succès!');
      
      if (onUpdate) {
        onUpdate({ ...document, is_validated: true });
      }
    } catch (error: any) {
      console.error('Validate error:', error);
      toast.error(error.response?.data?.error || 'Erreur lors de la validation');
    }
  };

  const handleAddCustomField = () => {
    if (newFieldName.trim()) {
      setCustomFields(prev => ({ ...prev, [newFieldName]: '' }));
      setNewFieldName('');
      setShowAddField(false);
    }
  };

  const fields = [
    {
      key: 'title' as keyof DocumentMetadata,
      label: 'Titre du document',
      icon: Heading,
      placeholder: 'Titre du document',
      autoExtracted: !!metadata.title,
    },
    {
      key: 'type' as keyof DocumentMetadata,
      label: 'Type de document',
      icon: FileType,
      placeholder: 'Type de document',
      autoExtracted: !!metadata.type,
    },
    {
      key: 'publication_date' as keyof DocumentMetadata,
      label: 'Date de publication',
      icon: Calendar,
      placeholder: 'Ex: 23 January 2025',
      autoExtracted: !!metadata.publication_date,
    },
    {
      key: 'version' as keyof DocumentMetadata,
      label: 'Version',
      icon: Tag,
      placeholder: 'Version du document',
      autoExtracted: false,
    },
    {
      key: 'source' as keyof DocumentMetadata,
      label: 'Source',
      icon: Building,
      placeholder: 'Source du document',
      autoExtracted: false,
    },
    {
      key: 'country' as keyof DocumentMetadata,
      label: 'Pays',
      icon: Globe,
      placeholder: 'Pays',
      autoExtracted: false,
    },
    {
      key: 'language' as keyof DocumentMetadata,
      label: 'Langue',
      icon: Languages,
      placeholder: 'Langue',
      autoExtracted: !!metadata.language,
    },
    {
      key: 'url_source' as keyof DocumentMetadata,
      label: 'URL Source',
      icon: LinkIcon,
      placeholder: 'URL du document source',
      autoExtracted: false,
      fullWidth: true,
    },
    {
      key: 'context' as keyof DocumentMetadata,
      label: 'Contexte',
      icon: AlignLeft,
      placeholder: 'Contexte du document',
      autoExtracted: !!metadata.context,
      fullWidth: true,
      textarea: true,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileType className="w-5 h-5" />
            Éditer les métadonnées
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReextract}
              disabled={isReextracting}
            >
              {isReextracting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Réextraction...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Réextraire
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(document.url || `/rawdocs/view-original/${document.id}/`, '_blank')}
            >
              Voir PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddField(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter Champ
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add Custom Field Dialog */}
        {showAddField && (
          <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
            <Label>Nom du nouveau champ</Label>
            <div className="flex gap-2">
              <Input
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="Ex: Produit, Dosage, etc."
                onKeyPress={(e) => e.key === 'Enter' && handleAddCustomField()}
              />
              <Button onClick={handleAddCustomField}>Ajouter</Button>
              <Button variant="outline" onClick={() => {
                setShowAddField(false);
                setNewFieldName('');
              }}>
                Annuler
              </Button>
            </div>
          </div>
        )}

        {/* Standard Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((field) => {
            const Icon = field.icon;
            const fieldValue = metadata[field.key] || '';

            return (
              <div
                key={field.key}
                className={field.fullWidth ? 'md:col-span-2' : ''}
              >
                <Label className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  {field.label}
                  {field.autoExtracted && (
                    <Badge variant="secondary" className="text-xs">
                      Auto-extrait
                    </Badge>
                  )}
                </Label>
                {field.textarea ? (
                  <Textarea
                    value={fieldValue}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    className="resize-none"
                  />
                ) : (
                  <Input
                    value={fieldValue}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Custom Fields */}
        {Object.keys(customFields).length > 0 && (
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground">Champs personnalisés</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(customFields).map(([fieldName, value]) => (
                <div key={fieldName}>
                  <Label className="mb-2 capitalize">{fieldName}</Label>
                  <Input
                    value={value}
                    onChange={(e) =>
                      setCustomFields(prev => ({ ...prev, [fieldName]: e.target.value }))
                    }
                    placeholder={`Saisir ${fieldName}`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extraction Quality Indicator */}
        {document.quality && (
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Qualité d'extraction</span>
              <Badge variant={document.quality.extraction_rate > 70 ? 'default' : 'secondary'}>
                {document.quality.extraction_rate.toFixed(0)}%
              </Badge>
            </div>
            <div className="w-full bg-background rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${document.quality.extraction_rate}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {document.quality.extracted_fields} champs sur {document.quality.total_fields} extraits
              {document.quality.llm_powered && ' • Powered by LLM'}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Sauvegarde...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Sauvegarder
              </>
            )}
          </Button>
          {!document.is_validated && (
            <Button
              onClick={handleValidate}
              variant="default"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Valider
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};