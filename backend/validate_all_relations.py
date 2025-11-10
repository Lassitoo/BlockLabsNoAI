#!/usr/bin/env python
"""Script pour valider automatiquement les relations NON validées de TOUS les documents"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'MyProject.settings')
django.setup()

from rawdocs.models import RawDocument, AnnotationRelationship, Annotation
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone

User = get_user_model()

def validate_document_relations(doc, expert_user):
    """Valide toutes les relations non validées d'un document"""
    # Récupérer les annotations du document
    page_ids = doc.pages.values_list('id', flat=True)
    annotation_ids = Annotation.objects.filter(page_id__in=page_ids).values_list('id', flat=True)

    # Chercher les relations NON validées
    non_validated = AnnotationRelationship.objects.filter(
        Q(source_annotation_id__in=annotation_ids) | Q(target_annotation_id__in=annotation_ids),
        is_validated=False
    )

    if non_validated.count() == 0:
        return 0

    print(f"\n📄 Document {doc.id}: {doc.title}")
    print(f"   Relations à valider: {non_validated.count()}")

    # Valider chaque relation
    validated_count = 0
    for rel in non_validated:
        print(f"\n   Validation de la relation {rel.id}:")
        print(f"     {rel.source_annotation.annotation_type.display_name} '{rel.source_annotation.selected_text}'")
        print(f"     → {rel.relationship_name} →")
        print(f"     {rel.target_annotation.annotation_type.display_name} '{rel.target_annotation.selected_text}'")

        # Marquer comme validée
        rel.is_validated = True
        rel.validated_by = expert_user
        rel.validated_at = timezone.now()
        rel.save()

        print(f"     ✅ Validée")

        # Synchroniser automatiquement dans le JSON
        from expert.json_sync_service import JsonSyncService
        result = JsonSyncService.sync_single_relation(rel, expert_user)
        if result.get('success'):
            print(f"     ✅ Synchronisée dans le JSON")
        else:
            print(f"     ⚠️  Erreur sync: {result.get('error')}")

        validated_count += 1

    return validated_count


def main():
    """Fonction principale"""
    print("=" * 70)
    print("VALIDATION AUTOMATIQUE DE TOUTES LES RELATIONS NON VALIDÉES")
    print("=" * 70)

    # Récupérer un utilisateur expert
    expert_user = User.objects.filter(is_staff=True).first()
    if not expert_user:
        expert_user = User.objects.first()

    print(f"\nUtilisateur: {expert_user.username}")

    # Récupérer tous les documents
    documents = RawDocument.objects.all().order_by('id')
    print(f"Total de documents: {documents.count()}\n")

    total_validated = 0
    docs_with_relations = 0

    for doc in documents:
        # Vérifier si le document a des relations non validées
        page_ids = doc.pages.values_list('id', flat=True)
        annotation_ids = Annotation.objects.filter(page_id__in=page_ids).values_list('id', flat=True)

        non_validated = AnnotationRelationship.objects.filter(
            Q(source_annotation_id__in=annotation_ids) | Q(target_annotation_id__in=annotation_ids),
            is_validated=False
        )

        if non_validated.count() > 0:
            docs_with_relations += 1
            validated = validate_document_relations(doc, expert_user)
            total_validated += validated

            # Vérifier le JSON final
            doc.refresh_from_db()
            if doc.global_annotations_json:
                relations = doc.global_annotations_json.get('relations', [])
                print(f"   📊 Relations dans le JSON: {len(relations)}")

    print("\n" + "=" * 70)
    print(f"✅ TERMINÉ !")
    print(f"   Documents traités: {docs_with_relations}")
    print(f"   Relations validées: {total_validated}")
    print("=" * 70)

    # Résumé final
    print("\n📊 RÉSUMÉ PAR DOCUMENT:")
    for doc in documents:
        page_ids = doc.pages.values_list('id', flat=True)
        annotation_ids = Annotation.objects.filter(page_id__in=page_ids).values_list('id', flat=True)

        all_relations = AnnotationRelationship.objects.filter(
            Q(source_annotation_id__in=annotation_ids) | Q(target_annotation_id__in=annotation_ids)
        )

        validated = all_relations.filter(is_validated=True).count()

        if all_relations.count() > 0:
            json_relations = 0
            if doc.global_annotations_json:
                json_relations = len(doc.global_annotations_json.get('relations', []))

            print(f"\n   Doc {doc.id}: {doc.title[:50]}")
            print(f"      Relations validées: {validated}/{all_relations.count()}")
            print(f"      Dans JSON: {json_relations}")


if __name__ == '__main__':
    main()
