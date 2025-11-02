#!/usr/bin/env python
"""
Script de test pour vérifier le document ID 28
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'MyProject.settings')
django.setup()

from rawdocs.models import RawDocument, DocumentPage, Annotation

# Vérifier le document
try:
    doc = RawDocument.objects.get(id=28)
    print(f"[OK] Document trouve: {doc.title}")
    print(f"   - is_ready_for_expert: {doc.is_ready_for_expert}")
    print(f"   - expert_ready_at: {doc.expert_ready_at}")
    print(f"   - Total pages: {doc.pages.count()}")
    
    # Verifier les pages validees
    validated_pages = doc.pages.filter(is_validated_by_human=True)
    print(f"   - Pages validees: {validated_pages.count()}")
    
    # Verifier les annotations
    all_annotations = Annotation.objects.filter(page__document=doc)
    print(f"   - Total annotations: {all_annotations.count()}")
    
    pending_annotations = all_annotations.filter(is_validated=False)
    print(f"   - Annotations en attente: {pending_annotations.count()}")
    
    if pending_annotations.exists():
        print("\n[ANNOTATIONS] Annotations en attente:")
        for ann in pending_annotations[:5]:  # Afficher les 5 premieres
            text_preview = ann.selected_text[:50] if ann.selected_text else 'N/A'
            print(f"   - ID {ann.id}: '{text_preview}...' (Page {ann.page.page_number})")
            print(f"     Type: {ann.annotation_type.display_name if ann.annotation_type else 'N/A'}")
    
    # Si le document n'est pas pret pour l'expert, le marquer
    if not doc.is_ready_for_expert and validated_pages.exists():
        print("\n[WARNING] Le document a des pages validees mais n'est pas marque comme pret pour l'expert")
        print("   Marquage automatique...")
        # Pour l'instant, on le marque automatiquement
        from django.utils import timezone
        doc.is_ready_for_expert = True
        doc.expert_ready_at = timezone.now()
        doc.save()
        print("   [OK] Document marque comme pret pour l'expert")
    
except RawDocument.DoesNotExist:
    print(f"[ERROR] Document avec ID 28 non trouve")
    print("\n[INFO] Documents disponibles:")
    docs = RawDocument.objects.all()[:10]
    for d in docs:
        print(f"   - ID {d.id}: {d.title or 'Sans titre'}")
