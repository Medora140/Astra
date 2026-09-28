import os
from datetime import datetime

from text_extract_api.files.storage_strategies.storage_strategy import StorageStrategy

def resolve_path(path):
    return os.path.abspath(os.path.expanduser(path))


class LocalFilesystemStorageStrategy(StorageStrategy):
    def __init__(self, context):
        super().__init__(context)
        self.base_directory = resolve_path(self.context['settings']['root_path'])
        self.create_subfolders = self.context['settings'].get('create_subfolders', False)
        self.subfolder_names_format = self.context['settings'].get('subfolder_names_format', '')
        os.makedirs(self.base_directory, exist_ok=True)

    def _sanitize_and_resolve(self, filename):
        # Check for path traversal patterns before processing
        if '..' in filename or filename.startswith('/') or '\\' in filename:
            raise ValueError("Path traversal detected")
        
        name = os.path.basename(filename)
        full_path = os.path.abspath(os.path.join(self._get_subfolder_path(name), name))
        
        # Additional check to ensure the resolved path is within base directory
        if not full_path.startswith(self.base_directory):
            raise ValueError("Path traversal detected")
        return full_path

    def _get_subfolder_path(self, file_name):
        if not self.subfolder_names_format:
            return self.base_directory
        return os.path.join(self.base_directory, self.format_file_name(file_name, self.subfolder_names_format))

    def save(self, file_name, dest_file_name, content):
        file_name = self.format_file_name(file_name, dest_file_name)
        path = self._sanitize_and_resolve(file_name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding="utf-8") as file:
            file.write(content)

    def load(self, file_name):
        path = self._sanitize_and_resolve(file_name)
        with open(path, 'r') as file:
            return file.read()

    def list(self):
        return [
            os.path.relpath(os.path.join(root, f), self.base_directory)
            for root, _, files in os.walk(self.base_directory)
            for f in files
        ]

    def delete(self, file_name):
        os.remove(self._sanitize_and_resolve(file_name))
