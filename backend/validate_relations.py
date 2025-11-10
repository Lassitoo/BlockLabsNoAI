#!/usr/bin/env python
"""Script pour valider automatiquement les relations du document 12"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'MyProject.settings')
django.setup()

from rawdocs.models import RawDocument, AnnotationRelationship, Annotation
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone

User = get_user_model()

# Document à traiter
doc_id = 12

try:
    doc = RawDocument.objects.get(id=doc_id)
    print(f"Document {doc_id}: {doc.title}")

    # Récupérer un utilisateur expert
    expert_user = User.objects.filter(is_staff=True).first()
    if not expert_user:
        expert_user = User.objects.first()

    print(f"Utilisateur: {expert_user.username}")

    # Récupérer les annotations du document
    page_ids = doc.pages.values_list('id', flat=True)
    annotation_ids = Annotation.objects.filter(page_id__in=page_ids).values_list('id', flat=True)

    # Chercher les relations NON validées
    non_validated = AnnotationRelationship.objects.filter(
        Q(source_annotation_id__in=annotation_ids) | Q(target_annotation_id__in=annotation_ids),
        is_validated=False
    )

    print(f"\nRelations à valider: {non_validated.count()}\n")

    # Valider chaque relation
    for rel in non_validated:
        print(f"Validation de la relation {rel.id}:")
        print(f"  {rel.source_annotation.annotation_type.display_name} '{rel.source_annotation.selected_text}'")
        print(f"  → {rel.relationship_name} →")
        print(f"  {rel.target_annotation.annotation_type.display_name} '{rel.target_annotation.selected_text}'")

        # Marquer comme validée
        rel.is_validated = True
        rel.validated_by = expert_user
        rel.validated_at = timezone.now()
        rel.save()

        print(f"  ✅ Validée\n")

        # Synchroniser automatiquement dans le JSON
        from expert.json_sync_service import JsonSyncService
        result = JsonSyncService.sync_single_relation(rel, expert_user)
        if result.get('success'):
            print(f"  ✅ Synchronisée dans le JSON\n")
        else:
            print(f"  ⚠️  Erreur sync: {result.get('error')}\n")

    print(f"\n✅ Terminé ! {non_validated.count()} relations validées")

    # Vérifier le JSON final
    doc.refresh_from_db()
    if doc.global_annotations_json:
        relations = doc.global_annotations_json.get('relations', [])
        print(f"Relations dans le JSON: {len(relations)}")
        for r in relations:
            print(f"  - {r['source']['value']} → {r['target']['value']}")

except RawDocument.DoesNotExist:
    print(f"❌ Document {doc_id} n'existe pas")
