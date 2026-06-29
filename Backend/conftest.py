import os
import sys

# Make the Backend package importable from tests/ regardless of pytest's rootdir,
# so `import agreement`, `import ir_parser`, etc. resolve without installing the app.
sys.path.insert(0, os.path.dirname(__file__))

# auth.py fails closed if JWT_SECRET is unset (correct for prod). Provide a throwaway
# one for the test process so importing auth-dependent modules doesn't explode.
os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret-not-for-prod")
