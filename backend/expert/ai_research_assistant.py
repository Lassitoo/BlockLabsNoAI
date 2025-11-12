# expert/ai_research_assistant.py
"""
Assistant de Recherche et Correction Avancée avec IA
Utilise GROQ/Mistral pour des recherches intelligentes et corrections avancées
"""

import json
import logging
from typing import Dict, List, Any, Optional
from django.utils import timezone

from .llm_client import LLMClient
from .intelligent_qa_service import IntelligentQAService
from rawdocs.models import RawDocument
from .models import ValidatedQA

logger = logging.getLogger(__name__)


class AIResearchAssistant:
    """
    Assistant de recherche IA puissant pour l'interface expert
    Combine la recherche dans le JSON validé avec l'intelligence de l'IA
    pour des réponses plus précises et des corrections avancées
    """

    def __init__(self):
        self.llm_client = LLMClient()
        self.qa_service = IntelligentQAService()

    def ask_question_with_ai(
        self,
        question: str,
        document: RawDocument,
        user=None
    ) -> Dict[str, Any]:
        """
        Pose une question avec assistance IA avancée

        Processus:
        1. Cherche d'abord dans les données validées (sans IA)
        2. Si trouvé, utilise l'IA pour améliorer/enrichir la réponse
        3. Si non trouvé, utilise l'IA pour analyser le JSON et proposer une réponse

        Args:
            question: La question posée
            document: Document concerné
            user: Utilisateur qui pose la question

        Returns:
            Dict avec la réponse enrichie par l'IA
        """
        # 1. Chercher d'abord dans les données validées (méthode sans IA)
        base_answer = self.qa_service.ask_question(question, document, user)

        # 2. Récupérer le JSON du document pour contexte
        json_data = self._get_document_json(document)

        # 3. Si réponse trouvée, enrichir avec l'IA
        if base_answer['source'] != 'not_found' and self.llm_client.enabled:
            enriched = self._enrich_answer_with_ai(
                question=question,
                base_answer=base_answer,
                json_context=json_data
            )
            if enriched:
                return enriched
            # Si enrichissement échoue, retourner la réponse de base
            return base_answer

        # 4. Si aucune réponse trouvée, utiliser l'IA pour analyser le JSON
        if base_answer['source'] == 'not_found' and self.llm_client.enabled:
            ai_answer = self._analyze_with_ai(
                question=question,
                json_data=json_data,
                document=document
            )
            if ai_answer:
                return ai_answer

        # 5. Fallback: retourner la réponse de base (non trouvé)
        return base_answer

    def correct_answer_with_ai(
        self,
        question: str,
        original_answer: str,
        document: RawDocument,
        user=None
    ) -> Dict[str, Any]:
        """
        Corrige une réponse avec assistance IA
        L'IA analyse le contexte et propose des corrections intelligentes

        Args:
            question: La question originale
            original_answer: La réponse à corriger
            document: Document concerné
            user: Utilisateur qui demande la correction

        Returns:
            Dict avec suggestions de correction
        """
        if not self.llm_client.enabled:
            return {
                'success': False,
                'error': 'IA non disponible pour la correction'
            }

        json_data = self._get_document_json(document)

        # Préparer le prompt pour l'IA
        messages = [
            {
                "role": "system",
                "content": """Tu es un assistant expert en correction et validation de données réglementaires.
Ta tâche est d'analyser une réponse et de proposer des corrections si nécessaire.
Tu dois être précis, factuel et te baser uniquement sur les données fournies dans le JSON.
Réponds UNIQUEMENT en JSON avec cette structure:
{
    "needs_correction": true/false,
    "corrected_answer": "réponse corrigée si nécessaire",
    "confidence": 0.0-1.0,
    "explanation": "explication de la correction",
    "suggestions": ["suggestion 1", "suggestion 2"]
}"""
            },
            {
                "role": "user",
                "content": f"""Question: {question}

Réponse originale: {original_answer}

Contexte JSON du document:
{json.dumps(json_data, ensure_ascii=False, indent=2)[:4000]}

Analyse cette réponse et propose des corrections si nécessaire.
Vérifie la précision, la complétude et la cohérence avec les données JSON."""
            }
        ]

        try:
            result = self.llm_client.chat_json(messages, max_tokens=1500)

            if result:
                return {
                    'success': True,
                    'needs_correction': result.get('needs_correction', False),
                    'corrected_answer': result.get('corrected_answer', original_answer),
                    'confidence': result.get('confidence', 0.8),
                    'explanation': result.get('explanation', ''),
                    'suggestions': result.get('suggestions', []),
                    'source': 'ai_correction'
                }
        except Exception as e:
            logger.exception("Erreur lors de la correction IA: %s", e)

        return {
            'success': False,
            'error': 'Erreur lors de la correction IA'
        }

    def _enrich_answer_with_ai(
        self,
        question: str,
        base_answer: Dict[str, Any],
        json_context: Optional[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Enrichit une réponse de base avec l'IA
        L'IA ajoute du contexte, des explications et des détails supplémentaires
        """
        messages = [
            {
                "role": "system",
                "content": """Tu es un assistant expert en analyse de données réglementaires.
Ta tâche est d'enrichir une réponse avec du contexte et des détails supplémentaires.
Reste factuel et base-toi uniquement sur les données fournies.
Réponds UNIQUEMENT en JSON avec cette structure:
{
    "enriched_answer": "réponse enrichie avec contexte",
    "additional_context": "contexte supplémentaire pertinent",
    "related_information": ["info 1", "info 2"],
    "confidence": 0.0-1.0
}"""
            },
            {
                "role": "user",
                "content": f"""Question: {question}

Réponse de base: {base_answer['answer']}

Source: {base_answer['source']}

Contexte JSON:
{json.dumps(json_context, ensure_ascii=False, indent=2)[:4000] if json_context else 'Non disponible'}

Enrichis cette réponse avec du contexte et des détails supplémentaires pertinents."""
            }
        ]

        try:
            result = self.llm_client.chat_json(messages, max_tokens=2000)

            if result and result.get('enriched_answer'):
                return {
                    'answer': result['enriched_answer'],
                    'source': f"{base_answer['source']}_ai_enriched",
                    'confidence': min(base_answer['confidence'], result.get('confidence', 0.9)),
                    'json_path': base_answer.get('json_path', ''),
                    'json_data': base_answer.get('json_data', {}),
                    'needs_validation': False,
                    'qa_id': base_answer.get('qa_id'),
                    'ai_enrichment': {
                        'additional_context': result.get('additional_context', ''),
                        'related_information': result.get('related_information', [])
                    }
                }
        except Exception as e:
            logger.exception("Erreur lors de l'enrichissement IA: %s", e)

        return None

    def _analyze_with_ai(
        self,
        question: str,
        json_data: Optional[Dict[str, Any]],
        document: RawDocument
    ) -> Optional[Dict[str, Any]]:
        """
        Analyse le JSON avec l'IA pour répondre à une question
        Utilisé quand aucune réponse n'est trouvée dans les données validées
        """
        if not json_data:
            return None

        messages = [
            {
                "role": "system",
                "content": """Tu es un assistant expert en analyse de données réglementaires JSON.
Ta tâche est d'analyser un document JSON et de répondre à des questions précises.
Tu dois être factuel et te baser UNIQUEMENT sur les données présentes dans le JSON.
Si l'information n'est pas dans le JSON, dis-le clairement.
Réponds UNIQUEMENT en JSON avec cette structure:
{
    "answer": "réponse à la question",
    "found": true/false,
    "confidence": 0.0-1.0,
    "json_path": "chemin vers les données utilisées",
    "explanation": "explication de comment tu as trouvé la réponse",
    "needs_validation": true/false
}"""
            },
            {
                "role": "user",
                "content": f"""Question: {question}

Document JSON à analyser:
{json.dumps(json_data, ensure_ascii=False, indent=2)[:6000]}

Analyse ce JSON et réponds à la question de manière précise et factuelle."""
            }
        ]

        try:
            result = self.llm_client.chat_json(messages, max_tokens=2000)

            if result and result.get('found'):
                return {
                    'answer': result['answer'],
                    'source': 'ai_analysis',
                    'confidence': result.get('confidence', 0.7),
                    'json_path': result.get('json_path', ''),
                    'json_data': {},
                    'needs_validation': result.get('needs_validation', True),
                    'qa_id': None,
                    'ai_explanation': result.get('explanation', '')
                }
            elif result:
                return {
                    'answer': result.get('answer', "L'IA n'a pas trouvé cette information dans le JSON validé."),
                    'source': 'ai_not_found',
                    'confidence': 0.0,
                    'json_path': '',
                    'json_data': {},
                    'needs_validation': True,
                    'qa_id': None
                }
        except Exception as e:
            logger.exception("Erreur lors de l'analyse IA: %s", e)

        return None

    def suggest_improvements(
        self,
        document: RawDocument,
        context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Suggère des améliorations pour le document basées sur l'analyse IA

        Args:
            document: Document à analyser
            context: Contexte optionnel pour l'analyse

        Returns:
            Dict avec suggestions d'amélioration
        """
        if not self.llm_client.enabled:
            return {
                'success': False,
                'error': 'IA non disponible'
            }

        json_data = self._get_document_json(document)

        messages = [
            {
                "role": "system",
                "content": """Tu es un assistant expert en qualité de données réglementaires.
Analyse un document JSON et suggère des améliorations pour:
- Complétude des données
- Cohérence des relations
- Qualité des annotations
- Données manquantes importantes

Réponds UNIQUEMENT en JSON avec cette structure:
{
    "completeness_score": 0.0-1.0,
    "suggestions": [
        {
            "type": "missing_data|inconsistency|quality",
            "priority": "high|medium|low",
            "description": "description du problème",
            "recommendation": "recommandation d'amélioration"
        }
    ],
    "strengths": ["point fort 1", "point fort 2"],
    "overall_assessment": "évaluation globale"
}"""
            },
            {
                "role": "user",
                "content": f"""Analyse ce document JSON et suggère des améliorations:

{json.dumps(json_data, ensure_ascii=False, indent=2)[:5000] if json_data else 'Aucune donnée'}

{f'Contexte: {context}' if context else ''}

Fournis une analyse détaillée avec des suggestions concrètes."""
            }
        ]

        try:
            result = self.llm_client.chat_json(messages, max_tokens=2500)

            if result:
                return {
                    'success': True,
                    'completeness_score': result.get('completeness_score', 0.0),
                    'suggestions': result.get('suggestions', []),
                    'strengths': result.get('strengths', []),
                    'overall_assessment': result.get('overall_assessment', ''),
                    'analyzed_at': timezone.now().isoformat()
                }
        except Exception as e:
            logger.exception("Erreur lors de l'analyse d'amélioration: %s", e)

        return {
            'success': False,
            'error': 'Erreur lors de l\'analyse'
        }

    def _get_document_json(self, document: RawDocument) -> Optional[Dict[str, Any]]:
        """Récupère le JSON du document"""
        try:
            if hasattr(document, 'global_annotations_json') and document.global_annotations_json:
                return document.global_annotations_json
            return None
        except Exception:
            return None
