# expert/intelligent_qa_service.py

"""
Service de Questions-Réponses Intelligent SANS IA
Utilise les relations validées et le JSON pour répondre aux questions
Apprend des corrections des experts
"""

import re
import unicodedata
from typing import Dict, List, Any, Optional, Tuple
from django.utils import timezone
from django.db.models import Q, Avg, Sum
from django.db import models

from .models import ValidatedQA
from rawdocs.models import RawDocument


class IntelligentQAService:
    """
    Service pour répondre aux questions en utilisant :
    1. Les Q&A validées précédemment
    2. Les relations JSON validées
    3. Les entités et champs JSON

    SANS utiliser d'IA - uniquement de la recherche et des règles
    """

    def __init__(self):
        # Patterns de questions courantes
        self.question_patterns = {
            'value_of': r'(?:quelle?\s+est\s+(?:la\s+)?valeur\s+de|valeur\s+de)\s+(.+)',
            'what_is': r'(?:qu\'?est-ce\s+que|c\'?est\s+quoi)\s+(.+)',
            'contains': r'(?:contient|contenu\s+de)\s+(.+)',
            'relation': r'(?:relation\s+entre)\s+(.+)\s+et\s+(.+)',
            'list': r'(?:liste|lister|quels?\s+sont|donnes?)\s+(?:les?\s+)?(.+)',
            # Pattern simplifié pour "quel est X du/de Y"
            'attribute_of': r'(?:quel|quelle|quels)\s+(?:est|sont)\s+(?:le|la|les)?\s*(\w+)\s+du?\s+(.+)',
        }

    def ask_question(
        self,
        question: str,
        document: Optional[RawDocument] = None,
        user = None
    ) -> Dict[str, Any]:
        """
        Pose une question et obtient une réponse intelligente
        CHERCHE UNIQUEMENT DANS LE JSON DU DOCUMENT

        Args:
            question: La question posée
            document: Document concerné (optionnel)
            user: Utilisateur qui pose la question

        Returns:
            Dict avec la réponse, la source, et la confiance
        """
        # Normaliser la question
        normalized_question = self._normalize_text(question)

        # 1. Chercher dans les Q&A validées du JSON (priorité absolue)
        if document:
            json_qa_answer = self._search_json_validated_qa(normalized_question, document)
            if json_qa_answer:
                return {
                    'answer': json_qa_answer['answer'],
                    'source': 'validated_qa',
                    'confidence': json_qa_answer['confidence'],
                    'json_path': json_qa_answer.get('json_path', ''),
                    'json_data': json_qa_answer.get('json_data', {}),
                    'needs_validation': False,
                    'qa_id': json_qa_answer.get('qa_id'),
                    'corrections': json_qa_answer.get('corrections', [])
                }

        # 2. Chercher dans les entités et relations du JSON
        if document:
            json_answer = self._search_in_json(question, normalized_question, document)
            if json_answer:
                return {
                    'answer': json_answer['answer'],
                    'source': json_answer['source_type'],
                    'confidence': json_answer['confidence'],
                    'json_path': json_answer.get('json_path', ''),
                    'json_data': json_answer.get('json_data', {}),
                    'needs_validation': True,  # Nécessite validation expert
                    'qa_id': None
                }

        # 3. Aucune réponse trouvée
        return {
            'answer': "Je n'ai pas trouvé de réponse validée pour cette question. Un expert doit fournir la réponse.",
            'source': 'not_found',
            'confidence': 0.0,
            'json_path': '',
            'json_data': {},
            'needs_validation': True,
            'qa_id': None
        }

    def validate_answer(
        self,
        question: str,
        answer: str,
        document: Optional[RawDocument],
        validated_by,
        source_type: str = 'expert_knowledge',
        json_path: str = '',
        json_data: Dict = None,
        tags: List[str] = None,
        is_global: bool = False
    ) -> ValidatedQA:
        """
        Valide une réponse fournie par un expert
        Crée ou met à jour une Q&A validée
        """
        normalized_question = self._normalize_text(question)

        # Chercher si une Q&A existe déjà pour cette question
        existing_qa = ValidatedQA.objects.filter(
            question_normalized=normalized_question,
            document=document if not is_global else None,
            is_active=True
        ).first()

        if existing_qa:
            # Mettre à jour avec correction
            existing_qa.add_correction(answer, validated_by)
            return existing_qa
        else:
            # Créer nouvelle Q&A validée
            validated_qa = ValidatedQA.objects.create(
                document=document if not is_global else None,
                question=question,
                question_normalized=normalized_question,
                answer=answer,
                source_type=source_type,
                json_path=json_path,
                json_data=json_data or {},
                validated_by=validated_by,
                is_global=is_global,
                tags=tags or [],
                confidence_score=1.0
            )
            return validated_qa

    def correct_answer(
        self,
        qa_id: int,
        new_answer: str,
        corrected_by
    ) -> ValidatedQA:
        """
        Corrige une réponse existante
        """
        qa = ValidatedQA.objects.get(id=qa_id)
        qa.add_correction(new_answer, corrected_by)
        return qa

    def _search_json_validated_qa(
        self,
        normalized_question: str,
        document: RawDocument
    ) -> Optional[Dict[str, Any]]:
        """
        Cherche dans les Q&A validées stockées dans le JSON du document
        """
        json_data = self._get_document_json(document)
        if not json_data:
            return None

        validated_qa_list = json_data.get('validated_qa', [])
        if not validated_qa_list:
            return None

        # Chercher correspondance exacte
        for qa in validated_qa_list:
            if qa.get('question_normalized') == normalized_question:
                return {
                    'answer': qa.get('answer'),
                    'confidence': qa.get('confidence', 1.0),
                    'json_path': qa.get('json_path', ''),
                    'json_data': {},
                    'qa_id': qa.get('id'),
                    'corrections': qa.get('corrections', [])
                }

        # Chercher correspondance partielle (mots-clés)
        keywords = self._extract_keywords(normalized_question)
        if keywords:
            for qa in validated_qa_list:
                qa_normalized = qa.get('question_normalized', '')
                qa_keywords = self._extract_keywords(qa_normalized)
                # Si au moins 70% des mots-clés correspondent
                match_ratio = len(keywords & qa_keywords) / len(keywords) if keywords else 0
                if match_ratio >= 0.7:
                    return {
                        'answer': qa.get('answer'),
                        'confidence': qa.get('confidence', 1.0) * match_ratio,
                        'json_path': qa.get('json_path', ''),
                        'json_data': {},
                        'qa_id': qa.get('id'),
                        'corrections': qa.get('corrections', [])
                    }

        return None

    def _search_validated_qa(
        self,
        normalized_question: str,
        document: Optional[RawDocument]
    ) -> Optional[Dict[str, Any]]:
        """
        Cherche dans les Q&A validées (base de données)
        OBSOLÈTE - Utiliser _search_json_validated_qa à la place
        """
        # Chercher correspondance exacte
        exact_match = ValidatedQA.objects.filter(
            question_normalized=normalized_question,
            is_active=True
        ).filter(
            Q(document=document) | Q(is_global=True)
        ).order_by('-confidence_score', '-usage_count').first()

        if exact_match:
            return {
                'answer': exact_match.answer,
                'confidence': exact_match.confidence_score,
                'json_path': exact_match.json_path,
                'json_data': exact_match.json_data,
                'qa_id': exact_match.id,
                'qa_object': exact_match
            }

        # Chercher correspondance partielle (mots-clés)
        keywords = self._extract_keywords(normalized_question)
        if keywords:
            partial_matches = ValidatedQA.objects.filter(
                is_active=True
            ).filter(
                Q(document=document) | Q(is_global=True)
            )

            for qa in partial_matches:
                qa_keywords = self._extract_keywords(qa.question_normalized)
                # Si au moins 70% des mots-clés correspondent
                match_ratio = len(keywords & qa_keywords) / len(keywords) if keywords else 0
                if match_ratio >= 0.7:
                    return {
                        'answer': qa.answer,
                        'confidence': qa.confidence_score * match_ratio,
                        'json_path': qa.json_path,
                        'json_data': qa.json_data,
                        'qa_id': qa.id,
                        'qa_object': qa
                    }

        return None

    def _search_in_json(
        self,
        original_question: str,
        normalized_question: str,
        document: RawDocument
    ) -> Optional[Dict[str, Any]]:
        """
        Cherche la réponse dans le JSON du document
        Utilise des patterns et des règles pour extraire l'information
        """
        # Récupérer le JSON du document
        json_data = self._get_document_json(document)
        if not json_data:
            return None

        # Analyser la question pour déterminer le type
        question_type, extracted_info = self._analyze_question(original_question, normalized_question)

        if question_type == 'value_of':
            # Question du type "quelle est la valeur de X?"
            field_name = extracted_info
            result = self._find_field_value(field_name, json_data)
            if result:
                return {
                    'answer': result['value'],
                    'source_type': 'json_field',
                    'confidence': 0.8,
                    'json_path': result['path'],
                    'json_data': result['data']
                }

        elif question_type == 'entity_value':
            # Question sur une entité spécifique
            entity_type = extracted_info
            result = self._find_entity_values(entity_type, json_data)
            if result:
                return {
                    'answer': result['answer'],
                    'source_type': 'json_entity',
                    'confidence': 0.8,
                    'json_path': result['path'],
                    'json_data': result['data']
                }

        elif question_type == 'relation':
            # Question sur une relation
            source, target = extracted_info
            result = self._find_relation(source, target, json_data)
            if result:
                return {
                    'answer': result['answer'],
                    'source_type': 'json_relation',
                    'confidence': 0.9,
                    'json_path': result['path'],
                    'json_data': result['data']
                }

        elif question_type == 'attribute_of':
            # Question du type "quel est X de Y?" (ex: "quel est le dosage du produit S 6490")
            attribute, entity = extracted_info
            result = self._find_attribute_relation(attribute, entity, json_data)
            if result:
                return {
                    'answer': result['answer'],
                    'source_type': 'relation_json',
                    'confidence': 0.9,
                    'json_path': result['path'],
                    'json_data': result['data']
                }

        return None

    def _analyze_question(
        self,
        original_question: str,
        normalized_question: str
    ) -> Tuple[str, Any]:
        """
        Analyse la question pour déterminer son type et extraire les informations
        """
        # Pattern: "quel est X de/du Y?" (ex: "quel est le dosage du produit S 6490")
        match = re.search(self.question_patterns['attribute_of'], normalized_question, re.IGNORECASE)
        if match:
            attribute = match.group(1).strip()
            entity = match.group(2).strip()
            return 'attribute_of', (attribute, entity)

        # Pattern: "quelle est la valeur de X?"
        match = re.search(self.question_patterns['value_of'], normalized_question, re.IGNORECASE)
        if match:
            field_name = match.group(1).strip()
            return 'value_of', field_name

        # Pattern: "qu'est-ce que X?"
        match = re.search(self.question_patterns['what_is'], normalized_question, re.IGNORECASE)
        if match:
            entity = match.group(1).strip()
            return 'entity_value', entity

        # Pattern: "relation entre X et Y"
        match = re.search(self.question_patterns['relation'], normalized_question, re.IGNORECASE)
        if match:
            source = match.group(1).strip()
            target = match.group(2).strip()
            return 'relation', (source, target)

        # Pattern: "liste des X"
        match = re.search(self.question_patterns['list'], normalized_question, re.IGNORECASE)
        if match:
            entity_type = match.group(1).strip()
            return 'entity_value', entity_type

        return 'unknown', None

    def _find_field_value(
        self,
        field_name: str,
        json_data: Dict[str, Any],
        path: str = ''
    ) -> Optional[Dict[str, Any]]:
        """
        Cherche la valeur d'un champ dans le JSON
        """
        normalized_field = self._normalize_text(field_name)

        # Recherche récursive dans le JSON
        def search_recursive(data, current_path=''):
            if isinstance(data, dict):
                for key, value in data.items():
                    normalized_key = self._normalize_text(key)
                    new_path = f"{current_path}.{key}" if current_path else key

                    # Correspondance exacte ou partielle
                    if normalized_field in normalized_key or normalized_key in normalized_field:
                        if isinstance(value, (str, int, float, bool)):
                            return {
                                'value': str(value),
                                'path': new_path,
                                'data': {key: value}
                            }
                        elif isinstance(value, list) and value:
                            return {
                                'value': ', '.join(str(v) for v in value[:5]),
                                'path': new_path,
                                'data': {key: value}
                            }

                    # Continuer la recherche récursive
                    result = search_recursive(value, new_path)
                    if result:
                        return result

            elif isinstance(data, list):
                for i, item in enumerate(data):
                    result = search_recursive(item, f"{current_path}[{i}]")
                    if result:
                        return result

            return None

        return search_recursive(json_data)

    def _find_entity_values(
        self,
        entity_type: str,
        json_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Cherche les valeurs d'un type d'entité
        Compatible avec le format global_annotations_json (clés directes par type)
        """
        normalized_type = self._normalize_text(entity_type)

        # Format 1: Chercher dans entities (si existe)
        entities = json_data.get('entities', {})
        if entities:
            for key, values in entities.items():
                normalized_key = self._normalize_text(key)
                if normalized_type in normalized_key or normalized_key in normalized_type:
                    if isinstance(values, list):
                        # Extraire les valeurs
                        extracted_values = []
                        for item in values:
                            if isinstance(item, str):
                                extracted_values.append(item)
                            elif isinstance(item, dict):
                                extracted_values.append(item.get('value', str(item)))

                        if extracted_values:
                            answer = ', '.join(extracted_values[:5])
                            if len(extracted_values) > 5:
                                answer += f" (et {len(extracted_values) - 5} autres)"

                            return {
                                'answer': answer,
                                'path': f'entities.{key}',
                                'data': {key: values}
                            }

        # Format 2: Chercher directement dans les clés (format global_annotations_json)
        # Ex: {"Dosage": ["5 mg", "92 mg"], "Ingredient": [...]}
        for key, values in json_data.items():
            # Ignorer les clés spéciales
            if key in ['relations', 'metadata', 'entities']:
                continue

            normalized_key = self._normalize_text(key)
            if normalized_type in normalized_key or normalized_key in normalized_type:
                if isinstance(values, list):
                    # Extraire les valeurs
                    extracted_values = []
                    for item in values:
                        if isinstance(item, str):
                            extracted_values.append(item)
                        elif isinstance(item, dict):
                            # Peut contenir 'text', 'value', ou autres clés
                            value = item.get('text') or item.get('value') or str(item)
                            extracted_values.append(value)

                    if extracted_values:
                        answer = ', '.join(extracted_values[:10])
                        if len(extracted_values) > 10:
                            answer += f" (et {len(extracted_values) - 10} autres)"

                        return {
                            'answer': answer,
                            'path': f'{key}',
                            'data': {key: values}
                        }

        return None

    def _find_relation(
        self,
        source: str,
        target: str,
        json_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Cherche une relation entre deux entités
        """
        relations = json_data.get('relations', [])

        normalized_source = self._normalize_text(source)
        normalized_target = self._normalize_text(target)

        for i, rel in enumerate(relations):
            if not isinstance(rel, dict):
                continue

            rel_source = self._normalize_text(str(rel.get('source', {}).get('value', '')))
            rel_target = self._normalize_text(str(rel.get('target', {}).get('value', '')))

            if (normalized_source in rel_source or rel_source in normalized_source) and \
               (normalized_target in rel_target or rel_target in normalized_target):

                relation_type = rel.get('type', 'relation')
                description = rel.get('description', f"{source} {relation_type} {target}")

                return {
                    'answer': description,
                    'path': f'relations[{i}]',
                    'data': rel
                }

        return None

    def _find_attribute_relation(
        self,
        attribute: str,
        entity: str,
        json_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Cherche un attribut d'une entité via les relations
        Ex: "quel est le dosage du produit S 6490"

        Cherche dans les relations où:
        - source = entity (S 6490)
        - target.type ou relation.type contient attribute (dosage)
        """
        relations = json_data.get('relations', [])

        normalized_entity = self._normalize_text(entity)
        normalized_attribute = self._normalize_text(attribute)

        # Collecter toutes les relations correspondantes
        matching_relations = []

        for i, rel in enumerate(relations):
            if not isinstance(rel, dict):
                continue

            # Récupérer source et target
            rel_source = self._normalize_text(str(rel.get('source', {}).get('value', '')))
            rel_target_value = str(rel.get('target', {}).get('value', ''))
            rel_target_type = self._normalize_text(str(rel.get('target', {}).get('type', '')))
            rel_type = self._normalize_text(str(rel.get('type', '')))

            # Vérifier si l'entité correspond à la source
            entity_matches = normalized_entity in rel_source or rel_source in normalized_entity

            # Vérifier si l'attribut correspond au type de la cible ou au type de relation
            attribute_matches = (
                normalized_attribute in rel_target_type or
                normalized_attribute in rel_type or
                rel_target_type in normalized_attribute or
                rel_type in normalized_attribute
            )

            if entity_matches and attribute_matches:
                matching_relations.append({
                    'index': i,
                    'relation': rel,
                    'target_value': rel_target_value
                })

        # Si des relations trouvées, retourner la première
        if matching_relations:
            first_match = matching_relations[0]
            rel = first_match['relation']

            source_value = rel.get('source', {}).get('value', '')
            target_value = first_match['target_value']
            relation_type = rel.get('type', 'a pour')

            # Construire une réponse descriptive
            answer = f"Le {attribute} de {entity} est : {target_value}"

            # Si plusieurs résultats, les ajouter
            if len(matching_relations) > 1:
                other_values = [m['target_value'] for m in matching_relations[1:]]
                answer += f" (autres valeurs possibles: {', '.join(other_values)})"

            return {
                'answer': answer,
                'path': f'relations[{first_match["index"]}]',
                'data': rel
            }

        return None

    def _get_document_json(self, document: RawDocument) -> Optional[Dict[str, Any]]:
        """
        Récupère le JSON du document
        Utilise global_annotations_json qui contient les entités et relations
        """
        try:
            # Utiliser le JSON global des annotations
            if hasattr(document, 'global_annotations_json') and document.global_annotations_json:
                return document.global_annotations_json

            return None
        except Exception:
            return None

    def _normalize_text(self, text: str) -> str:
        """
        Normalise le texte pour la comparaison
        - Minuscules
        - Sans accents
        - Sans ponctuation excessive
        """
        if not text:
            return ""

        # Minuscules
        text = text.lower()

        # Supprimer les accents
        text = ''.join(
            c for c in unicodedata.normalize('NFD', text)
            if unicodedata.category(c) != 'Mn'
        )

        # Supprimer la ponctuation excessive (garder les espaces et lettres)
        text = re.sub(r'[^\w\s]', ' ', text)

        # Normaliser les espaces
        text = ' '.join(text.split())

        return text

    def _extract_keywords(self, text: str) -> set:
        """
        Extrait les mots-clés importants d'un texte
        """
        # Mots vides à ignorer
        stop_words = {
            'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du',
            'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car',
            'est', 'sont', 'a', 'ont', 'quel', 'quelle', 'quels', 'quelles',
            'ce', 'cette', 'ces', 'cet', 'dans', 'pour', 'par', 'sur'
        }

        words = text.split()
        keywords = {w for w in words if len(w) > 2 and w not in stop_words}

        return keywords

    def get_qa_statistics(self, document: Optional[RawDocument] = None) -> Dict[str, Any]:
        """
        Obtient des statistiques sur les Q&A validées
        """
        queryset = ValidatedQA.objects.filter(is_active=True)

        if document:
            queryset = queryset.filter(Q(document=document) | Q(is_global=True))

        total_qa = queryset.count()
        avg_confidence = queryset.aggregate(avg=Avg('confidence_score'))['avg'] or 0
        total_usage = queryset.aggregate(total=Sum('usage_count'))['total'] or 0
        total_corrections = queryset.aggregate(total=Sum('correction_count'))['total'] or 0

        return {
            'total_qa': total_qa,
            'average_confidence': round(avg_confidence, 2),
            'total_usage': total_usage,
            'total_corrections': total_corrections,
            'correction_rate': round(total_corrections / total_qa, 2) if total_qa > 0 else 0
        }
