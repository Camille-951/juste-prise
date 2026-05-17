# JustePrise

Outil de calcul d'observance thérapeutique destiné aux professionnels de santé.

Permet de saisir une posologie, des dates de dispensation et de retour, puis calcule automatiquement l'observance par dosage et l'observance globale pondérée, avec un calendrier visuel des prises.

---

## Fonctionnalités

- **Posologie** : définition de plusieurs dosages (mg/unité + nb d'unités/jour)
- **Rythme continu ou discontinu** : en mode discontinu, jusqu'à 5 séquences traitement/pause enchaînées et répétées cycliquement
- **Calcul d'observance par dosage** : `(dispensées − retournées) / (unités/jour × jours de traitement)`
- **Observance globale pondérée** : `Σ(dose × unités consommées) / Σ(dose × unités théoriques)`
- **Calendrier des prises** : visualisation mois par mois avec distinction jours de prise / jours de pause
- **Date de début de cycle** : optionnelle, permet de caler le rythme discontinu sur un cycle déjà entamé

---

## Déploiement (GitHub Pages)

```bash
ng deploy --base-href=/juste-prise/
```
