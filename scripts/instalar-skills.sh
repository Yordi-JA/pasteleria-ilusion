#!/usr/bin/env bash
# Instala en .claude/skills/ las skills de diseño que se usaron para hacer el mockup.
# Uso (desde la raíz del repositorio):  bash scripts/instalar-skills.sh
# Cada skill es una carpeta con su SKILL.md; Claude Code las detecta solas al iniciar.
set -euo pipefail
REPOS=(
  "pbakaus/impeccable"                    # diseño de interfaces: color, tipografía, responsivo, revisión
  "miqdadbadjuber/anti-slop"              # evita los patrones genéricos de interfaz y redacción de IA
  "nextlevelbuilder/ui-ux-pro-max-skill"  # base de estilos, paletas y reglas de UX por industria
  "leonxlnx/taste-skill"                  # criterio visual
  "emilkowalski/skills"                   # animación e interacción
)
# Selección para este proyecto. Con --todas se instala todo lo que traen los repositorios.
SELECCION=" impeccable antislop antislop-ui antislop-copywriting antislop-human antislop-layoutmobile antislop-code ui-ux-pro-max taste-skill emil-design-eng review-animations break-ui mobile-native "
TODAS=0; [ "${1:-}" = "--todas" ] && TODAS=1
DEST=".claude/skills"; TMP="$(mktemp -d)"; mkdir -p "$DEST"
trap 'rm -rf "$TMP"' EXIT
for repo in "${REPOS[@]}"; do
  echo "→ $repo"
  git clone -q --depth 1 "https://github.com/$repo.git" "$TMP/${repo//\//_}"
  while IFS= read -r skill; do
    dir="$(dirname "$skill")"; name="$(basename "$dir")"
    [ "$name" = "${repo//\//_}" ] && name="$(basename "$repo")"
    if [ "$TODAS" = 0 ] && [[ "$SELECCION" != *" $name "* ]]; then continue; fi
    if [ -d "$DEST/$name" ]; then echo "   ya existe: $name"; continue; fi
    cp -R "$dir" "$DEST/$name"; echo "   instalada: $name"
  done < <(find "$TMP/${repo//\//_}" -name SKILL.md -not -path "*/node_modules/*" -not -path "*/.git/*" | sort)
done
echo "Listo. Skills en $DEST:"; ls -1 "$DEST"
