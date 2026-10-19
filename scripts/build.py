#!/usr/bin/env python3
"""Une plantilla + modelo + configuración y genera dos ficheros en dist/:

  dist/dashboard.html  página completa para abrir en el navegador (modo local)
  dist/artifact.html   el mismo contenido sin <html>/<head>, para publicar como artifact de Claude

Uso: python3 scripts/build.py [--config ruta/a/config.js]
Por defecto usa config.local.js si existe y, si no, config.example.js.
"""
import argparse, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config')
    args = ap.parse_args()
    cfg_path = Path(args.config) if args.config else (ROOT / 'config.local.js' if (ROOT / 'config.local.js').exists() else ROOT / 'config.example.js')
    cfg = cfg_path.read_text(encoding='utf8')
    m = re.search(r"title:\s*'([^']*)'", cfg)
    title = (m.group(1) if m else 'Cuentas Personales').replace('<', '').replace('>', '')

    page = (ROOT / 'src/app.html').read_text(encoding='utf8')
    model = (ROOT / 'src/model.js').read_text(encoding='utf8')
    for marker in ('/*__CONFIG__*/', '/*__MODEL__*/', '__TITLE__'):
        if marker not in page:
            sys.exit(f'Falta el marcador {marker} en src/app.html')
    page = page.replace('/*__CONFIG__*/', cfg).replace('/*__MODEL__*/', model).replace('__TITLE__', title)

    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    (dist / 'artifact.html').write_text(page, encoding='utf8')
    standalone = ('<!doctype html>\n<html lang="es"><head><meta charset="utf-8">'
                  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
                  '<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n'
                  + page + '\n</body></html>\n')
    (dist / 'dashboard.html').write_text(standalone, encoding='utf8')
    print(f'Config: {cfg_path.name} -> dist/dashboard.html y dist/artifact.html')


if __name__ == '__main__':
    main()
