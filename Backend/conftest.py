import os
import sys

# Make the Backend package importable from tests/ regardless of pytest's rootdir,
# so `import agreement`, `import ir_parser`, etc. resolve without installing the app.
sys.path.insert(0, os.path.dirname(__file__))
