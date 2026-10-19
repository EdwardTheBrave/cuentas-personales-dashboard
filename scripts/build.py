#!/usr/bin/env python3
"""Une plantilla + modelo + configuración y genera el dashboard.

Por defecto escribe en dist/:
  dist/dashboard.html  página completa para abrir en el navegador (modo local)
  dist/artifact.html   el mismo contenido sin <html>/<head>, para publicar como artifact de Claude

Opciones:
  --config RUTA     configuración (por defecto config.local.js si existe, si no config.example.js)
  --inline-libs     incrusta SheetJS y ECharts (desde node_modules) para que funcione sin internet
  --with-assets     incrusta el Excel de ejemplo y la plantilla (botones «Probar con datos de ejemplo»
                    y «Descargar plantilla»)
  --out-dir RUTA    carpeta de salida (por defecto dist/)
"""
import argparse, base64, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIBS = {
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js': 'node_modules/xlsx/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js': 'node_modules/echarts/dist/echarts.min.js',
}


def b64(path):
    return base64.b64encode((ROOT / path).read_bytes()).decode('ascii')


def build(config=None, inline_libs=False, with_assets=False, out_dir=None):
    cfg_path = Path(config) if config else (ROOT / 'config.local.js' if (ROOT / 'config.local.js').exists() else ROOT / 'config.example.js')
    cfg = cfg_path.read_text(encoding='utf8')
    m = re.search(r"title:\s*'([^']*)'", cfg)
    title = (m.group(1) if m else 'Cuentas Personales').replace('<', '').replace('>', '')

    page = (ROOT / 'src/app.html').read_text(encoding='utf8')
    model = (ROOT / 'src/model.js').read_text(encoding='utf8') + '\n' + (ROOT / 'src/agent.js').read_text(encoding='utf8')
    for marker in ('/*__ASSETS__*/', '/*__CONFIG__*/', '/*__MODEL__*/', '__TITLE__'):
        if marker not in page:
            sys.exit(f'Falta el marcador {marker} en src/app.html')
    assets = ''
    if with_assets:
        assets = ('window.CP_ASSETS = {sample: "%s", template: "%s"};'
                  % (b64('sample/ejemplo-cuentas.xlsx'), b64('sample/plantilla-cuentas.xlsx')))
    page = (page.replace('/*__ASSETS__*/', assets).replace('/*__CONFIG__*/', cfg)
                .replace('/*__MODEL__*/', model).replace('__TITLE__', title))
    if inline_libs:
        for url, local in LIBS.items():
            tag = f'<script src="{url}"></script>'
            if tag not in page:
                sys.exit(f'No encuentro la etiqueta de {url} en src/app.html')
            code = (ROOT / local).read_text(encoding='utf8').replace('</script', '<\\/script')
            page = page.replace(tag, '<script>' + code + '</script>')

    dist = Path(out_dir) if out_dir else ROOT / 'dist'
    dist.mkdir(parents=True, exist_ok=True)
    (dist / 'artifact.html').write_text(page, encoding='utf8')
    standalone = ('<!doctype html>\n<html lang="es"><head><meta charset="utf-8">'
                  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
                  '<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n'
                  + page + '\n</body></html>\n')
    (dist / 'dashboard.html').write_text(standalone, encoding='utf8')
    print(f'Config: {cfg_path.name}{" + librerías incrustadas" if inline_libs else ""}{" + ejemplo y plantilla" if with_assets else ""} -> {dist}')
    return dist


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--config')
    ap.add_argument('--inline-libs', action='store_true')
    ap.add_argument('--with-assets', action='store_true')
    ap.add_argument('--out-dir')
    a = ap.parse_args()
    build(a.config, a.inline_libs, a.with_assets, a.out_dir)
