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
  Check,
  ChevronDown,
  MessageCircle,
  Zap,
  Filter,
  ChevronUp
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
  json_data: Record<string, unknown>;
  is_resolved: boolean;
  parent_message_id: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface SearchResult {
  type: string;
  text?: string;
  json_path: string;
  data: Record<string, unknown>;
  confidence?: number;
  needs_validation?: boolean;
  qa_id?: number;
  action?: string;
  suggestions?: {
    message?: string;
    suggested_relationship_name?: string;
  };
  relations?: unknown;
  source?: string;
  target?: string;
}

interface ExpertChatProps {
  documentId: number;
  documentTitle: string;
  jsonData?: Record<string, unknown>;
  onJsonUpdated?: () => void;
}

const MESSAGE_TYPE_CONFIG = {
  question: {
    colors: 'bg-blue-50 border-blue-200',
    badge: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: '❓',
    label: 'Question'
  },
  answer: {
    colors: 'bg-green-50 border-green-200',
    badge: 'bg-green-100 text-green-800 border-green-300',
    icon: '✅',
    label: 'Réponse'
  },
  correction: {
    colors: 'bg-orange-50 border-orange-200',
    badge: 'bg-orange-100 text-orange-800 border-orange-300',
    icon: '✏️',
    label: 'Correction'
  },
  suggestion: {
    colors: 'bg-amber-50 border-amber-200',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: '💡',
    label: 'Suggestion'
  },
  note: {
    colors: 'bg-slate-50 border-slate-200',
    badge: 'bg-slate-100 text-slate-800 border-slate-300',
    icon: '📝',
    label: 'Note'
  }
};

export default function ExpertChat({ documentId, documentTitle, jsonData, onJsonUpdated }: ExpertChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageType, setMessageType] = useState<'question' | 'answer' | 'correction' | 'suggestion' | 'note'>('question');
  const [jsonPath, setJsonPath] = useState('');
  const [selectedJsonData, setSelectedJsonData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [showJsonSelector, setShowJsonSelector] = useState(false);
  const [showSearchAssistant, setShowSearchAssistant] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [correctingMessageId, setCorrectingMessageId] = useState<number | null>(null);
  const [correctingResultIndex, setCorrectingResultIndex] = useState<number | null>(null);
  const [correctionValue, setCorrectionValue] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [showOnlyUnresolved, setShowOnlyUnresolved] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());
  const [editingJsonData, setEditingJsonData] = useState<string>('');
  const [showJsonEditor, setShowJsonEditor] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const correctionFormRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(() => {
      fetchMessages();
    }, 5000);
    return () => clearInterval(interval);
  }, [documentId]);

  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom();
    }
  }, [messages]);

  useEffect(() => {
    if (correctingResultIndex !== null && correctionFormRef.current) {
      setShouldAutoScroll(false);
      setTimeout(() => {
        if (correctionFormRef.current) {
          correctionFormRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }, 200);
    }
  }, [correctingResultIndex]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const checkIfAtBottom = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      setShouldAutoScroll(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleMessageExpanded = (messageId: number) => {
    const newExpanded = new Set(expandedMessages);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
    }
    setExpandedMessages(newExpanded);
  };

  const handleSaveJsonEdit = async () => {
    try {
      const parsedData = JSON.parse(editingJsonData);
      setSelectedJsonData(parsedData);

      // Envoyer la mise à jour au serveur
      if (jsonPath && documentId) {
        const response = await fetch(`http://localhost:8000/api/expert/documents/${documentId}/update-json/`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            json_path: jsonPath,
            json_data: parsedData,
          }),
        });

        if (response.ok) {
          alert('✅ JSON mis à jour avec succès ! Les modifications sont enregistrées.');
          // Rafraîchir le JSON dans la page parente
          if (onJsonUpdated) {
            onJsonUpdated();
          }

          // Envoyer automatiquement la note de modification comme message dans le chat si elle existe
          if (newMessage.trim()) {
            await handleSendMessage();
          }

          // Réinitialiser le mode correction
          setCorrectingMessageId(null);
          setShowJsonEditor(false);
        } else {
          const errorData = await response.json();
          alert(`❌ Erreur lors de la mise à jour: ${errorData.error || 'Erreur inconnue'}`);
        }
      } else {
        alert('✅ JSON validé localement. N\'oubliez pas d\'envoyer votre message de correction.');
      }
    } catch (error) {
      alert('❌ Erreur: JSON invalide. Vérifiez la syntaxe.');
    }
  };

  const extractJsonPath = (path: string): Record<string, unknown> | null => {
    if (!jsonData || !path) return null;

    try {
      const parts = path.split('.');
      let current: unknown = jsonData;

      for (const part of parts) {
        const arrayMatch = part.match(/(.+)\[(\d+)\]/);
        if (arrayMatch) {
          const [, key, index] = arrayMatch;
          if (current && typeof current === 'object' && key in current) {
            const obj = current as Record<string, unknown>;
            const arr = obj[key];
            if (Array.isArray(arr)) {
              current = arr[parseInt(index)];
            } else {
              return null;
            }
          } else {
            return null;
          }
        } else {
          if (current && typeof current === 'object' && part in current) {
            current = (current as Record<string, unknown>)[part];
          } else {
            return null;
          }
        }

        if (current === undefined) return null;
      }

      return current as Record<string, unknown>;
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

      if (data.success && data.answer) {
        const result = {
          type: data.source || 'answer',
          text: data.answer,
          json_path: data.json_path || '',
          data: data.json_data || {},
          confidence: data.confidence || 0,
          needs_validation: data.needs_validation || false,
          qa_id: data.qa_id,
          action: data.action,
          suggestions: data.suggestions,
          relations: data.relations
        };

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
          setSearchResults([result]);
        }
      } else {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleUseSearchResult = (result: SearchResult) => {
    setJsonPath(result.json_path);
    setSelectedJsonData(result.data);
    setShowSearchAssistant(false);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleStartCorrection = (resultIndex: number, currentAnswer: string) => {
    setCorrectingResultIndex(resultIndex);
    setCorrectionValue(currentAnswer);
    // Préparer le JSON pour édition
    const result = searchResults[resultIndex];
    if (result.data && Object.keys(result.data).length > 0) {
      setEditingJsonData(JSON.stringify(result.data, null, 2));
      setShowJsonEditor(true);
    }
  };

  const handleCancelCorrection = () => {
    setCorrectingResultIndex(null);
    setCorrectionValue('');
    setEditingJsonData('');
    setShowJsonEditor(false);
  };

  const handleSaveCorrection = async (resultIndex: number) => {
    if (!correctionValue.trim()) {
      alert('La correction ne peut pas être vide');
      return;
    }

    setSavingCorrection(true);
    try {
      const result = searchResults[resultIndex];

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

      const updatedResults = [...searchResults];
      updatedResults[resultIndex] = {
        ...updatedResults[resultIndex],
        text: correctionValue,
        type: 'validated_qa',
        confidence: 1.0,
        needs_validation: false,
      };
      setSearchResults(updatedResults);

      setCorrectingResultIndex(null);
      setCorrectionValue('');

      alert('✅ Correction sauvegardée et JSON mis à jour !');

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      alert('❌ Erreur: ' + errorMessage);
    } finally {
      setSavingCorrection(false);
    }
  };

  const handleCorrectMessage = (message: ChatMessage) => {
    setMessageType('correction');
    setNewMessage(`Correction du message de ${message.user.username}:\n\n`);
    if (message.json_path) {
      setJsonPath(message.json_path);

      // Extraire les données JSON depuis le chemin si elles ne sont pas déjà fournies
      const jsonDataToEdit = message.json_data && Object.keys(message.json_data).length > 0
        ? message.json_data
        : extractJsonPath(message.json_path);

      setSelectedJsonData(jsonDataToEdit || {});
      setShowJsonSelector(true);

      // Rendre le JSON éditable avec les données extraites
      if (jsonDataToEdit) {
        setEditingJsonData(JSON.stringify(jsonDataToEdit, null, 2));
        setShowJsonEditor(true);
      }
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

  const getFilteredMessages = () => {
    let filtered = messages;

    if (filterType) {
      filtered = filtered.filter(m => m.message_type === filterType);
    }

    if (showOnlyUnresolved) {
      filtered = filtered.filter(m => !m.is_resolved);
    }

    return filtered;
  };

  const filteredMessages = getFilteredMessages();
  const messageStats = {
    total: messages.length,
    resolved: messages.filter(m => m.is_resolved).length,
    unresolved: messages.filter(m => !m.is_resolved).length,
  };

  return (
    <Card className="h-full flex flex-col max-h-[900px] shadow-lg border-0">
      {/* Header amélioré */}
      <CardHeader className="border-b bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white flex-shrink-0 rounded-t-lg">
        <div className="flex items-center justify-between mb-3">
          <CardTitle className="flex items-center gap-3 text-xl">
            <MessageSquare className="w-6 h-6" />
            Expert Chat Avancé
          </CardTitle>
          <Badge variant="outline" className="bg-white/20 text-white border-white/30 px-3 py-1">
            {messageStats.unresolved} non résolu{messageStats.unresolved > 1 ? 's' : ''}
          </Badge>
        </div>
        <p className="text-sm text-white/90 font-medium">{documentTitle}</p>
        <div className="flex gap-4 mt-2 text-xs text-white/80">
          <span>📊 Total: {messageStats.total}</span>
          <span>✅ Résolu: {messageStats.resolved}</span>
          <span>⏳ Non résolu: {messageStats.unresolved}</span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Barre de filtres */}
        <div className="flex-shrink-0 border-b bg-gradient-to-r from-slate-50 to-blue-50 p-3 flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-slate-600" />
          <Button
            variant={filterType === null ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType(null)}
            className="text-xs"
          >
            Tous
          </Button>
          {Object.entries(MESSAGE_TYPE_CONFIG).map(([type, config]) => (
            <Button
              key={type}
              variant={filterType === type ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType(filterType === type ? null : type)}
              className="text-xs"
            >
              {config.icon} {config.label}
            </Button>
          ))}
          <div className="flex-1" />
          <Button
            variant={showOnlyUnresolved ? "default" : "outline"}
            size="sm"
            onClick={() => setShowOnlyUnresolved(!showOnlyUnresolved)}
            className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
          >
            {showOnlyUnresolved ? '✓' : ''} Non résolu{showOnlyUnresolved ? 's' : ''}
          </Button>
        </div>

        {/* Liste des messages */}
        <div
          ref={messagesContainerRef}
          onScroll={checkIfAtBottom}
          className="flex-1 overflow-y-auto p-4 space-y-3"
        >
          {loading && messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-blue-600" />
                <p className="text-sm text-slate-600 font-medium">Chargement des messages...</p>
              </div>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
                <p className="text-slate-600 font-medium">Aucun message</p>
                <p className="text-xs text-slate-500 mt-1">Commencez la discussion !</p>
              </div>
            </div>
          ) : (
            filteredMessages.map((message) => {
              const isExpanded = expandedMessages.has(message.id);
              const config = MESSAGE_TYPE_CONFIG[message.message_type];
              const isLongContent = message.content.length > 150;

              return (
                <div
                  key={message.id}
                  className={`p-4 rounded-lg border-2 transition-all hover:shadow-md ${config.colors} ${
                    message.is_resolved ? 'opacity-60' : ''
                  }`}
                >
                  {/* Header du message */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-wrap flex-1">
                      <Badge className={`text-xs font-semibold ${config.badge}`}>
                        {config.icon} {config.label}
                      </Badge>
                      <span className="text-sm font-semibold text-slate-800">
                        {message.user.username}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatTimestamp(message.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {message.is_resolved && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                          ✓ Résolu
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Contenu du message */}
                  <div className="mb-3">
                    <p className={`text-sm leading-relaxed whitespace-pre-wrap text-slate-800 ${
                      isLongContent && !isExpanded ? 'line-clamp-3' : ''
                    }`}>
                      {message.content}
                    </p>
                    {isLongContent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleMessageExpanded(message.id)}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-700 p-0 h-auto"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3 h-3 mr-1" />
                            Réduire
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3 mr-1" />
                            Afficher plus
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Données JSON - Affichage amélioré */}
                  {message.json_path && (() => {
                    // Extraire les données JSON depuis le chemin si elles ne sont pas déjà fournies
                    const jsonDataToDisplay = message.json_data && Object.keys(message.json_data).length > 0
                      ? message.json_data
                      : extractJsonPath(message.json_path);

                    return (
                      <div className="mb-3 p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <FileJson className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-bold text-blue-900 font-mono">
                              📍 {message.json_path}
                            </span>
                          </div>
                          <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300 text-xs">
                            JSON
                          </Badge>
                        </div>
                        {jsonDataToDisplay && (
                          <div className="bg-white rounded-lg border border-blue-200 p-3">
                            <p className="text-xs font-semibold text-blue-900 mb-2">📊 Valeurs :</p>
                            <pre className="text-xs bg-slate-50 p-3 rounded overflow-x-auto max-h-48 text-slate-800 font-mono border border-slate-200">
                              {JSON.stringify(jsonDataToDisplay, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCorrectMessage(message)}
                      className="text-xs h-8 px-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                      title="Corriger ce message"
                    >
                      <Edit2 className="w-3 h-3 mr-1" />
                      Corriger
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleResolved(message.id)}
                      className="text-xs h-8 px-2"
                      title={message.is_resolved ? "Marquer non résolu" : "Marquer résolu"}
                    >
                      {message.is_resolved ? (
                        <>
                          <CheckCircle className="w-3 h-3 mr-1 text-green-600" />
                          Résolu
                        </>
                      ) : (
                        <>
                          <Circle className="w-3 h-3 mr-1" />
                          Résoudre
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteMessage(message.id)}
                      className="text-xs h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Supprimer
                    </Button>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Alerte d'erreur */}
        {error && (
          <Alert variant="destructive" className="m-4 bg-red-50 border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {/* Assistant de Recherche IA */}
        {showSearchAssistant && (
          <div className="flex-shrink-0 m-3 p-4 border-2 border-purple-300 rounded-lg bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 shadow-lg max-h-[400px] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg flex items-center gap-2 text-purple-800">
                <Sparkles className="w-5 h-5 text-purple-600" />
                Assistant Blocklabs
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowSearchAssistant(false);
                  setSearchResults([]);
                  setSearchQuery('');
                }}
                className="h-7 w-7 p-0 hover:bg-purple-200"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <Alert className="mb-3 bg-white border-purple-200">
              <AlertDescription className="text-xs text-slate-700">
                💡 Posez une question pour obtenir une réponse intelligent avec le contexte du document
              </AlertDescription>
            </Alert>

            <div className="flex gap-2 mb-3">
              <Input
                placeholder="Votre question..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearchInJson();
                  }
                }}
                className="border-purple-300 focus:ring-purple-500 text-sm h-9"
              />
              <Button
                onClick={handleSearchInJson}
                disabled={searchLoading || !searchQuery.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white h-9 px-3"
                size="sm"
              >
                <Zap className="w-3 h-3 mr-1" />
                Analyser
              </Button>
            </div>

            {searchLoading && (
              <div className="text-center py-4 bg-white rounded-lg border border-purple-200">
                <RefreshCw className="w-6 h-6 animate-spin text-purple-600 mx-auto mb-2" />
                <p className="text-xs text-purple-700 font-medium">Analyse en cours...</p>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((result, idx) => (
                  <div key={idx} className="p-3 bg-white rounded-lg border border-purple-200 text-xs">
                    <div className="mb-2 flex items-center gap-2 flex-wrap">
                      <Badge className="text-xs bg-purple-100 text-purple-800">
                        {result.type === 'validated_qa' ? '✅ Validée' : '🤖 Réponse '}
                      </Badge>
                      {result.confidence && (
                        <Badge variant="outline" className="text-xs">
                          {Math.round(result.confidence * 100)}% confiance
                        </Badge>
                      )}
                    </div>
                    <p className="text-slate-800 mb-2">{result.text}</p>
                    {correctingResultIndex === idx ? (
                      <div ref={correctionFormRef} className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-300">
                        <Textarea
                          value={correctionValue}
                          onChange={(e) => setCorrectionValue(e.target.value)}
                          className="mb-2 min-h-[60px] text-xs"
                          placeholder="Correction..."
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveCorrection(idx)}
                            disabled={savingCorrection}
                            className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                          >
                            {savingCorrection ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelCorrection}
                            className="h-7 text-xs"
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStartCorrection(idx, result.text || '')}
                          className="text-xs h-7 px-2"
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Corriger
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUseSearchResult(result)}
                          className="text-xs h-7 px-2 border-green-300 hover:bg-green-50 text-green-700"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Utiliser
                        </Button>
                      </div>
                    )}

                    {/* Affichage du JSON associé */}
                    {result.json_path && result.data && Object.keys(result.data).length > 0 && (
                      <div className="mt-3 p-2 bg-slate-50 rounded border border-slate-300 border-dashed">
                        <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
                          <FileJson className="w-3 h-3" />
                          📍 Données JSON : {result.json_path}
                        </p>

                        {correctingResultIndex === idx && showJsonEditor ? (
                          // Mode Éditable
                          <div className="p-2 bg-yellow-50 rounded border-2 border-yellow-400">
                            <Textarea
                              value={editingJsonData}
                              onChange={(e) => setEditingJsonData(e.target.value)}
                              className="min-h-[120px] max-h-[200px] text-xs font-mono bg-yellow-50 border-yellow-300 mb-2"
                              placeholder="Modifiez le JSON..."
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => {
                                  try {
                                    const parsed = JSON.parse(editingJsonData);
                                    // Mettre à jour le résultat
                                    const updated = [...searchResults];
                                    updated[idx].data = parsed;
                                    setSearchResults(updated);
                                  } catch (e) {
                                    alert('❌ JSON invalide');
                                  }
                                }}
                                className="bg-green-600 hover:bg-green-700 text-white h-6 text-xs"
                              >
                                <Check className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          // Mode Lecture
                          <pre className="text-xs bg-white p-2 rounded overflow-x-auto max-h-40 text-slate-800 font-mono border border-slate-200">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Zone de saisie */}
        <div className="flex-shrink-0 border-t bg-white p-4 space-y-3">
          {/* Sélecteur de type */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Type de message :</p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(MESSAGE_TYPE_CONFIG).map(([type, config]) => (
                <Button
                  key={type}
                  variant={messageType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMessageType(type as keyof typeof MESSAGE_TYPE_CONFIG)}
                  className={`text-xs h-8 ${messageType === type ? 'shadow-md' : ''}`}
                >
                  {config.icon} {config.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Sélecteur JSON */}
          {showJsonSelector && (
            <div className="space-y-2 p-3 bg-slate-50 rounded-lg border-2 border-orange-300">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">📍 Chemin JSON :</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowJsonSelector(false);
                    setShowJsonEditor(false);
                    setEditingJsonData('');
                  }}
                  className="h-5 w-5 p-0 text-slate-500"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              <Input
                placeholder="Ex: entities.Product[0].name"
                value={jsonPath}
                onChange={(e) => setJsonPath(e.target.value)}
                className="text-xs h-8 font-mono bg-white"
                disabled={correctingMessageId !== null}
              />

              {!showJsonEditor && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedJsonData) {
                      setEditingJsonData(JSON.stringify(selectedJsonData, null, 2));
                      setShowJsonEditor(true);
                    }
                  }}
                  className="text-xs h-7 w-full"
                >
                  <FileJson className="w-3 h-3 mr-1" />
                  Afficher les données
                </Button>
              )}

              {/* Affichage des données JSON */}
              {selectedJsonData && Object.keys(selectedJsonData).length > 0 && (
                <>
                  {showJsonEditor && correctingMessageId !== null ? (
                    // Mode Éditable (Correction)
                    <div className="mt-2 p-2 bg-white rounded border-2 border-yellow-400 shadow-md">
                      <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-2">
                        <Edit2 className="w-3 h-3 text-yellow-600" />
                        ✏️ Données JSON (Mode éditable)
                      </p>
                      <Textarea
                        value={editingJsonData}
                        onChange={(e) => setEditingJsonData(e.target.value)}
                        className="min-h-[150px] max-h-[300px] text-xs font-mono bg-yellow-50 border-yellow-300 focus:ring-yellow-500"
                        placeholder="Modifiez le JSON ici..."
                      />

                      {/* Note de modification */}
                      <div className="mt-3">
                        <label className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                          📝 Note de modification (optionnel)
                        </label>
                        <Textarea
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          className="min-h-[60px] text-xs bg-white border-slate-300 focus:ring-blue-500"
                          placeholder="Décrivez les modifications apportées (ex: 'Correction du dosage .0 en 0.5 mg')..."
                        />
                      </div>

                      <div className="mt-2 flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          onClick={handleSaveJsonEdit}
                          className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs font-bold"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          💾 Valider et Enregistrer
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingJsonData(JSON.stringify(selectedJsonData, null, 2));
                          }}
                          className="h-7 text-xs"
                        >
                          ↺ Réinitialiser
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Mode Lecture (Normal)
                    <div className="mt-2 p-2 bg-white rounded border border-slate-200">
                      <p className="text-xs font-semibold text-slate-700 mb-2">Données JSON :</p>
                      <pre className="text-xs bg-slate-100 p-2 rounded overflow-x-auto max-h-40 text-slate-800 font-mono border border-slate-300">
                        {JSON.stringify(selectedJsonData, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Boutons d'actions */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={showJsonSelector ? "default" : "outline"}
              size="sm"
              onClick={() => setShowJsonSelector(!showJsonSelector)}
              className={`text-xs h-8 ${showJsonSelector ? 'bg-orange-600 hover:bg-orange-700' : ''}`}
            >
              <Tag className="w-3 h-3 mr-1" />
              {showJsonSelector ? '✓' : ''} JSON
            </Button>

            <Button
              variant={showSearchAssistant ? "default" : "outline"}
              size="sm"
              onClick={() => setShowSearchAssistant(!showSearchAssistant)}
              className={`text-xs h-8 ${showSearchAssistant ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-purple-50 border-purple-200 text-purple-700'}`}
            >
              <Sparkles className="w-3 h-3 mr-1" />
              {showSearchAssistant ? '✓' : ''} Assistant
            </Button>

            {correctingMessageId && (
              <Badge variant="outline" className="bg-orange-50 border-orange-200 text-orange-700 text-xs">
                ✏️ Mode correction
              </Badge>
            )}
          </div>

          {/* Section de correction avec contexte */}
          {correctingMessageId && (
            <div className="p-3 bg-orange-50 rounded-lg border-2 border-orange-300 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-orange-900 flex items-center gap-2">
                    <Edit2 className="w-4 h-4" />
                    Mode correction activé
                  </p>
                  {showJsonEditor && (
                    <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-400 text-xs animate-pulse">
                      ✏️ JSON éditable ci-dessus
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCorrectingMessageId(null);
                    setNewMessage('');
                    setJsonPath('');
                    setSelectedJsonData(null);
                    setShowJsonSelector(false);
                    setShowJsonEditor(false);
                  }}
                  className="h-6 w-6 p-0 text-orange-600 hover:text-orange-700"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-orange-800">
                📝 Proposez votre correction pour ce message problématique
              </p>
            </div>
          )}

          {/* Zone de texte et envoi */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Votre message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="flex-1 min-h-[50px] max-h-[100px] text-sm resize-none"
            />
            <Button
              onClick={handleSendMessage}
              disabled={loading || !newMessage.trim()}
              className="h-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          <p className="text-xs text-slate-500">
            <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono">Entrée</kbd> pour envoyer,
            <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono ml-1">Maj+Entrée</kbd> pour nouvelle ligne
          </p>
        </div>
      </CardContent>
    </Card>
  );
}