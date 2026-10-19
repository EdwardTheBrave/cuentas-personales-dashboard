#!/usr/bin/env python3
"""Genera entrega/: el kit para alguien sin conocimientos técnicos.

  entrega/Cuentas-Personales.html   panel completo en un solo archivo, sin internet ni instalación
  entrega/Plantilla-Cuentas.xlsx    hoja vacía con la estructura de partida
  entrega/Ejemplo-con-datos.xlsx    datos inventados para probar
  entrega/LEEME.html                instrucciones en lenguaje llano

Usa siempre config.example.js: el kit nunca lleva tu ID de Sheet ni tus grupos.
Uso: python3 scripts/package.py
"""
import shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from build import build  # noqa: E402

OUT = ROOT / 'entrega'


def main():
    for lib in ('node_modules/xlsx/dist/xlsx.full.min.js', 'node_modules/echarts/dist/echarts.min.js'):
        if not (ROOT / lib).exists():
            sys.exit('Faltan las librerías: ejecuta primero «npm install».')
    subprocess.run(['node', 'scripts/make-template.mjs'], cwd=ROOT, check=True)
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    with tempfile.TemporaryDirectory() as tmp:
        build(config=str(ROOT / 'config.example.js'), inline_libs=True, with_assets=True, out_dir=tmp)
        shutil.copy(Path(tmp) / 'dashboard.html', OUT / 'Cuentas-Personales.html')
    shutil.copy(ROOT / 'sample/plantilla-cuentas.xlsx', OUT / 'Plantilla-Cuentas.xlsx')
    shutil.copy(ROOT / 'sample/ejemplo-cuentas.xlsx', OUT / 'Ejemplo-con-datos.xlsx')
    shutil.copy(ROOT / 'docs/LEEME.html', OUT / 'LEEME.html')
    for f in sorted(OUT.iterdir()):
        print(f'  {f.name:28} {f.stat().st_size / 1024:8.0f} KB')
    print('Kit listo en entrega/. Compártelo comprimido (clic derecho → Comprimir).')


if __name__ == '__main__':
    main()
