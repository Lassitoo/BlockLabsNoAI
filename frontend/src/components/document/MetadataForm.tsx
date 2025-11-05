import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  Check,
  AlertCircle,
} from 'lucide-react';

// ========================================
// INTERFACES
// ========================================

interface MetadataFormProps {
  document: RawDocument;
  onUpdate?: (updatedDoc: RawDocument) => void;
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

// ========================================
// COMPOSANT PRINCIPAL
// ========================================

export const MetadataForm = ({ document, onUpdate }: MetadataFormProps) => {
  const router = useRouter();

  // ========================================
  // STATE
  // ========================================

  const [metadata, setMetadata] = useState<DocumentMetadata>(document.metadata);
  const [isSaving, setIsSaving] = useState(false);
  const [isReextracting, setIsReextracting] = useState(false);
  const [customFields, setCustomFields] = useState<Record<string, string>>(document.custom_fields || {});
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // ========================================
  // EFFECTS
  // ========================================

  // Recharger les metadonnees et custom fields quand le document change
  useEffect(() => {
    console.log('Document props changed, updating local state');
    console.log('New metadata:', document.metadata);
    console.log('New custom fields:', document.custom_fields);
    setMetadata(document.metadata);
    setCustomFields(document.custom_fields || {});
    setSaveStatus('idle');
    setHasChanges(false);
  }, [document.id, document.metadata, document.custom_fields]);


  // Détecter les changements
  useEffect(() => {
    const metadataChanged = JSON.stringify(metadata) !== JSON.stringify(document.metadata);

    const docCustom = document.custom_fields || {};
    let customChanged = false;

    // Vérifier les champs existants (changement même si vide)
    for (const [key, value] of Object.entries(docCustom)) {
      if (customFields[key] !== value) {
        customChanged = true;
        break;
      }
    }

    // Vérifier les nouveaux champs (seulement si valeur non vide)
    for (const [key, value] of Object.entries(customFields)) {
      if (!(key in docCustom) && value.trim() !== '') {
        customChanged = true;
        break;
      }
    }

    const changed = metadataChanged || customChanged;

    console.log('Change detection:', {
      metadataChanged,
      customChanged,
      hasChanges: changed,
      currentCustomFields: customFields,
      documentCustomFields: document.custom_fields || {}
    });

    setHasChanges(changed);
  }, [
    metadata,
    document.metadata,
    customFields,
    document.custom_fields
  ]);

  // ========================================
  // HANDLERS
  // ========================================

  const handleFieldChange = (field: keyof DocumentMetadata, value: string) => {
    console.log(`Field modified: ${field} = "${value}"`);
    setMetadata(prev => ({ ...prev, [field]: value }));
  };

  const handleCustomFieldChange = (fieldName: string, value: string) => {
    console.log(`Custom field modified: ${fieldName} = "${value}"`);
    setCustomFields(prev => ({ ...prev, [fieldName]: value }));
  };

  const handleSave = async () => {
    if (!hasChanges) {
      toast.info('Aucune modification à sauvegarder');
      return;
    }

    console.group('Sauvegarde des métadonnées + custom fields');
    console.log('Document ID:', document.id);
    console.log('Métadonnées standards:', metadata);
    console.log('Custom fields:', Object.entries(customFields).map(([k, v]) => ({ name: k, value: v })));

    setIsSaving(true);
    setSaveStatus('saving');

    try {
      const payload = {
        ...metadata,
        custom_fields: Object.entries(customFields).map(([name, value]) => ({
          name,
          value: value.trim()
        }))
      };

      const updatedDocument = await documentService.updateMetadata(document.id, payload);

      toast.success('Sauvegarde réussie !', {
        description: 'Métadonnées et champs personnalisés enregistrés',
      });

      setHasChanges(false);
      setLastSaved(new Date());
      setSaveStatus('success');

      if (onUpdate) onUpdate(updatedDocument);

    } catch (error: any) {
      console.error('Échec sauvegarde :', error);
      toast.error('Échec de la sauvegarde', {
        description: error.response?.data?.error || 'Erreur inconnue',
      });
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
      console.groupEnd();
    }
  };
  const handleReextract = async () => {
    console.group('REEXTRACTION DES METADONNEES');
    console.log('Document ID:', document.id);

    setIsReextracting(true);

    try {
      const loadingToast = toast.loading('Reextraction en cours...');

      const newMetadata = await documentService.reextractMetadata(document.id);

      console.log('New metadata extracted:', newMetadata);

      toast.dismiss(loadingToast);

      setMetadata(newMetadata);
      setHasChanges(false);

      const freshDocument = await documentService.getDocument(document.id, true);
      if (onUpdate) {
        onUpdate(freshDocument);
      }

      toast.success('Metadonnees reextraites', {
        description: 'Les metadonnees ont ete mises a jour avec succes',
        duration: 3000,
      });

    } catch (error: any) {
      console.error('REEXTRACTION ERROR:', error);

      const errorMessage = error.response?.data?.error || 'Erreur lors de la reextraction';
      toast.error('Echec de la reextraction', {
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setIsReextracting(false);
      console.groupEnd();
    }
  };

  const handleValidate = async () => {
    console.group('VALIDATION DU DOCUMENT');
    console.log('Document ID:', document.id);

    try {
      const loadingToast = toast.loading('Validation en cours...');

      await documentService.validateDocument(document.id);

      console.log('Document validated successfully');

      toast.dismiss(loadingToast);

      toast.success('Document validé !', {
        description: 'Redirection vers le tableau de bord...',
        duration: 2000,
      });

      // Rediriger vers le dashboard après 1 seconde
      setTimeout(() => {
        router.push('/document-manager');
      }, 1000);

    } catch (error: any) {
      console.error('VALIDATION ERROR:', error);

      // Vérifier si c'est une erreur réseau
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        toast.error('Erreur de connexion', {
          description: 'Impossible de se connecter au serveur. Vérifiez que le serveur Django est démarré sur http://localhost:8000',
          duration: 5000,
        });
      } else {
        const errorMessage = error.response?.data?.error || 'Erreur lors de la validation';
        toast.error('Echec de la validation', {
          description: errorMessage,
          duration: 5000,
        });
      }
    } finally {
      console.groupEnd();
    }
  };
  // Dans handleAddCustomField()
  const handleAddCustomField = () => {
    const trimmedName = newFieldName.trim();
    if (!trimmedName) return;

    // Vérifie si le champ existe déjà
    if (customFields[trimmedName]) {
      toast.error('Champ déjà existant', {
        description: `Le champ "${trimmedName}" existe déjà.`,
      });
      return;
    }

    console.log('Adding custom field:', trimmedName);
    setCustomFields(prev => ({ ...prev, [trimmedName]: '' }));
    setNewFieldName('');
    setShowAddField(false);

    // Message clair et immédiat
    toast.success('Champ ajouté', {
      description: `"${trimmedName}" est prêt à être rempli. Saisissez une valeur pour activer la sauvegarde.`,
      duration: 4000,
    });
  };

  // ========================================
  // CONFIGURATION DES CHAMPS
  // ========================================

  const fields = [
    {
      key: 'title' as keyof DocumentMetadata,
      label: 'Titre du document',
      icon: Heading,
      placeholder: 'Titre du document',
      autoExtracted: !!document.metadata.title,
    },
    {
      key: 'type' as keyof DocumentMetadata,
      label: 'Type de document',
      icon: FileType,
      placeholder: 'Type de document',
      autoExtracted: !!document.metadata.type,
    },
    {
      key: 'publication_date' as keyof DocumentMetadata,
      label: 'Date de publication',
      icon: Calendar,
      placeholder: 'Ex: 23 January 2025',
      autoExtracted: !!document.metadata.publication_date,
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
      autoExtracted: !!document.metadata.language,
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
      autoExtracted: !!document.metadata.context,
      fullWidth: true,
      textarea: true,
    },
  ];

  // ========================================
  // RENDER
  // ========================================

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileType className="w-5 h-5" />
            Editer les metadonnees
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
                  Reextraction...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reextraire
                </>
              )}
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

        {/* STATUS ALERTS */}
        {saveStatus === 'success' && (
          <Alert className="border-2">
            <Check className="h-4 w-4" />
            <AlertDescription>
              Modifications sauvegardees avec succes a {lastSaved?.toLocaleTimeString()}
            </AlertDescription>
          </Alert>
        )}

        {saveStatus === 'error' && (
          <Alert className="border-2" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Erreur lors de la sauvegarde. Veuillez reessayer.
            </AlertDescription>
          </Alert>
        )}

        {/* ADD CUSTOM FIELD DIALOG */}
        {showAddField && (
          <div className="p-4 border rounded-lg space-y-3">
            <Label>Nom du nouveau champ</Label>
            <div className="flex gap-2">
              <Input
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="Ex: Produit, Dosage, etc."
                onKeyPress={(e) => e.key === 'Enter' && handleAddCustomField()}
              />
              <Button onClick={handleAddCustomField}>
                Ajouter
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddField(false);
                  setNewFieldName('');
                }}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}

        {/* STANDARD FIELDS */}
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

        {/* CUSTOM FIELDS */}
        {Object.keys(customFields).length > 0 && (
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Champs personnalises
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(customFields).map(([fieldName, value]) => (
                <div key={fieldName}>
                  <Label className="mb-2 capitalize">{fieldName}</Label>
                  <Input
                    value={value}
                    onChange={(e) => handleCustomFieldChange(fieldName, e.target.value)}
                    placeholder={`Saisir ${fieldName}`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="flex justify-between items-center pt-4 border-t">



          {/* ACTION BUTTONS */}
          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              variant={hasChanges ? "default" : "outline"}
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
        </div>

      </CardContent>
    </Card>
  );
};