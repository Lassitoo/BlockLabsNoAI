# expert/relationship_qa_service.py
"""
Service pour gérer les relations via Questions-Réponses
Permet de créer, modifier et valider des relations via l'assistant
"""

import re
from typing import Dict, List, Any, Optional, Tuple
from django.utils import timezone
from django.db.models import Q

from rawdocs.models import RawDocument, Annotation, AnnotationRelationship, AnnotationType
from expert.models import ValidatedQA
from expert.intelligent_qa_service import IntelligentQAService


class RelationshipQAService:
    """
    Service pour gérer les relations via l'assistant Q&A
    Permet de poser des questions comme :
    - "Créer une relation entre Product et Substance"
    - "Quelle est la relation entre X et Y?"
    - "Modifier la relation entre A et B"
    """

    def __init__(self):
        self.qa_service = IntelligentQAService()

        # Patterns de questions sur les relations
        self.relation_patterns = {
            'create': r'(?:créer|ajouter|créé)\s+(?:une\s+)?relation\s+entre\s+(.+?)\s+et\s+(.+)',
            'query': r'(?:quelle\s+est\s+la\s+)?relation\s+entre\s+(.+?)\s+et\s+(.+)',
            'modify': r'(?:modifier|changer|mettre\s+à\s+jour)\s+(?:la\s+)?relation\s+entre\s+(.+?)\s+et\s+(.+)',
            'delete': r'(?:supprimer|effacer|retirer)\s+(?:la\s+)?relation\s+entre\s+(.+?)\s+et\s+(.+)',
            'list': r'(?:liste|lister|quelles\s+sont)\s+(?:les\s+)?relations?\s+(?:de|pour|avec)?\s*(.+)?',
        }

    def process_relationship_question(
        self,
        question: str,
        document: RawDocument,
        user,
        context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Traite une question sur les relations

        Args:
            question: Question posée
            document: Document concerné
            user: Utilisateur qui pose la question
            context: Contexte additionnel (annotations sélectionnées, etc.)

        Returns:
            Dict avec la réponse et les actions suggérées
        """
        normalized_question = self.qa_service._normalize_text(question)

        # Détecter le type de question
        question_type, extracted_info = self._analyze_relationship_question(normalized_question)

        if question_type == 'create':
            return self._handle_create_relation(extracted_info, document, user, context)

        elif question_type == 'query':
            return self._handle_query_relation(extracted_info, document, user)

        elif question_type == 'modify':
            return self._handle_modify_relation(extracted_info, document, user, context)

        elif question_type == 'delete':
            return self._handle_delete_relation(extracted_info, document, user)

        elif question_type == 'list':
            return self._handle_list_relations(extracted_info, document, user)

        else:
            # Question non reconnue comme relation, utiliser le service Q&A standard
            return self.qa_service.ask_question(question, document, user)

    def _analyze_relationship_question(self, normalized_question: str) -> Tuple[str, Any]:
        """Analyse la question pour déterminer le type d'action sur les relations"""

        # Créer une relation
        match = re.search(self.relation_patterns['create'], normalized_question, re.IGNORECASE)
        if match:
            source = match.group(1).strip()
            target = match.group(2).strip()
            return 'create', {'source': source, 'target': target}

        # Modifier une relation
        match = re.search(self.relation_patterns['modify'], normalized_question, re.IGNORECASE)
        if match:
            source = match.group(1).strip()
            target = match.group(2).strip()
            return 'modify', {'source': source, 'target': target}

        # Supprimer une relation
        match = re.search(self.relation_patterns['delete'], normalized_question, re.IGNORECASE)
        if match:
            source = match.group(1).strip()
            target = match.group(2).strip()
            return 'delete', {'source': source, 'target': target}

        # Lister les relations
        match = re.search(self.relation_patterns['list'], normalized_question, re.IGNORECASE)
        if match:
            entity = match.group(1).strip() if match.group(1) else None
            return 'list', {'entity': entity}

        # Requête sur une relation
        match = re.search(self.relation_patterns['query'], normalized_question, re.IGNORECASE)
        if match:
            source = match.group(1).strip()
            target = match.group(2).strip()
            return 'query', {'source': source, 'target': target}

        return 'unknown', None

    def _handle_create_relation(
        self,
        info: Dict[str, str],
        document: RawDocument,
        user,
        context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Gère la création d'une relation"""

        source_text = info['source']
        target_text = info['target']

        # Chercher les annotations correspondantes
        source_annotations = self._find_annotations_by_text(source_text, document)
        target_annotations = self._find_annotations_by_text(target_text, document)

        if not source_annotations:
            return {
                'success': False,
                'answer': f"Je n'ai pas trouvé d'annotation pour '{source_text}'",
                'action': 'create_annotation_first',
                'suggestions': {
                    'text': source_text,
                    'message': f"Voulez-vous créer une annotation pour '{source_text}' ?"
                }
            }

        if not target_annotations:
            return {
                'success': False,
                'answer': f"Je n'ai pas trouvé d'annotation pour '{target_text}'",
                'action': 'create_annotation_first',
                'suggestions': {
                    'text': target_text,
                    'message': f"Voulez-vous créer une annotation pour '{target_text}' ?"
                }
            }

        # Si plusieurs annotations trouvées, demander de préciser
        if len(source_annotations) > 1 or len(target_annotations) > 1:
            return {
                'success': False,
                'answer': "Plusieurs annotations correspondent. Veuillez préciser.",
                'action': 'select_annotations',
                'suggestions': {
                    'source_options': [
                        {
                            'id': ann.id,
                            'text': ann.selected_text,
                            'type': ann.annotation_type.display_name,
                            'page': ann.page.page_number
                        }
                        for ann in source_annotations
                    ],
                    'target_options': [
                        {
                            'id': ann.id,
                            'text': ann.selected_text,
                            'type': ann.annotation_type.display_name,
                            'page': ann.page.page_number
                        }
                        for ann in target_annotations
                    ]
                }
            }

        # Créer la relation
        source_ann = source_annotations[0]
        target_ann = target_annotations[0]

        # Suggérer un nom de relation basé sur les types
        suggested_name = self._suggest_relationship_name(source_ann, target_ann)

        return {
            'success': True,
            'answer': f"Prêt à créer une relation entre '{source_ann.selected_text}' et '{target_ann.selected_text}'",
            'action': 'confirm_create_relation',
            'suggestions': {
                'source_annotation_id': source_ann.id,
                'target_annotation_id': target_ann.id,
                'suggested_relationship_name': suggested_name,
                'source': {
                    'id': source_ann.id,
                    'text': source_ann.selected_text,
                    'type': source_ann.annotation_type.display_name
                },
                'target': {
                    'id': target_ann.id,
                    'text': target_ann.selected_text,
                    'type': target_ann.annotation_type.display_name
                },
                'message': f"Quel type de relation ? (suggestion: {suggested_name})"
            }
        }

    def _handle_query_relation(
        self,
        info: Dict[str, str],
        document: RawDocument,
        user
    ) -> Dict[str, Any]:
        """Gère la requête sur une relation existante"""

        source_text = info['source']
        target_text = info['target']

        # Chercher les annotations
        source_annotations = self._find_annotations_by_text(source_text, document)
        target_annotations = self._find_annotations_by_text(target_text, document)

        if not source_annotations or not target_annotations:
            return {
                'success': False,
                'answer': f"Je n'ai pas trouvé d'annotations pour '{source_text}' et/ou '{target_text}'",
                'action': 'not_found'
            }

        # Chercher les relations existantes
        relationships = []
        for source_ann in source_annotations:
            for target_ann in target_annotations:
                rels = AnnotationRelationship.objects.filter(
                    source_annotation=source_ann,
                    target_annotation=target_ann
                )
                relationships.extend(rels)

        if not relationships:
            return {
                'success': False,
                'answer': f"Aucune relation trouvée entre '{source_text}' et '{target_text}'",
                'action': 'suggest_create',
                'suggestions': {
                    'message': "Voulez-vous créer une relation ?",
                    'source': source_text,
                    'target': target_text
                }
            }

        # Retourner les relations trouvées
        relations_list = []
        for rel in relationships:
            relations_list.append({
                'id': rel.id,
                'name': rel.relationship_name,
                'description': rel.description,
                'is_validated': rel.is_validated,
                'source': {
                    'text': rel.source_annotation.selected_text,
                    'type': rel.source_annotation.annotation_type.display_name
                },
                'target': {
                    'text': rel.target_annotation.selected_text,
                    'type': rel.target_annotation.annotation_type.display_name
                }
            })

        answer = f"J'ai trouvé {len(relations_list)} relation(s) :\n"
        for rel in relations_list:
            status = "✓ validée" if rel['is_validated'] else "⏳ en attente"
            answer += f"- {rel['name']} ({status})"
            if rel['description']:
                answer += f": {rel['description']}"
            answer += "\n"

        return {
            'success': True,
            'answer': answer.strip(),
            'action': 'show_relations',
            'relations': relations_list
        }

    def _handle_modify_relation(
        self,
        info: Dict[str, str],
        document: RawDocument,
        user,
        context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Gère la modification d'une relation"""

        source_text = info['source']
        target_text = info['target']

        # Chercher la relation existante
        source_annotations = self._find_annotations_by_text(source_text, document)
        target_annotations = self._find_annotations_by_text(target_text, document)

        if not source_annotations or not target_annotations:
            return {
                'success': False,
                'answer': "Annotations non trouvées",
                'action': 'not_found'
            }

        # Chercher les relations
        relationships = []
        for source_ann in source_annotations:
            for target_ann in target_annotations:
                rels = AnnotationRelationship.objects.filter(
                    source_annotation=source_ann,
                    target_annotation=target_ann
                )
                relationships.extend(rels)

        if not relationships:
            return {
                'success': False,
                'answer': f"Aucune relation à modifier entre '{source_text}' et '{target_text}'",
                'action': 'not_found'
            }

        # Si plusieurs relations, demander laquelle modifier
        if len(relationships) > 1:
            return {
                'success': False,
                'answer': "Plusieurs relations trouvées. Laquelle voulez-vous modifier ?",
                'action': 'select_relation',
                'relations': [
                    {
                        'id': rel.id,
                        'name': rel.relationship_name,
                        'description': rel.description
                    }
                    for rel in relationships
                ]
            }

        rel = relationships[0]
        return {
            'success': True,
            'answer': f"Prêt à modifier la relation '{rel.relationship_name}'",
            'action': 'confirm_modify_relation',
            'relation': {
                'id': rel.id,
                'current_name': rel.relationship_name,
                'current_description': rel.description,
                'message': "Quel est le nouveau nom/description ?"
            }
        }

    def _handle_delete_relation(
        self,
        info: Dict[str, str],
        document: RawDocument,
        user
    ) -> Dict[str, Any]:
        """Gère la suppression d'une relation"""

        source_text = info['source']
        target_text = info['target']

        # Chercher et supprimer la relation
        source_annotations = self._find_annotations_by_text(source_text, document)
        target_annotations = self._find_annotations_by_text(target_text, document)

        if not source_annotations or not target_annotations:
            return {
                'success': False,
                'answer': "Annotations non trouvées",
                'action': 'not_found'
            }

        relationships = []
        for source_ann in source_annotations:
            for target_ann in target_annotations:
                rels = AnnotationRelationship.objects.filter(
                    source_annotation=source_ann,
                    target_annotation=target_ann
                )
                relationships.extend(rels)

        if not relationships:
            return {
                'success': False,
                'answer': f"Aucune relation à supprimer entre '{source_text}' et '{target_text}'",
                'action': 'not_found'
            }

        return {
            'success': True,
            'answer': f"Prêt à supprimer {len(relationships)} relation(s)",
            'action': 'confirm_delete_relation',
            'relations': [
                {
                    'id': rel.id,
                    'name': rel.relationship_name,
                    'description': rel.description
                }
                for rel in relationships
            ]
        }

    def _handle_list_relations(
        self,
        info: Dict[str, Any],
        document: RawDocument,
        user
    ) -> Dict[str, Any]:
        """Liste toutes les relations (ou filtrées par entité)"""

        entity_filter = info.get('entity')

        # Récupérer toutes les relations du document
        page_ids = document.pages.values_list('id', flat=True)
        annotation_ids = Annotation.objects.filter(page_id__in=page_ids).values_list('id', flat=True)

        relationships = AnnotationRelationship.objects.filter(
            Q(source_annotation_id__in=annotation_ids) |
            Q(target_annotation_id__in=annotation_ids)
        ).select_related(
            'source_annotation__annotation_type',
            'target_annotation__annotation_type'
        )

        # Filtrer par entité si spécifié
        if entity_filter:
            relationships = relationships.filter(
                Q(source_annotation__selected_text__icontains=entity_filter) |
                Q(target_annotation__selected_text__icontains=entity_filter)
            )

        if not relationships.exists():
            return {
                'success': False,
                'answer': "Aucune relation trouvée",
                'action': 'empty_list'
            }

        relations_list = []
        for rel in relationships:
            relations_list.append({
                'id': rel.id,
                'name': rel.relationship_name,
                'description': rel.description,
                'is_validated': rel.is_validated,
                'source': {
                    'text': rel.source_annotation.selected_text,
                    'type': rel.source_annotation.annotation_type.display_name
                },
                'target': {
                    'text': rel.target_annotation.selected_text,
                    'type': rel.target_annotation.annotation_type.display_name
                }
            })

        answer = f"J'ai trouvé {len(relations_list)} relation(s) :\n"
        for rel in relations_list[:10]:  # Limiter à 10 pour l'affichage
            status = "✓" if rel['is_validated'] else "⏳"
            answer += f"{status} {rel['source']['text']} → {rel['name']} → {rel['target']['text']}\n"

        if len(relations_list) > 10:
            answer += f"\n... et {len(relations_list) - 10} autres"

        return {
            'success': True,
            'answer': answer.strip(),
            'action': 'show_relations_list',
            'relations': relations_list,
            'total': len(relations_list)
        }

    def _find_annotations_by_text(
        self,
        text: str,
        document: RawDocument
    ) -> List[Annotation]:
        """Trouve les annotations correspondant à un texte"""

        normalized_text = self.qa_service._normalize_text(text)

        # Récupérer toutes les annotations du document
        page_ids = document.pages.values_list('id', flat=True)
        annotations = Annotation.objects.filter(page_id__in=page_ids)

        # Chercher correspondance exacte ou partielle
        matching_annotations = []
        for ann in annotations:
            normalized_ann_text = self.qa_service._normalize_text(ann.selected_text)
            if normalized_text in normalized_ann_text or normalized_ann_text in normalized_text:
                matching_annotations.append(ann)

        return matching_annotations

    def _suggest_relationship_name(
        self,
        source_annotation: Annotation,
        target_annotation: Annotation
    ) -> str:
        """Suggère un nom de relation basé sur les types d'annotations"""

        source_type = source_annotation.annotation_type.display_name.lower()
        target_type = target_annotation.annotation_type.display_name.lower()

        # Règles de suggestion basées sur les types
        suggestions = {
            ('product', 'substance'): 'contains',
            ('product', 'manufacturer'): 'manufactured_by',
            ('substance', 'dosage'): 'has_dosage',
            ('product', 'indication'): 'indicated_for',
            ('substance', 'effect'): 'causes',
        }

        # Chercher une suggestion
        for (src, tgt), name in suggestions.items():
            if src in source_type and tgt in target_type:
                return name

        # Par défaut
        return 'related_to'
