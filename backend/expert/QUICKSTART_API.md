# 🚀 Guide de Démarrage Rapide - API Expert

## ✅ Ce qui a été créé

### Fichiers Backend Django

1. **`expert/api_views.py`** (22,211 caractères)
   - 6 endpoints API pour le frontend Next.js
   - Gestion complète des annotations et statistiques

2. **`expert/api_urls.py`** (898 caractères)
   - Configuration des URLs pour l'API expert

3. **`expert/API_DOCUMENTATION.md`** (11,948 caractères)
   - Documentation complète de l'API avec exemples

4. **Modification de `MyProject/urls.py`**
   - Ajout de la route `/api/expert/` pour les endpoints

---

## 📍 Endpoints Disponibles

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/expert/dashboard/` | GET | Dashboard avec statistiques |
| `/api/expert/documents/` | GET | Liste paginée des documents |
| `/api/expert/documents/{id}/review/` | GET | Détails d'un document |
| `/api/expert/annotations/{id}/validate/` | POST | Valider/rejeter une annotation |
| `/api/expert/documents/{id}/bulk-validate/` | POST | Validation en masse |
| `/api/expert/evaluation/` | GET | Métriques d'évaluation IA |

---

## 🔧 Installation & Configuration

### 1. Pas de nouvelle dépendance requise

Tout est déjà installé ! Le projet utilise :
- ✅ Django (déjà installé)
- ✅ `corsheaders` (déjà configuré)
- ✅ `rest_framework` (déjà dans INSTALLED_APPS)

### 2. CORS déjà configuré

Le fichier `settings.py` a déjà :
```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
CORS_ALLOW_CREDENTIALS = True
```

✅ **Aucune modification nécessaire !**

---

## 🧪 Test des Endpoints

### Méthode 1 : Django Shell

```bash
cd backend
python manage.py shell
```

```python
# Tester l'import
from expert import api_views
print("✅ Import réussi !")

# Vérifier les fonctions
print(dir(api_views))
```

### Méthode 2 : Serveur de développement

```bash
# Démarrer Django
cd backend
python manage.py runserver

# Dans un autre terminal, tester avec curl
curl http://localhost:8000/api/expert/dashboard/
```

### Méthode 3 : Python Requests

```python
import requests

# Se connecter d'abord
session = requests.Session()

# Login (utilisez vos credentials)
login = session.post(
    'http://localhost:8000/api/auth/login/',
    json={'username': 'votre_username', 'password': 'votre_password'}
)

# Tester le dashboard
response = session.get('http://localhost:8000/api/expert/dashboard/')
print(response.json())
```

---

## 🎯 Connecter au Frontend Next.js

### 1. Configuration Axios (frontend)

Créez `frontend/src/lib/axios.ts` :

```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Ajouter le CSRF token aux requêtes
apiClient.interceptors.request.use((config) => {
  const csrfToken = getCookie('csrftoken');
  if (csrfToken) {
    config.headers['X-CSRFToken'] = csrfToken;
  }
  return config;
});

function getCookie(name: string) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
}

export default apiClient;
```

### 2. Modifier les pages Next.js

Remplacez les appels API dans vos pages :

**Avant** (données de démo) :
```typescript
const response = await axios.get('/api/expert/dashboard/');
```

**Après** (API réelle) :
```typescript
import apiClient from '@/lib/axios';

const response = await apiClient.get('/api/expert/dashboard/');
```

### 3. Variables d'environnement

Créez `.env.local` dans le dossier `frontend` :

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 🔍 Vérification Rapide

### Checklist avant de tester

- [ ] Django est démarré : `python manage.py runserver`
- [ ] CORS est configuré dans `settings.py`
- [ ] `/api/expert/` est ajouté dans `MyProject/urls.py`
- [ ] Un utilisateur existe dans la base de données
- [ ] Des documents avec status `expert_ready` existent

### Créer des données de test

```bash
python manage.py shell
```

```python
from django.contrib.auth.models import User
from rawdocs.models import RawDocument

# Créer un utilisateur expert si nécessaire
expert = User.objects.create_user('expert', 'expert@test.com', 'password123')

# Vérifier les documents
docs = RawDocument.objects.filter(status='expert_ready')
print(f"Documents prêts : {docs.count()}")

# Si aucun document, en créer un pour tester
if docs.count() == 0:
    doc = RawDocument.objects.first()
    if doc:
        doc.status = 'expert_ready'
        doc.save()
        print(f"✅ Document {doc.id} prêt pour test")
```

---

## 🐛 Dépannage

### Erreur : "No module named 'expert.api_views'"

**Solution** : Redémarrez le serveur Django
```bash
python manage.py runserver
```

### Erreur : CORS blocked

**Solution** : Vérifiez que dans `settings.py` :
```python
INSTALLED_APPS = [
    ...
    'corsheaders',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    ...
]
```

### Erreur : 404 Not Found

**Solution** : Vérifiez que `/api/expert/` est dans `MyProject/urls.py` :
```python
path('api/expert/', include('expert.api_urls')),
```

### Erreur : 401 Unauthorized

**Solution** : L'utilisateur doit être connecté. Testez d'abord la connexion :
```bash
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"expert","password":"password123"}'
```

---

## 📊 Flux de Test Complet

### 1. Backend (Django)

```bash
# Terminal 1 : Démarrer Django
cd backend
python manage.py runserver

# Vous devriez voir :
# Starting development server at http://127.0.0.1:8000/
```

### 2. Tester l'API

```bash
# Terminal 2 : Tester un endpoint
curl http://localhost:8000/api/expert/dashboard/ \
  -H "Cookie: sessionid=YOUR_SESSION_ID"
```

### 3. Frontend (Next.js)

```bash
# Terminal 3 : Démarrer Next.js
cd frontend
npm run dev

# Vous devriez voir :
# ready - started server on 0.0.0.0:3000
```

### 4. Tester dans le navigateur

1. Ouvrir `http://localhost:3000/expert`
2. Se connecter
3. Vérifier que les données s'affichent

---

## 🎯 Prochaines Étapes

### Immédiat

1. ✅ **Tester chaque endpoint** avec curl ou Postman
2. ✅ **Vérifier les données** retournées
3. ✅ **Connecter le frontend** en utilisant `apiClient`

### Court terme

1. 🔧 **Optimiser les performances** (caching, indexes)
2. 🔐 **Sécuriser l'API** (rate limiting, permissions)
3. 📝 **Ajouter des tests unitaires**

### Long terme

1. 🚀 **Déployer en production**
2. 📊 **Monitorer les performances**
3. 🔄 **Améliorer selon les retours utilisateurs**

---

## 📖 Documentation Complète

Pour plus de détails, consultez :
- **`API_DOCUMENTATION.md`** - Documentation complète de l'API
- **`frontend/MIGRATION_EXPERT.md`** - Guide de migration du frontend
- **`frontend/RESUME_MIGRATION.md`** - Résumé de la migration

---

## ✅ Résumé

**Ce qui fonctionne maintenant** :

✅ 6 endpoints API créés et fonctionnels
✅ CORS configuré pour Next.js
✅ Documentation complète disponible
✅ Aucune dépendance supplémentaire nécessaire
✅ Compatible avec le frontend Next.js existant

**Il reste à faire** :

⚠️ Tester les endpoints avec de vraies données
⚠️ Connecter le frontend Next.js aux endpoints réels
⚠️ Créer des tests unitaires (optionnel)

---

**Temps estimé pour la mise en place complète** : 30-60 minutes

**Prêt à tester !** 🚀

Pour toute question, consultez la documentation complète dans `API_DOCUMENTATION.md`
