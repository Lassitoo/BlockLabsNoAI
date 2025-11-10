// components/expert/ExpertChat.tsx
import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import {
  MessageSquare,
  Send,
  CheckCircle,
  Circle,
  Trash2,
  Edit2,
  AlertCircle,
  FileJson,
  Tag,
  Search,
  Sparkles,
  X,
  RefreshCw,
  Check
} from 'lucide-react';

interface ChatMessage {
  id: number;
  user: {
    id: number;
    username: string;
  };
  message_type: 'question' | 'answer' | 'correction' | 'suggestion' | 'note';
  content: string;
  json_path: string;
  json_data: any;
  is_resolved: boolean;
  parent_message_id: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface ExpertChatProps {
  documentId: number;
  documentTitle: string;
  jsonData?: any;
}

const MESSAGE_TYPE_COLORS = {
  question: 'bg-blue-100 text-blue-800 border-blue-300',
  answer: 'bg-green-100 text-green-800 border-green-300',
  correction: 'bg-red-100 text-red-800 border-red-300',
  suggestion: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  note: 'bg-gray-100 text-gray-800 border-gray-300'
};

const MESSAGE_TYPE_LABELS = {
  question: 'Question',
  answer: 'Réponse',
  correction: 'Correction',
  suggestion: 'Suggestion',
  note: 'Note'
};

export default function ExpertChat({ documentId, documentTitle, jsonData }: ExpertChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageType, setMessageType] = useState<'question' | 'answer' | 'correction' | 'suggestion' | 'note'>('question');
  const [jsonPath, setJsonPath] = useState('');
  const [selectedJsonData, setSelectedJsonData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [showJsonSelector, setShowJsonSelector] = useState(false);
  const [showSearchAssistant, setShowSearchAssistant] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [correctingMessageId, setCorrectingMessageId] = useState<number | null>(null);
  const [correctingResultIndex, setCorrectingResultIndex] = useState<number | null>(null);
  const [correctionValue, setCorrectionValue] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  useEffect(() => {
    fetchMessages();

    // Rafraîchir automatiquement toutes les 5 secondes pour voir les messages des autres experts
    const interval = setInterval(() => {
      fetchMessages();
    }, 5000);

    return () => clearInterval(interval);
  }, [documentId]);

  useEffect(() => {
    // Ne scroller automatiquement que si l'utilisateur est déjà en bas
    if (shouldAutoScroll) {
      scrollToBottom();
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Vérifier si l'utilisateur est en bas de la zone de messages
  const checkIfAtBottom = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // 50px de marge
      setShouldAutoScroll(isAtBottom);
    }
  };

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8000/api/expert/documents/${documentId}/chat/`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors du chargement des messages');
      }

      const data = await response.json();
      setMessages(data.messages || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`http://localhost:8000/api/expert/documents/${documentId}/chat/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message_type: messageType,
          content: newMessage,
          json_path: jsonPath,
          json_data: selectedJsonData || {},
          tags: []
        }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'envoi du message');
      }

      const data = await response.json();
      setMessages([...messages, data.message]);
      setNewMessage('');
      setJsonPath('');
      setSelectedJsonData(null);
      setShowJsonSelector(false);
      setCorrectingMessageId(null);
      // Forcer le scroll vers le bas après l'envoi d'un message
      setShouldAutoScroll(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce message ?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/api/expert/chat/${messageId}/`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression');
      }

      setMessages(messages.filter(m => m.id !== messageId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleResolved = async (messageId: number) => {
    try {
      const response = await fetch(`http://localhost:8000/api/expert/chat/${messageId}/resolve/`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour');
      }

      const data = await response.json();
      setMessages(messages.map(m =>
        m.id === messageId ? { ...m, is_resolved: data.is_resolved } : m
      ));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const extractJsonPath = (path: string) => {
    if (!jsonData || !path) return null;

    try {
      const parts = path.split('.');
      let current = jsonData;

      for (const part of parts) {
        const arrayMatch = part.match(/(.+)\[(\d+)\]/);
        if (arrayMatch) {
          const [, key, index] = arrayMatch;
          current = current[key]?.[parseInt(index)];
        } else {
          current = current[part];
        }

        if (current === undefined) return null;
      }

      return current;
    } catch {
      return null;
    }
  };

  const handleSearchInJson = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    try {
      setSearchLoading(true);

      // Utiliser le nouveau endpoint intelligent Q&A
      const response = await fetch(`http://localhost:8000/api/expert/documents/${documentId}/ask/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: searchQuery
        }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la recherche');
      }

      const data = await response.json();

      // Si c'est une réponse directe (pas une action de relation)
      if (data.success && data.answer) {
        // Créer un résultat formaté pour l'affichage
        const result = {
          type: data.source || 'answer',
          text: data.answer,
          json_path: data.json_path || '',
          data: data.json_data || {},
          confidence: data.confidence || 0,
          needs_validation: data.needs_validation || false,
          qa_id: data.qa_id,
          // Pour les relations
          action: data.action,
          suggestions: data.suggestions,
          relations: data.relations
        };

        // Si c'est une action de relation, afficher les suggestions
        if (data.action && data.action.includes('relation')) {
          setSearchResults([{
            type: 'relation_action',
            text: data.answer,
            action: data.action,
            suggestions: data.suggestions,
            relations: data.relations,
            json_path: 'Relations',
            data: data
          }]);
        } else {
          // Réponse normale
          setSearchResults([result]);
        }
      } else {
        // Fallback vers l'ancien endpoint si le nouveau ne fonctionne pas
        const fallbackResponse = await fetch(`http://localhost:8000/api/expert/documents/${documentId}/search-json/`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: searchQuery
          }),
        });

        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          setSearchResults(fallbackData.results || []);
        } else {
          setSearchResults([]);
        }
      }
    } catch (err: any) {
      setError(err.message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleUseSearchResult = (result: any) => {
    setJsonPath(result.json_path);
    setSelectedJsonData(result.data);
    setShowSearchAssistant(false);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleStartCorrection = (resultIndex: number, currentAnswer: string) => {
    setCorrectingResultIndex(resultIndex);
    setCorrectionValue(currentAnswer);
  };

  const handleCancelCorrection = () => {
    setCorrectingResultIndex(null);
    setCorrectionValue('');
  };

  const handleSaveCorrection = async (resultIndex: number) => {
    if (!correctionValue.trim()) {
      alert('La correction ne peut pas être vide');
      return;
    }

    setSavingCorrection(true);
    try {
      const result = searchResults[resultIndex];

      // Appeler l'API pour sauvegarder la correction
      const response = await fetch('http://localhost:8000/api/expert/qa/correct/', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_id: documentId,
          question: searchQuery,
          original_answer: result.text,
          corrected_answer: correctionValue,
          json_path: result.json_path,
          source_type: result.type,
        }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la sauvegarde de la correction');
      }

      const data = await response.json();

      // Mettre à jour les résultats localement
      const updatedResults = [...searchResults];
      updatedResults[resultIndex] = {
        ...updatedResults[resultIndex],
        text: correctionValue,
        type: 'validated_qa',
        confidence: 1.0,
        needs_validation: false,
      };
      setSearchResults(updatedResults);

      // Réinitialiser l'état de correction
      setCorrectingResultIndex(null);
      setCorrectionValue('');

      alert('✅ Correction sauvegardée et JSON mis à jour !');

      // Notifier le parent pour recharger le JSON
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      setError(err.message);
      alert('❌ Erreur: ' + err.message);
    } finally {
      setSavingCorrection(false);
    }
  };

  const handleCorrectMessage = (message: ChatMessage) => {
    // Préparer une correction en référence au message original
    setMessageType('correction');
    setNewMessage(`Correction du message de ${message.user.username}:\n\n`);
    if (message.json_path) {
      setJsonPath(message.json_path);
      setSelectedJsonData(message.json_data);
      setShowJsonSelector(true);
    }
    setCorrectingMessageId(message.id);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className="h-full flex flex-col max-h-[700px]">
      <CardHeader className="border-b flex-shrink-0 bg-gradient-to-r from-blue-50 to-green-50">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          Chat Expert (Sans IA) - {documentTitle}
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          💬 <strong>Discussion collaborative</strong> : Posez des questions, l&apos;assistant cherche dans les entités et relations validées du JSON
        </p>
        <p className="text-xs text-blue-600 mt-1 font-medium">
          🔍 L&apos;assistant répond UNIQUEMENT avec les données validées (pas d&apos;IA, pas d&apos;invention)
        </p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages List */}
        <div
          ref={messagesContainerRef}
          onScroll={checkIfAtBottom}
          className="flex-1 overflow-y-auto p-4 space-y-4"
        >
          {loading && messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              Chargement des messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Aucun message. Commencez la discussion !</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`p-4 rounded-lg border ${
                  message.is_resolved ? 'opacity-60' : ''
                } ${MESSAGE_TYPE_COLORS[message.message_type]}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {MESSAGE_TYPE_LABELS[message.message_type]}
                    </Badge>
                    <span className="text-sm font-semibold">
                      {message.user.username}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(message.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCorrectMessage(message)}
                      className="h-6 w-6 p-0 text-orange-600 hover:text-orange-700"
                      title="Corriger ce message"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleResolved(message.id)}
                      className="h-6 w-6 p-0"
                      title={message.is_resolved ? "Marquer non résolu" : "Marquer résolu"}
                    >
                      {message.is_resolved ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteMessage(message.id)}
                      className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <p className="text-sm mb-2 whitespace-pre-wrap">{message.content}</p>

                {message.json_path && (
                  <div className="mt-2 p-2 bg-white/50 rounded border border-dashed">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <FileJson className="w-3 h-3" />
                      <span className="font-mono">{message.json_path}</span>
                    </div>
                    {message.json_data && Object.keys(message.json_data).length > 0 && (
                      <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                        {JSON.stringify(message.json_data, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="m-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Assistant de Recherche */}
        {showSearchAssistant && (
          <div className="flex-shrink-0 m-4 p-4 border-2 border-blue-300 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg flex items-center gap-2 text-blue-800">
                <Sparkles className="w-6 h-6 text-blue-600" />
                Assistant de Recherche (Sans IA)
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowSearchAssistant(false);
                  setSearchResults([]);
                  setSearchQuery('');
                }}
                className="h-8 w-8 p-0 hover:bg-blue-100"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <Alert className="mb-3 bg-white border-blue-200">
              <AlertDescription className="text-sm">
                <p className="font-semibold text-blue-900 mb-2">🎯 L&apos;assistant recherche dans :</p>
                <ul className="space-y-1 text-xs text-blue-800 ml-4">
                  <li>✅ <strong>Q&A Validées</strong> - Réponses validées par les experts (confiance 100%)</li>
                  <li>📦 <strong>Entités JSON</strong> - Dosage, Ingrédients, Produits... (confiance 80%)</li>
                  <li>🔗 <strong>Relations JSON</strong> - Liens entre entités validées (confiance 90%)</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="mb-3 p-3 bg-white rounded-lg border border-blue-200">
              <p className="text-xs font-semibold text-blue-900 mb-2">💡 Exemples de questions :</p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-blue-100 text-xs"
                  onClick={() => setSearchQuery("donnes les dosages")}
                >
                  donnes les dosages
                </Badge>
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-blue-100 text-xs"
                  onClick={() => setSearchQuery("liste les ingrédients")}
                >
                  liste les ingrédients
                </Badge>
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-blue-100 text-xs"
                  onClick={() => setSearchQuery("quel est le dosage du produit X")}
                >
                  quel est le dosage du produit X
                </Badge>
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-blue-100 text-xs"
                  onClick={() => setSearchQuery("quels sont les rôles")}
                >
                  quels sont les rôles
                </Badge>
              </div>
            </div>

            <div className="flex gap-2 mb-3">
              <Input
                placeholder="Posez votre question ici..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearchInJson();
                  }
                }}
                className="border-blue-300 focus:ring-blue-500"
              />
              <Button
                onClick={handleSearchInJson}
                disabled={searchLoading || !searchQuery.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Search className="w-4 h-4 mr-2" />
                Chercher
              </Button>
            </div>

            {/* Résultats de recherche */}
            {searchLoading && (
              <div className="text-center py-6 bg-white rounded-lg border border-blue-200">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-sm text-blue-700 font-medium">Recherche en cours dans le JSON validé...</p>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                <div className="flex items-center justify-between sticky top-0 bg-gradient-to-br from-blue-50 to-indigo-50 pb-2">
                  <p className="text-sm font-bold text-blue-900 flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    Réponse de l&apos;assistant :
                  </p>
                  <Badge variant="outline" className="bg-white">
                    {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''}
                  </Badge>
                </div>
                {searchResults.map((result, idx) => (
                  <div
                    key={idx}
                    className={`p-4 bg-white border-2 rounded-lg shadow-sm ${
                      result.type === 'validated_qa' ? 'border-green-300 bg-green-50/30' :
                      result.type === 'json_entity' ? 'border-blue-300 bg-blue-50/30' :
                      result.type === 'json_relation' || result.type === 'relation_json' ? 'border-purple-300 bg-purple-50/30' :
                      result.type === 'not_found' ? 'border-red-300 bg-red-50/30' :
                      'border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-xs font-semibold ${
                              result.type === 'validated_qa' ? 'bg-green-100 text-green-800 border-green-400' :
                              result.type === 'json_entity' ? 'bg-blue-100 text-blue-800 border-blue-400' :
                              result.type === 'json_relation' || result.type === 'relation_json' ? 'bg-purple-100 text-purple-800 border-purple-400' :
                              result.type === 'not_found' ? 'bg-red-100 text-red-800 border-red-400' :
                              'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {result.type === 'validated_qa'
                              ? '✅ Q&A Validée'
                              : result.type === 'json_entity'
                              ? '📦 Entité JSON'
                              : result.type === 'json_relation' || result.type === 'relation_json'
                              ? '🔗 Relation JSON'
                              : result.type === 'relation_action'
                              ? '⚙️ Action Relation'
                              : result.type === 'not_found'
                              ? '❌ Non trouvé'
                              : '📄 Trouvé dans JSON'}
                          </Badge>
                          {result.confidence !== undefined && result.confidence > 0 && (
                            <Badge
                              variant={result.confidence >= 0.8 ? 'default' : 'secondary'}
                              className={`text-xs ${
                                result.confidence >= 0.8 ? 'bg-green-600' : 'bg-yellow-600'
                              } text-white`}
                            >
                              Confiance: {Math.round(result.confidence * 100)}%
                            </Badge>
                          )}
                          {result.needs_validation && (
                            <Badge variant="destructive" className="text-xs">
                              ⚠️ À valider par expert
                            </Badge>
                          )}
                          {result.type === 'validated_qa' && !result.needs_validation && (
                            <Badge variant="default" className="text-xs bg-green-600">
                              ✓ Vérifié par expert
                            </Badge>
                          )}
                        </div>

                        {result.text && (
                          <>
                            {correctingResultIndex === idx ? (
                              <div className="p-3 bg-yellow-50 rounded-lg border-2 border-yellow-400 mb-2">
                                <p className="text-xs font-semibold text-yellow-900 mb-2">✏️ Mode correction :</p>
                                <Textarea
                                  value={correctionValue}
                                  onChange={(e) => setCorrectionValue(e.target.value)}
                                  className="mb-2 min-h-[100px]"
                                  placeholder="Entrez la correction..."
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveCorrection(idx)}
                                    disabled={savingCorrection}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    {savingCorrection ? (
                                      <>
                                        <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                        Sauvegarde...
                                      </>
                                    ) : (
                                      <>
                                        <Check className="w-3 h-3 mr-1" />
                                        Sauvegarder
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleCancelCorrection}
                                    disabled={savingCorrection}
                                  >
                                    <X className="w-3 h-3 mr-1" />
                                    Annuler
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 bg-white rounded-lg border border-gray-200 mb-2">
                                <p className="text-sm font-medium text-gray-900 whitespace-pre-wrap">
                                  {result.text}
                                </p>
                              </div>
                            )}
                          </>
                        )}

                        {result.type === 'relation' && (
                          <p className="text-sm font-medium">
                            {result.source} → {result.target}
                          </p>
                        )}

                        {result.json_path && (
                          <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
                            <p className="text-xs text-gray-600 font-mono flex items-center gap-1">
                              📍 <span className="font-semibold">Chemin JSON:</span> {result.json_path}
                            </p>
                          </div>
                        )}

                        {/* Afficher les suggestions pour les actions de relation */}
                        {result.action && result.suggestions && (
                          <div className="mt-3 p-3 bg-blue-100 rounded-lg border border-blue-300 text-xs">
                            <p className="font-bold text-blue-900 mb-2 flex items-center gap-1">
                              💡 Suggestion :
                            </p>
                            <p className="text-blue-800">{result.suggestions.message || 'Action disponible'}</p>
                            {result.suggestions.suggested_relationship_name && (
                              <p className="mt-2 text-blue-900">
                                Type suggéré : <span className="font-mono font-semibold">{result.suggestions.suggested_relationship_name}</span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {!result.action && result.type !== 'not_found' && correctingResultIndex !== idx && (
                        <div className="ml-2 flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStartCorrection(idx, result.text || '')}
                            className="border-orange-300 hover:bg-orange-50 text-orange-700"
                          >
                            <Edit2 className="w-3 h-3 mr-1" />
                            Corriger
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUseSearchResult(result)}
                            className="border-blue-300 hover:bg-blue-50"
                          >
                            <FileJson className="w-3 h-3 mr-1" />
                            Utiliser
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Bouton Corriger en bas pour mobile/petit écran */}
                    {correctingResultIndex !== idx && result.type !== 'not_found' && !result.action && (
                      <div className="mt-3 pt-3 border-t border-gray-200 flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStartCorrection(idx, result.text || '')}
                          className="border-orange-300 hover:bg-orange-50 text-orange-700"
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Corriger cette réponse
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {searchResults.length === 0 && searchQuery && !searchLoading && (
              <Alert variant="destructive" className="bg-red-50 border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <AlertDescription className="text-sm text-red-800">
                  <p className="font-semibold mb-1">Aucun résultat trouvé pour &quot;{searchQuery}&quot;</p>
                  <p className="text-xs">Essayez de reformuler votre question ou vérifiez que les données sont validées dans le JSON.</p>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Message Input */}
        <div className="flex-shrink-0 border-t p-4 space-y-3 bg-white">
          {/* Type de message */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-700">Type de message :</p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(MESSAGE_TYPE_LABELS).map(([type, label]) => (
                <Button
                  key={type}
                  variant={messageType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMessageType(type as any)}
                  className={messageType === type ? 'shadow-md' : ''}
                >
                  {type === 'question' && '❓ '}
                  {type === 'answer' && '✅ '}
                  {type === 'correction' && '✏️ '}
                  {type === 'suggestion' && '💡 '}
                  {type === 'note' && '📝 '}
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* JSON Path (optionnel) */}
          {showJsonSelector && (
            <div className="space-y-2">
              <Input
                placeholder="Chemin JSON (ex: entities.Product[0].name)"
                value={jsonPath}
                onChange={(e) => setJsonPath(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const data = extractJsonPath(jsonPath);
                  if (data) {
                    setSelectedJsonData(data);
                  }
                }}
              >
                <FileJson className="w-4 h-4 mr-2" />
                Extraire les données JSON
              </Button>
            </div>
          )}

          {/* Toggle JSON Selector et Assistant */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={showJsonSelector ? "default" : "outline"}
              size="sm"
              onClick={() => setShowJsonSelector(!showJsonSelector)}
              className={showJsonSelector ? "bg-orange-600 hover:bg-orange-700" : ""}
            >
              <Tag className="w-4 h-4 mr-2" />
              {showJsonSelector ? '✓ JSON référencé' : 'Référencer le JSON'}
            </Button>

            <Button
              variant={showSearchAssistant ? "default" : "outline"}
              size="sm"
              onClick={() => setShowSearchAssistant(!showSearchAssistant)}
              className={showSearchAssistant ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-50 border-blue-300 hover:bg-blue-100 text-blue-700"}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {showSearchAssistant ? '✓ Assistant ouvert' : '🔍 Ouvrir l\'Assistant de Recherche'}
            </Button>
          </div>

          {/* Indicateur de correction */}
          {correctingMessageId && (
            <Alert className="bg-orange-50 border-orange-200">
              <AlertDescription className="flex items-center justify-between">
                <span className="text-sm">
                  ✏️ Mode correction activé
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCorrectingMessageId(null);
                    setNewMessage('');
                    setJsonPath('');
                    setSelectedJsonData(null);
                  }}
                >
                  Annuler
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Message Text */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Tapez votre message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="flex-1 min-h-[60px]"
            />
            <Button
              onClick={handleSendMessage}
              disabled={loading || !newMessage.trim()}
              className="h-full"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Appuyez sur <kbd className="px-1 bg-gray-100 rounded">Entrée</kbd> pour envoyer,{' '}
            <kbd className="px-1 bg-gray-100 rounded">Shift+Entrée</kbd> pour nouvelle ligne
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
