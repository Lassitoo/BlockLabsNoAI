import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Edit, Save, X, Loader2, CheckCircle, Eye, Code } from 'lucide-react';
import { toast } from 'sonner';

interface StructuredContentEditorProps {
  structuredHtml: string;
  documentId: number;
  onSave: (newHtml: string) => void;
}

export const StructuredContentEditor = ({ 
  structuredHtml, 
  documentId,
  onSave 
}: StructuredContentEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showHtmlSource, setShowHtmlSource] = useState(false);
  const [saving, setSaving] = useState(false);
  const contentEditableRef = useRef<HTMLDivElement>(null);

  const handleSave = async () => {
    if (!contentEditableRef.current) return;
    
    setSaving(true);
    try {
      const editedHtml = contentEditableRef.current.innerHTML;
      
      console.log('🔍 Tentative de sauvegarde...');
      console.log('📄 Document ID:', documentId);
      console.log('📝 Taille du contenu:', editedHtml.length, 'caractères');
      
      const response = await fetch(
        `http://localhost:8000/rawdocs/save-structured-edits/${documentId}/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            formatted_content: editedHtml,
          }),
        }
      );

      console.log('📡 Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Response data:', data);
        
        if (data.success) {
          onSave(editedHtml);
          setIsEditing(false);
          setShowHtmlSource(false);
          toast.success('Contenu structuré sauvegardé avec succès !');
        } else {
          console.error('❌ Erreur:', data.error);
          toast.error(data.error || 'Erreur lors de la sauvegarde');
        }
      } else {
        const errorText = await response.text();
        console.error('❌ Erreur HTTP:', response.status, errorText);
        toast.error(`Erreur ${response.status}: ${errorText.substring(0, 100)}`);
      }
    } catch (error) {
      console.error('❌ Error saving structured HTML:', error);
      toast.error('Erreur lors de la sauvegarde du contenu');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (contentEditableRef.current) {
      contentEditableRef.current.innerHTML = structuredHtml;
    }
    setIsEditing(false);
    setShowHtmlSource(false);
  };

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {isEditing ? (
            <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
              <Edit className="w-4 h-4" />
              <span>
                {showHtmlSource 
                  ? 'Mode HTML - Modifiez le code source' 
                  : 'Mode Édition - Cliquez pour modifier le texte'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
              <Eye className="w-4 h-4" />
              <span>Mode lecture</span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {!isEditing ? (
            <Button
              onClick={() => setIsEditing(true)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Edit className="w-4 h-4 mr-2" />
              Éditer le Contenu
            </Button>
          ) : (
            <>
              {showHtmlSource && (
                <Button
                  variant="outline"
                  onClick={() => setShowHtmlSource(false)}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Vue Normale
                </Button>
              )}
              {!showHtmlSource && (
                <Button
                  variant="outline"
                  onClick={() => setShowHtmlSource(true)}
                >
                  <Code className="w-4 h-4 mr-2" />
                  Voir HTML
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={saving}
              >
                <X className="w-4 h-4 mr-2" />
                Annuler
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sauvegarde...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Sauvegarder
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content Area */}
      {isEditing ? (
        showHtmlSource ? (
          // HTML Source View
          <textarea
            defaultValue={contentEditableRef.current?.innerHTML || structuredHtml}
            onChange={(e) => {
              if (contentEditableRef.current) {
                contentEditableRef.current.innerHTML = e.target.value;
              }
            }}
            className="w-full h-[600px] p-4 font-mono text-sm border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            placeholder="Code HTML..."
          />
        ) : (
          // ContentEditable View - WYSIWYG
          <div
            ref={contentEditableRef}
            contentEditable={true}
            suppressContentEditableWarning={true}
            dangerouslySetInnerHTML={{ __html: structuredHtml }}
            className="structured-html-view prose max-w-none"
            style={{
              padding: '20px',
              background: 'white',
              border: '2px solid #3b82f6',
              borderRadius: '8px',
              minHeight: '500px',
              maxHeight: '800px',
              overflowY: 'auto',
              outline: 'none',
              cursor: 'text'
            }}
          />
        )
      ) : (
        // Read-only View
        <div
          className="structured-html-view prose max-w-none"
          dangerouslySetInnerHTML={{ __html: structuredHtml }}
          style={{
            padding: '20px',
            background: 'white',
            border: '2px solid #e5e7eb',
            borderRadius: '8px',
            minHeight: '500px',
            maxHeight: '800px',
            overflowY: 'auto'
          }}
        />
      )}

      {/* Status Message */}
      {isEditing && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span>Modifications en cours - Cliquez sur "Sauvegarder" pour enregistrer</span>
        </div>
      )}
    </div>
  );
};
