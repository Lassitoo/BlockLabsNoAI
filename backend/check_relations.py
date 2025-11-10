#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'MyProject.settings')
django.setup()

from rawdocs.models import RawDocument, AnnotationRelationship, Annotation
from django.db.models import Q

# Vérifier document 12
doc_id = 12
try:
    doc = RawDocument.objects.get(id=doc_id)
    print(f"Document {doc_id}: {doc.title}")

    # Récupérer les IDs des annotations du document
    page_ids = doc.pages.values_list('id', flat=True)
    annotation_ids = Annotation.objects.filter(page_id__in=page_ids).values_list('id', flat=True)
    print(f"Annotations du document: {len(list(annotation_ids))}")

    # Chercher TOUTES les relations (validées ou non)
    all_relations = AnnotationRelationship.objects.filter(
        Q(source_annotation_id__in=annotation_ids) | Q(target_annotation_id__in=annotation_ids)
    )

    validated_relations = all_relations.filter(is_validated=True)
    non_validated = all_relations.filter(is_validated=False)

    print(f"\nRelations TOTALES: {all_relations.count()}")
    print(f"Relations validées: {validated_relations.count()}")
    print(f"Relations NON validées: {non_validated.count()}")

    # Afficher les relations NON validées
    if non_validated.count() > 0:
        print(f"\n⚠️  RELATIONS NON VALIDÉES:")
        for rel in non_validated[:5]:
            print(f"\n  Relation {rel.id}:")
            print(f"    Type: {rel.relationship_name}")
            print(f"    Source: {rel.source_annotation.annotation_type.display_name} = '{rel.source_annotation.selected_text}'")
            print(f"    Target: {rel.target_annotation.annotation_type.display_name} = '{rel.target_annotation.selected_text}'")
            print(f"    Description: {rel.description}")
            print(f"    is_validated: {rel.is_validated}")

    # Afficher les relations validées
    if validated_relations.count() > 0:
        print(f"\n✅ RELATIONS VALIDÉES:")
        for rel in validated_relations[:5]:
            print(f"\n  Relation {rel.id}:")
            print(f"    Type: {rel.relationship_name}")
            print(f"    Source: {rel.source_annotation.annotation_type.display_name} = '{rel.source_annotation.selected_text}'")
            print(f"    Target: {rel.target_annotation.annotation_type.display_name} = '{rel.target_annotation.selected_text}'")
            print(f"    Description: {rel.description}")
            print(f"    Validé par: {rel.validated_by.username if rel.validated_by else 'N/A'}")

    # Vérifier JSON actuel
    print(f"\n\nJSON actuel du document:")
    if doc.global_annotations_json:
        relations = doc.global_annotations_json.get('relations', [])
        print(f"  Relations dans JSON: {len(relations)}")
    else:
        print("  Pas de JSON")

except RawDocument.DoesNotExist:
    print(f"Document {doc_id} n'existe pas")
