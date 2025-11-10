# expert/json_sync_service.py
"""
Service de Synchronisation Automatique du JSON Enrichi
Synchronise automatiquement le JSON quand les relations sont validées
Pour que l'assistant Q&A (sans IA) puisse retrouver les informations
"""

from typing import Dict, List, Any, Optional
from django.utils import timezone
from django.db.models import Q

from rawdocs.models import RawDocument, Annotation, AnnotationRelationship


class JsonSyncService:
    """
    Service pour synchroniser automatiquement le JSON enrichi
    avec les relations et entités validées par les experts
    """

    @staticmethod
    def sync_document_json(document: RawDocument, user) -> Dict[str, Any]:
        """
        Synchronise les relations validées dans le global_annotations_json
        Ajoute un champ 'relations' dans le JSON existant

        Args:
            document: Document à synchroniser
            user: Utilisateur qui effectue la synchronisation

        Returns:
            Dict avec les statistiques de synchronisation
        """
        # Récupérer toutes les pages du document
        page_ids = document.pages.values_list('id', flat=True)

        # Récupérer toutes les annotations du document
        annotation_ids = Annotation.objects.filter(
            page_id__in=page_ids
        ).values_list('id', flat=True)

        # Récupérer toutes les relations validées
        validated_relations = AnnotationRelationship.objects.filter(
            Q(source_annotation_id__in=annotation_ids) |
            Q(target_annotation_id__in=annotation_ids),
            is_validated=True
        ).select_related(
            'source_annotation__annotation_type',
            'target_annotation__annotation_type'
        )

        # Utiliser le global_annotations_json existant
        global_json = document.global_annotations_json or {}

        # Construire les relations
        relations_list = []
        for rel in validated_relations:
            relations_list.append({
                'id': rel.id,
                'type': rel.relationship_name,
                'source': {
                    'type': rel.source_annotation.annotation_type.display_name,
                    'value': rel.source_annotation.selected_text,
                    'annotation_id': rel.source_annotation.id,
                    'page': rel.source_annotation.page.page_number
                },
                'target': {
                    'type': rel.target_annotation.annotation_type.display_name,
                    'value': rel.target_annotation.selected_text,
                    'annotation_id': rel.target_annotation.id,
                    'page': rel.target_annotation.page.page_number
                },
                'description': rel.description or '',
                'validated': True,
                'validated_at': rel.validated_at.isoformat() if rel.validated_at else None,
                'validated_by': rel.validated_by.username if rel.validated_by else None
            })

        # Ajouter les relations dans le JSON global
        global_json['relations'] = relations_list

        # Ajouter les métadonnées de synchronisation
        if 'metadata' not in global_json:
            global_json['metadata'] = {}

        global_json['metadata'].update({
            'total_relations': len(relations_list),
            'last_synced': timezone.now().isoformat(),
            'synced_by': user.username
        })

        # Sauvegarder le document
        document.global_annotations_json = global_json
        document.save(update_fields=['global_annotations_json'])

        # Retourner les statistiques
        entity_types = list(global_json.keys()) if global_json else []
        entity_types = [k for k in entity_types if k not in ['relations', 'metadata']]

        return {
            'success': True,
            'total_relations': len(relations_list),
            'entity_types': entity_types,
            'synced_at': global_json['metadata']['last_synced']
        }

    @staticmethod
    def sync_single_relation(relationship: AnnotationRelationship, user) -> Dict[str, Any]:
        """
        Ajoute/met à jour une seule relation dans le global_annotations_json
        Appelé automatiquement quand une relation est validée

        Args:
            relationship: La relation à ajouter/mettre à jour
            user: Utilisateur qui valide la relation

        Returns:
            Dict avec le résultat de la synchronisation
        """
        try:
            # Récupérer le document via la source annotation
            document = relationship.source_annotation.page.document

            # Récupérer ou initialiser le global_annotations_json
            global_json = document.global_annotations_json or {}

            # Initialiser les structures si nécessaire
            if 'relations' not in global_json:
                global_json['relations'] = []
            if 'metadata' not in global_json:
                global_json['metadata'] = {}

            # Créer l'objet relation
            relation_obj = {
                'id': relationship.id,
                'type': relationship.relationship_name,
                'source': {
                    'type': relationship.source_annotation.annotation_type.display_name,
                    'value': relationship.source_annotation.selected_text,
                    'annotation_id': relationship.source_annotation.id,
                    'page': relationship.source_annotation.page.page_number
                },
                'target': {
                    'type': relationship.target_annotation.annotation_type.display_name,
                    'value': relationship.target_annotation.selected_text,
                    'annotation_id': relationship.target_annotation.id,
                    'page': relationship.target_annotation.page.page_number
                },
                'description': relationship.description or '',
                'validated': relationship.is_validated,
                'validated_at': relationship.validated_at.isoformat() if relationship.validated_at else None,
                'validated_by': relationship.validated_by.username if relationship.validated_by else None
            }

            # Vérifier si la relation existe déjà dans le JSON
            existing_index = None
            for i, rel in enumerate(global_json['relations']):
                if rel.get('id') == relationship.id:
                    existing_index = i
                    break

            # Ajouter ou mettre à jour la relation
            if existing_index is not None:
                global_json['relations'][existing_index] = relation_obj
            else:
                global_json['relations'].append(relation_obj)

            # Mettre à jour les métadonnées
            global_json['metadata']['last_synced'] = timezone.now().isoformat()
            global_json['metadata']['synced_by'] = user.username
            global_json['metadata']['total_relations'] = len(global_json['relations'])

            # Sauvegarder le document
            document.global_annotations_json = global_json
            document.save(update_fields=['global_annotations_json'])

            return {
                'success': True,
                'relation_id': relationship.id,
                'synced_at': global_json['metadata']['last_synced']
            }

        except Exception as e:
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def sync_validated_qa(document: RawDocument, user) -> Dict[str, Any]:
        """
        Synchronise les Q&A validées dans le global_annotations_json

        Args:
            document: Document à synchroniser
            user: Utilisateur qui effectue la synchronisation

        Returns:
            Dict avec les statistiques de synchronisation
        """
        from expert.models import ValidatedQA

        try:
            # Récupérer ou initialiser le global_annotations_json
            global_json = document.global_annotations_json or {}

            # Récupérer toutes les Q&A validées pour ce document
            validated_qa_list = ValidatedQA.objects.filter(
                Q(document=document) | Q(is_global=True),
                is_active=True
            ).order_by('-confidence_score', '-usage_count')

            # Construire la liste des Q&A
            qa_data = []
            for qa in validated_qa_list:
                qa_data.append({
                    'id': qa.id,
                    'question': qa.question,
                    'question_normalized': qa.question_normalized,
                    'answer': qa.answer,
                    'source_type': qa.source_type,
                    'json_path': qa.json_path,
                    'confidence': qa.confidence_score,
                    'usage_count': qa.usage_count,
                    'correction_count': qa.correction_count,
                    'corrections': qa.previous_answers,  # Historique des corrections
                    'validated_by': qa.validated_by.username if qa.validated_by else None,
                    'validated_at': qa.validated_at.isoformat() if qa.validated_at else None,
                    'tags': qa.tags,
                    'is_global': qa.is_global
                })

            # Ajouter les Q&A dans le JSON global
            global_json['validated_qa'] = qa_data

            # Ajouter les métadonnées
            if 'metadata' not in global_json:
                global_json['metadata'] = {}

            global_json['metadata']['total_validated_qa'] = len(qa_data)
            global_json['metadata']['last_qa_sync'] = timezone.now().isoformat()

            # Sauvegarder le document
            document.global_annotations_json = global_json
            document.save(update_fields=['global_annotations_json'])

            return {
                'success': True,
                'total_qa': len(qa_data),
                'synced_at': global_json['metadata']['last_qa_sync']
            }

        except Exception as e:
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def sync_single_qa(qa: 'ValidatedQA', user) -> Dict[str, Any]:
        """
        Ajoute/met à jour une seule Q&A dans le global_annotations_json
        Appelé automatiquement quand une Q&A est validée ou corrigée

        Args:
            qa: La Q&A à ajouter/mettre à jour
            user: Utilisateur qui valide/corrige la Q&A

        Returns:
            Dict avec le résultat de la synchronisation
        """
        try:
            # Récupérer le document (peut être None si Q&A globale)
            document = qa.document
            if not document:
                # Pour les Q&A globales, il faudrait synchroniser tous les documents
                # Pour l'instant on skip
                return {
                    'success': True,
                    'message': 'Q&A globale - pas de synchronisation automatique'
                }

            # Récupérer ou initialiser le global_annotations_json
            global_json = document.global_annotations_json or {}

            # Initialiser les structures si nécessaire
            if 'validated_qa' not in global_json:
                global_json['validated_qa'] = []
            if 'metadata' not in global_json:
                global_json['metadata'] = {}

            # Créer l'objet Q&A
            qa_obj = {
                'id': qa.id,
                'question': qa.question,
                'question_normalized': qa.question_normalized,
                'answer': qa.answer,
                'source_type': qa.source_type,
                'json_path': qa.json_path,
                'confidence': qa.confidence_score,
                'usage_count': qa.usage_count,
                'correction_count': qa.correction_count,
                'corrections': qa.previous_answers,
                'validated_by': qa.validated_by.username if qa.validated_by else None,
                'validated_at': qa.validated_at.isoformat() if qa.validated_at else None,
                'tags': qa.tags,
                'is_global': qa.is_global
            }

            # Vérifier si la Q&A existe déjà dans le JSON
            existing_index = None
            for i, existing_qa in enumerate(global_json['validated_qa']):
                if existing_qa.get('id') == qa.id:
                    existing_index = i
                    break

            # Ajouter ou mettre à jour la Q&A
            if existing_index is not None:
                global_json['validated_qa'][existing_index] = qa_obj
            else:
                global_json['validated_qa'].append(qa_obj)

            # Mettre à jour les métadonnées
            global_json['metadata']['last_qa_sync'] = timezone.now().isoformat()
            global_json['metadata']['total_validated_qa'] = len(global_json['validated_qa'])

            # Sauvegarder le document
            document.global_annotations_json = global_json
            document.save(update_fields=['global_annotations_json'])

            return {
                'success': True,
                'qa_id': qa.id,
                'synced_at': global_json['metadata']['last_qa_sync']
            }

        except Exception as e:
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }

    @staticmethod
    def _sync_entity_to_json(entities_dict: Dict, annotation: Annotation):
        """
        Ajoute ou met à jour une entité dans le dictionnaire d'entités

        Args:
            entities_dict: Dictionnaire des entités groupées par type
            annotation: Annotation à ajouter
        """
        entity_type = annotation.annotation_type.display_name

        if entity_type not in entities_dict:
            entities_dict[entity_type] = []

        # Vérifier si l'entité existe déjà
        existing_entity = None
        for entity in entities_dict[entity_type]:
            if entity.get('annotation_id') == annotation.id:
                existing_entity = entity
                break

        # Créer l'objet entité
        entity_obj = {
            'value': annotation.selected_text,
            'annotation_id': annotation.id,
            'page': annotation.page.page_number,
            'confidence': annotation.confidence_score if hasattr(annotation, 'confidence_score') else 1.0,
            'validated': True
        }

        # Ajouter les métadonnées si disponibles
        if hasattr(annotation, 'metadata') and annotation.metadata:
            entity_obj.update(annotation.metadata)

        # Ajouter ou mettre à jour
        if existing_entity:
            existing_entity.update(entity_obj)
        else:
            entities_dict[entity_type].append(entity_obj)

    @staticmethod
    def get_sync_status(document: RawDocument) -> Dict[str, Any]:
        """
        Obtient le statut de synchronisation du global_annotations_json

        Args:
            document: Document à vérifier

        Returns:
            Dict avec le statut de synchronisation
        """
        # Compter les relations en base de données
        page_ids = document.pages.values_list('id', flat=True)
        annotation_ids = Annotation.objects.filter(page_id__in=page_ids).values_list('id', flat=True)

        db_relations_count = AnnotationRelationship.objects.filter(
            Q(source_annotation_id__in=annotation_ids) |
            Q(target_annotation_id__in=annotation_ids),
            is_validated=True
        ).count()

        # Compter les relations dans le JSON
        global_json = document.global_annotations_json or {}
        
        # S'assurer que global_json est un dict
        if isinstance(global_json, str):
            try:
                global_json = json.loads(global_json)
            except:
                global_json = {}
        
        json_relations_count = len(global_json.get('relations', []))
        total_entities = sum(len(entities) for entities in global_json.get('entities', {}).values()) if isinstance(global_json.get('entities'), dict) else 0

        # Déterminer si une synchronisation est nécessaire
        needs_sync = db_relations_count != json_relations_count

        # Récupérer les métadonnées de sync
        metadata = global_json.get('metadata', {})

        return {
            'is_synced': not needs_sync,
            'db_relations_count': db_relations_count,
            'json_relations_count': json_relations_count,
            'needs_sync': needs_sync,
            'last_synced': metadata.get('last_synced'),
            'synced_by': metadata.get('synced_by'),
            'total_relations': metadata.get('total_relations', 0),
            'total_entities': total_entities
        }

    @staticmethod
    def remove_relation_from_json(relationship: AnnotationRelationship, user) -> Dict[str, Any]:
        """
        Supprime une relation du global_annotations_json
        Appelé quand une relation est supprimée ou invalidée

        Args:
            relationship: La relation à supprimer
            user: Utilisateur qui effectue l'action

        Returns:
            Dict avec le résultat
        """
        try:
            document = relationship.source_annotation.page.document
            global_json = document.global_annotations_json or {}

            if 'relations' not in global_json:
                return {'success': True, 'message': 'Aucune relation à supprimer'}

            # Filtrer la relation à supprimer
            original_count = len(global_json['relations'])
            global_json['relations'] = [
                rel for rel in global_json['relations']
                if rel.get('id') != relationship.id
            ]
            new_count = len(global_json['relations'])

            # Mettre à jour les métadonnées
            if 'metadata' not in global_json:
                global_json['metadata'] = {}

            global_json['metadata']['last_synced'] = timezone.now().isoformat()
            global_json['metadata']['synced_by'] = user.username
            global_json['metadata']['total_relations'] = new_count

            # Sauvegarder
            document.global_annotations_json = global_json
            document.save(update_fields=['global_annotations_json'])

            return {
                'success': True,
                'removed': original_count - new_count,
                'synced_at': global_json['metadata']['last_synced']
            }

        except Exception as e:
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e)
            }
