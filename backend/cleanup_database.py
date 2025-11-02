#!/usr/bin/env python
"""
Script pour supprimer TOUS les documents et annotations de la base de données
ATTENTION: Cette opération est IRRÉVERSIBLE !

Usage:
    python cleanup_database.py

Ce script supprime:
- Tous les documents (RawDocument)
- Toutes les pages de documents (DocumentPage)
- Toutes les annotations (Annotation)

"""

import os
import sys
import django

# Configuration Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'MyProject.settings')
django.setup()

from rawdocs.models import RawDocument, DocumentPage, Annotation



def cleanup_all_data():
    """Supprime toutes les données de la base de données"""

    print("🚨 ATTENTION: Cette opération va supprimer TOUTES les données !")
    print("   - Tous les documents")
    print("   - Toutes les pages")
    print("   - Toutes les annotations")

    print()

    # Demander confirmation
    confirmation = input("Êtes-vous sûr de vouloir continuer ? (tapez 'OUI' pour confirmer): ")

    if confirmation != 'OUI':
        print("❌ Opération annulée.")
        return

    try:
        # Compter les éléments avant suppression
        documents_count = RawDocument.objects.count()
        pages_count = DocumentPage.objects.count()
        annotations_count = Annotation.objects.count()


        print(f"\n📊 Éléments à supprimer:")
        print(f"   - Documents: {documents_count}")
        print(f"   - Pages: {pages_count}")
        print(f"   - Annotations: {annotations_count}")

        print()

        # Dernière confirmation
        final_confirmation = input("Dernière chance ! Tapez 'SUPPRIMER' pour confirmer: ")

        if final_confirmation != 'SUPPRIMER':
            print("❌ Opération annulée.")
            return

        print("\n🔄 Suppression en cours...")



        # Supprimer toutes les annotations
        if annotations_count > 0:
            Annotation.objects.all().delete()
            print(f"✅ Supprimé {annotations_count} annotations")

        # Supprimer toutes les pages de documents
        if pages_count > 0:
            DocumentPage.objects.all().delete()
            print(f"✅ Supprimé {pages_count} pages de documents")

        # Supprimer tous les documents
        if documents_count > 0:
            RawDocument.objects.all().delete()
            print(f"✅ Supprimé {documents_count} documents")

        print("\n🎉 Base de données nettoyée avec succès !")
        print("   La base de données est maintenant vide.")

    except Exception as e:
        print(f"\n❌ Erreur lors du nettoyage: {e}")
        return False

    return True


if __name__ == "__main__":
    print("=" * 60)
    print("🧹 NETTOYAGE COMPLET DE LA BASE DE DONNÉES")
    print("=" * 60)

    cleanup_all_data()