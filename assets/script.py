import pandas as pd
import os
import json # Import json module although pandas handles the direct conversion

def convert_xlsx_to_json(xlsx_path, json_path):
    """
    Lee la primera hoja de un archivo XLSX y la guarda como un archivo JSON
    en la misma carpeta.
    """
    try:
        print(f"Intentando convertir: '{os.path.basename(xlsx_path)}'...")
        # Lee la primera hoja del archivo Excel.
        df = pd.read_excel(xlsx_path, engine='openpyxl')

        # Convierte el DataFrame a JSON y guárdalo
        df.to_json(json_path, orient='records', date_format='iso', indent=4, force_ascii=False)

        print(f"  -> Éxito: '{os.path.basename(json_path)}' creado.")
        return True

    except FileNotFoundError:
        print(f"  -> Error: No se encontró el archivo '{os.path.basename(xlsx_path)}'.")
    except ImportError:
         print("Error Crítico: Necesitas instalar pandas y openpyxl. Ejecuta: pip install pandas openpyxl")
         # Salir si faltan dependencias críticas
         exit()
    except Exception as e:
        print(f"  -> Error durante la conversión de '{os.path.basename(xlsx_path)}': {e}")
    return False

def convert_all_xlsx_in_current_dir():
    """
    Busca todos los archivos .xlsx en el directorio actual (donde se ejecuta el script)
    y los convierte a .json en ese mismo directorio.
    """
    current_dir = os.getcwd() # Obtiene el directorio actual donde se ejecuta el script
    print(f"Buscando archivos .xlsx y guardando JSON en: '{current_dir}'")
    found_files = False
    converted_count = 0

    for filename in os.listdir(current_dir):
        # Comprueba si el archivo termina en .xlsx (ignorando mayúsculas/minúsculas)
        if filename.lower().endswith(".xlsx"):
            found_files = True
            xlsx_path = os.path.join(current_dir, filename) # Ruta completa al XLSX

            # Crea el nombre del archivo de salida .json
            base_name = os.path.splitext(filename)[0]
            json_filename = base_name + ".json"
            json_path = os.path.join(current_dir, json_filename) # Ruta completa al JSON (en el mismo directorio)

            # Llama a la función de conversión
            if convert_xlsx_to_json(xlsx_path, json_path):
                converted_count += 1

    if not found_files:
        print("No se encontraron archivos .xlsx en este directorio.")
    else:
        print(f"\nConversión completada. {converted_count} archivo(s) convertido(s).")

if __name__ == "__main__":
    convert_all_xlsx_in_current_dir()
    # input("Presiona Enter para salir...") # Descomenta si quieres que espere antes de cerrar