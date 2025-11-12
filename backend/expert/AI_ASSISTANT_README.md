# Assistant de Recherche et Correction IA Avancé

## 📋 Vue d'ensemble

L'assistant de recherche IA avancé remplace l'ancien système sans IA dans l'interface expert. Il utilise **GROQ** et **Mistral** pour fournir des réponses intelligentes, enrichies et contextualisées basées sur les données validées du document.

## 🚀 Fonctionnalités principales

### 1. **Recherche Intelligente avec IA**
- Analyse les questions en langage naturel
- Cherche d'abord dans les données validées (sans IA)
- Enrichit les réponses avec du contexte et des explications (avec IA)
- Analyse le JSON avec l'IA si aucune réponse validée n'est trouvée

### 2. **Correction Avancée**
- Suggestions de corrections intelligentes basées sur le contexte
- Analyse de cohérence des données
- Explications détaillées des corrections proposées

### 3. **Enrichissement Contextuel**
- Ajoute du contexte supplémentaire aux réponses
- Fournit des informations connexes pertinentes
- Améliore la compréhension des données

### 4. **Suggestions d'Amélioration**
- Analyse la complétude des données
- Détecte les incohérences
- Propose des améliorations concrètes

## 🔧 Architecture

### Backend

#### `ai_research_assistant.py`
Service principal qui gère l'interaction avec l'IA :

```python
class AIResearchAssistant:
    - ask_question_with_ai()      # Pose une question avec assistance IA
    - correct_answer_with_ai()    # Corrige une réponse avec IA
    - suggest_improvements()      # Suggère des améliorations
    - _enrich_answer_with_ai()    # Enrichit une réponse
    - _analyze_with_ai()          # Analyse le JSON avec IA
```

#### `qa_api_views.py`
Endpoint API mis à jour pour utiliser l'assistant IA :

```python
@csrf_exempt
@require_http_methods(["POST"])
def ask_question(request, doc_id):
    # Utilise AIResearchAssistant au lieu de IntelligentQAService
    ai_assistant = AIResearchAssistant()
    result = ai_assistant.ask_question_with_ai(...)
```

### Frontend

#### `ExpertChat.tsx`
Interface utilisateur mise à jour avec :
- Thème violet/pourpre pour l'IA (au lieu de bleu)
- Nouveaux badges pour les types de réponses IA
- Messages et exemples adaptés à l'IA
- Indicateurs visuels pour l'analyse IA en cours

## 📊 Types de réponses

| Type | Description | Badge | Confiance |
|------|-------------|-------|-----------|
| `validated_qa` | Q&A validée par expert | ✅ Q&A Validée | 100% |
| `validated_qa_ai_enriched` | Q&A enrichie par IA | 🤖 Q&A Enrichie par IA | 90-100% |
| `ai_analysis` | Analyse IA du JSON | 🤖 Analyse IA | 70-90% |
| `json_entity` | Entité trouvée dans JSON | 📦 Entité JSON | 80% |
| `json_relation` | Relation trouvée dans JSON | 🔗 Relation JSON | 90% |
| `ai_not_found` | Non trouvé par IA | ❌ Non trouvé | 0% |

## 🔑 Configuration

### Variables d'environnement requises

Dans `.env` :

```env
# API Keys pour l'IA
GROQ_API_KEY=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
MISTRAL_API_KEY=80BDnUssarBGvdLVv6x06Lilo98UmhtY

# Configuration LLM (optionnel)
LLM_PROVIDER_PRIORITY=groq,openai
LLM_MODEL_GROQ=llama-3.3-70b-versatile
LLM_MODEL_OPENAI=gpt-4o-mini
ENABLE_LLM=1
```

### Modèles utilisés

- **GROQ** : `llama-3.3-70b-versatile` (par défaut)
- **Mistral** : `mistral-large-latest`
- **OpenAI** : `gpt-4o-mini` (fallback)

## 💡 Exemples d'utilisation

### Questions simples
```
"donnes les dosages"
"liste les ingrédients"
"quel est le dosage du produit S 6490"
```

### Questions avancées avec IA
```
"analyse les dosages et explique leur signification"
"quelles sont les relations entre les ingrédients et les produits"
"résume les informations importantes du document"
"vérifie la cohérence des données"
```

## 🔄 Processus de réponse

1. **Question posée** → L'utilisateur pose une question
2. **Recherche sans IA** → Cherche dans les Q&A validées et le JSON
3. **Si trouvé** → Enrichit avec l'IA (contexte, explications)
4. **Si non trouvé** → Analyse le JSON avec l'IA
5. **Réponse enrichie** → Retourne la réponse avec métadonnées

## 🎨 Interface utilisateur

### Changements visuels

- **Couleur principale** : Violet/Pourpre (au lieu de bleu)
- **Icônes** : 🤖 pour l'IA, 🧠 pour l'enrichissement
- **Messages** : "L'IA analyse votre question..." au lieu de "Recherche en cours..."
- **Boutons** : "Analyser avec IA" au lieu de "Chercher"

### Nouveaux badges

- 🤖 Q&A Enrichie par IA
- 🤖 Analyse IA
- ✅ Q&A Validée (conservé)

## 📈 Avantages

### Par rapport à l'ancien système (sans IA)

| Fonctionnalité | Sans IA | Avec IA |
|----------------|---------|---------|
| Recherche exacte | ✅ | ✅ |
| Recherche partielle | ✅ | ✅ |
| Enrichissement contextuel | ❌ | ✅ |
| Analyse sémantique | ❌ | ✅ |
| Suggestions intelligentes | ❌ | ✅ |
| Explications détaillées | ❌ | ✅ |
| Détection d'incohérences | ❌ | ✅ |

## 🔒 Sécurité et validation

- Les réponses IA sont marquées comme "nécessitant validation"
- Les données validées par expert ont toujours la priorité
- L'IA ne peut pas modifier directement les données
- Toutes les corrections doivent être approuvées par un expert

## 🐛 Dépannage

### L'IA ne répond pas
- Vérifier que `GROQ_API_KEY` ou `MISTRAL_API_KEY` est configuré
- Vérifier que `ENABLE_LLM=1` dans `.env`
- Vérifier les logs pour les erreurs d'API

### Réponses de faible qualité
- Augmenter `max_tokens` dans les appels LLM
- Vérifier la qualité des données JSON
- Ajuster la température du modèle

### Rate limiting
- Le système utilise un fallback automatique entre providers
- Les erreurs de rate limit sont gérées avec retry automatique
- Vérifier les quotas API

## 📝 Notes de développement

### Fichiers modifiés

1. **Backend**
   - `expert/ai_research_assistant.py` (nouveau)
   - `expert/qa_api_views.py` (modifié)
   - `expert/llm_client.py` (existant, utilisé)

2. **Frontend**
   - `components/expert/ExpertChat.tsx` (modifié)

### Tests recommandés

1. Tester avec différents types de questions
2. Vérifier l'enrichissement des réponses
3. Tester la correction avec IA
4. Vérifier le fallback sans IA
5. Tester avec API keys invalides

## 🚀 Prochaines étapes

- [ ] Ajouter des métriques de performance IA
- [ ] Implémenter un cache pour les réponses IA
- [ ] Ajouter des tests unitaires
- [ ] Améliorer les prompts pour plus de précision
- [ ] Ajouter un mode "expert" avec plus de contrôle

## 📞 Support

Pour toute question ou problème :
- Vérifier les logs backend : `backend/logs/`
- Vérifier la console frontend pour les erreurs
- Consulter la documentation GROQ/Mistral
